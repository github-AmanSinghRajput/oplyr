import crypto from 'node:crypto';
import {
  clearPendingApproval,
  createPendingApproval,
  getPendingApproval,
  getWorkspaceState,
  setLastDiff
} from '../../runtime.js';
import {
  collectGitDiff,
  collectGitDiffSince,
  decideWriteIntent,
  executeApprovedWrite,
  generateAssistantReply,
  revertProtectedGitChanges,
  revertWorkingTree,
  snapshotWorkingTree,
  streamAssistantReply
} from '../../assistant-client.js';
import { AppError } from '../../lib/errors.js';
import type {
  BaselineUntrackedSnapshot,
  ChatAttachment,
  ChatMessage,
  ChatSource,
  DiffSummary,
  PendingApproval
} from '../../types.js';
import { ApprovalRepository } from '../approvals/approval.repository.js';
import { ChatAttachmentRepository } from './chat-attachment.repository.js';
import { ChatRepository } from './chat.repository.js';
import { logger } from '../../lib/logger.js';

interface ReplyResult {
  type: 'reply';
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

interface ApprovalRequiredResult {
  type: 'approval_required';
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  pendingApproval: PendingApproval;
}

export type ChatTurnResult = ReplyResult | ApprovalRequiredResult;

interface ChatRuntimeAdapter {
  getWorkspaceState: typeof getWorkspaceState;
  getPendingApproval: typeof getPendingApproval;
  createPendingApproval: typeof createPendingApproval;
  clearPendingApproval: typeof clearPendingApproval;
  setLastDiff: typeof setLastDiff;
}

interface CodexCorrelationOptions {
  voiceTurnId?: string;
}

interface StreamTurnCallbacks {
  onStarted?: (payload: { userMessage: ChatMessage; assistantMessage: ChatMessage }) => void;
  onDelta?: (payload: { assistantMessage: ChatMessage }) => void;
  onActivity?: (payload: { activity: string }) => void;
}

interface ChatAssistantAdapter {
  collectGitDiff: typeof collectGitDiff;
  collectGitDiffSince?: typeof collectGitDiffSince;
  decideWriteIntent: typeof decideWriteIntent;
  executeApprovedWrite: typeof executeApprovedWrite;
  generateAssistantReply: typeof generateAssistantReply;
  revertProtectedGitChanges?: typeof revertProtectedGitChanges;
  snapshotWorkingTree?: typeof snapshotWorkingTree;
  revertWorkingTree?: typeof revertWorkingTree;
  streamAssistantReply: typeof streamAssistantReply;
}

const defaultRuntimeAdapter: ChatRuntimeAdapter = {
  getWorkspaceState,
  getPendingApproval,
  createPendingApproval,
  clearPendingApproval,
  setLastDiff
};

const defaultAssistantAdapter: ChatAssistantAdapter = {
  collectGitDiff,
  collectGitDiffSince,
  decideWriteIntent,
  executeApprovedWrite,
  generateAssistantReply,
  revertProtectedGitChanges,
  snapshotWorkingTree,
  revertWorkingTree,
  streamAssistantReply
};

export class ChatService {
  constructor(
    private readonly repository: ChatRepository = new ChatRepository(),
    private readonly approvalRepository: ApprovalRepository = new ApprovalRepository(),
    private readonly runtime: ChatRuntimeAdapter = defaultRuntimeAdapter,
    private readonly assistant: ChatAssistantAdapter = defaultAssistantAdapter,
    private readonly attachments: ChatAttachmentRepository = new ChatAttachmentRepository()
  ) {}

  private toChatMessage(
    role: ChatMessage['role'],
    text: string,
    source: ChatSource,
    attachments: ChatAttachment[] = []
  ): ChatMessage {
    return {
      id: crypto.randomUUID(),
      role,
      text,
      attachments,
      source,
      createdAt: new Date().toISOString()
    };
  }

  async processTurn(
    text: string,
    source: ChatSource,
    correlation?: CodexCorrelationOptions,
    attachmentIds: string[] = []
  ): Promise<ChatTurnResult> {
    const attachments = await this.attachments.listByIds(attachmentIds);
    const userMessage = this.toChatMessage('user', text, source, toPublicAttachments(attachments));
    return this.processTurnWithUserMessage(
      buildAssistantInput(text, attachments),
      source,
      userMessage,
      correlation
    );
  }

  async streamTurn(
    text: string,
    source: ChatSource,
    callbacks?: StreamTurnCallbacks,
    correlation?: CodexCorrelationOptions,
    signal?: AbortSignal,
    attachmentIds: string[] = []
  ): Promise<ChatTurnResult> {
    const workspace = this.runtime.getWorkspaceState();
    const history = await this.readConversationHistory();
    const attachments = await this.attachments.listByIds(attachmentIds);
    const userMessage = this.toChatMessage('user', text, source, toPublicAttachments(attachments));
    const assistantInput = buildAssistantInput(text, attachments);

    const writeLike = looksLikeWriteRequest(assistantInput);
    const willPropose = Boolean(workspace.writeAccessEnabled && workspace.projectRoot && writeLike);
    logger.info('chat.turn.routing', {
      source,
      writeAccessEnabled: workspace.writeAccessEnabled,
      hasProjectRoot: Boolean(workspace.projectRoot),
      looksLikeWrite: writeLike,
      path: willPropose ? 'write_intent' : 'reply'
    });

    if (willPropose) {
      const stubAssistant = this.toChatMessage('assistant', '', source);
      callbacks?.onStarted?.({ userMessage, assistantMessage: stubAssistant });
      return this.processTurnWithUserMessage(
        assistantInput,
        source,
        userMessage,
        correlation,
        history,
        workspace
      );
    }

    const assistantMessage = this.toChatMessage('assistant', '', source);
    callbacks?.onStarted?.({ userMessage, assistantMessage });

    const assistantReply = await this.assistant.streamAssistantReply(
      assistantInput,
      history,
      workspace,
      {
        signal,
        voiceTurnId: correlation?.voiceTurnId,
        onTextSnapshot: (snapshotText) => {
          assistantMessage.text = snapshotText;
          callbacks?.onDelta?.({
            assistantMessage: { ...assistantMessage }
          });
        },
        onActivityUpdate: (activity) => {
          callbacks?.onActivity?.({ activity });
        }
      }
    );

    assistantMessage.text = assistantReply.text;
    await this.persistMessages([userMessage, assistantMessage]);

    return {
      type: 'reply',
      userMessage,
      assistantMessage
    };
  }

  private async processTurnWithUserMessage(
    text: string,
    source: ChatSource,
    userMessage: ChatMessage,
    correlation?: CodexCorrelationOptions,
    existingHistory?: ChatMessage[],
    existingWorkspace?: ReturnType<ChatRuntimeAdapter['getWorkspaceState']>
  ): Promise<ChatTurnResult> {
    const workspace = existingWorkspace ?? this.runtime.getWorkspaceState();
    const history = existingHistory ?? (await this.readConversationHistory());

    if (!workspace.writeAccessEnabled || !workspace.projectRoot) {
      const assistantReply = await this.assistant.generateAssistantReply(
        text,
        history,
        workspace,
        correlation
      );
      const assistantMessage = this.toChatMessage('assistant', assistantReply.text, source);
      await this.persistMessages([userMessage, assistantMessage]);

      return {
        type: 'reply',
        userMessage,
        assistantMessage
      };
    }

    const decision = await this.assistant.decideWriteIntent(text, history, workspace, correlation);
    logger.info('chat.write_intent.decided', {
      source,
      intent: decision.intent,
      title: decision.intent === 'propose_write' ? (decision.proposal_title ?? null) : null
    });

    if (decision.intent === 'reply') {
      const assistantMessage = this.toChatMessage('assistant', decision.assistant_text, source);
      await this.persistMessages([userMessage, assistantMessage]);

      return {
        type: 'reply',
        userMessage,
        assistantMessage
      };
    }

    // Snapshot the working tree BEFORE applying, so a reject reverts ONLY the assistant's edits
    // (restored to this point) without disturbing the user's other uncommitted work.
    const baseline = await this.assistant.snapshotWorkingTree?.(workspace.projectRoot);
    const baselineRef = baseline?.ref ?? null;
    const baselineUntracked = baseline?.untracked ?? [];
    const baselineUntrackedSnapshots = baseline?.untrackedSnapshots ?? [];

    const approval = this.runtime.createPendingApproval({
      projectRoot: workspace.projectRoot,
      userRequest: text,
      title: decision.proposal_title || 'Approved coding task',
      summary: decision.proposal_summary || decision.assistant_text || '',
      tasks: Array.isArray(decision.tasks) ? decision.tasks : [],
      agents: Array.isArray(decision.agents) ? decision.agents : [],
      baselineRef,
      baselineUntracked,
      baselineUntrackedSnapshots
    });

    // Apply the change now (working tree only) so the user reviews the real diff before deciding.
    // Approve keeps it; reject reverts to the snapshot above.
    try {
      await this.assistant.executeApprovedWrite(approval, history, workspace, correlation);
    } catch (error) {
      if (baselineRef && this.assistant.revertWorkingTree) {
        const partial = await this.collectTurnDiff(
          workspace.projectRoot,
          baselineRef,
          baselineUntracked,
          baselineUntrackedSnapshots
        );
        await this.assistant.revertWorkingTree(
          workspace.projectRoot,
          baselineRef,
          partial.files.map((file) => ({ filePath: file.filePath, status: file.status })),
          baselineUntrackedSnapshots
        );
      }
      this.runtime.clearPendingApproval();
      this.runtime.setLastDiff(null);
      throw error;
    }

    let diff = await this.collectTurnDiff(
      workspace.projectRoot,
      baselineRef,
      baselineUntracked,
      baselineUntrackedSnapshots
    );
    if (diff.redactedFiles && diff.redactedFiles.length > 0) {
      await this.assistant.revertProtectedGitChanges?.(workspace.projectRoot, diff.redactedFiles);
      diff = await this.collectTurnDiff(
        workspace.projectRoot,
        baselineRef,
        baselineUntracked,
        baselineUntrackedSnapshots
      );
    }
    this.runtime.setLastDiff(diff);
    logger.info('chat.write_intent.applied', {
      source,
      title: approval.title,
      changedFiles: diff.files.length
    });

    const assistantMessage = this.toChatMessage('assistant', decision.assistant_text, source);
    await this.persistMessages([userMessage, assistantMessage]);

    return {
      type: 'approval_required',
      userMessage,
      assistantMessage,
      pendingApproval: approval
    };
  }

  // Diff scoped to a single assistant turn: only the changes since the pre-edit snapshot, so the
  // Review screen never shows the user's other uncommitted files. Falls back to the full diff when
  // there is no snapshot (e.g. tests, or a non-git workspace).
  private async collectTurnDiff(
    projectRoot: string,
    baselineRef: string | null,
    baselineUntracked: string[],
    baselineUntrackedSnapshots: BaselineUntrackedSnapshot[] = []
  ) {
    if (baselineRef && this.assistant.collectGitDiffSince) {
      return this.assistant.collectGitDiffSince(
        projectRoot,
        baselineRef,
        baselineUntracked,
        baselineUntrackedSnapshots
      );
    }
    return this.assistant.collectGitDiff(projectRoot);
  }

  async approvePending(approvalId: string) {
    const approval = this.runtime.getPendingApproval();
    if (!approval || approval.id !== approvalId) {
      return null;
    }

    const workspace = this.runtime.getWorkspaceState();
    if (!workspace.writeAccessEnabled || !workspace.projectRoot) {
      throw new AppError(
        403,
        'File changes are turned off for this workspace.',
        'WRITE_ACCESS_DISABLED'
      );
    }

    // The change was already applied to the working tree for review; approving simply keeps it.
    const diff = await this.collectTurnDiff(
      approval.projectRoot,
      approval.baselineRef ?? null,
      approval.baselineUntracked ?? [],
      approval.baselineUntrackedSnapshots ?? []
    );
    const assistantMessage = this.toChatMessage(
      'assistant',
      buildApprovalDecisionMessage('approved', approval.title, diff),
      'text'
    );
    await this.persistMessages([assistantMessage]);
    this.runtime.clearPendingApproval();
    this.runtime.setLastDiff(null);
    await this.approvalRepository.recordDecision({
      workspaceId: this.runtime.getWorkspaceState().id,
      conversationSessionId: await this.repository.getActiveSessionId(),
      taskTitle: approval.title,
      taskSummary: approval.summary,
      approved: true
    });

    return { assistantMessage, diff };
  }

  async rejectPending(approvalId: string, feedback?: string) {
    const approval = this.runtime.getPendingApproval();
    if (!approval || approval.id !== approvalId) {
      return null;
    }

    const trimmedFeedback = feedback?.trim();
    const workspace = this.runtime.getWorkspaceState();
    let appliedDiff: DiffSummary | null = null;

    // The proposed change was already applied for review — revert it back to the snapshot taken
    // before the edit, scoped to the assistant's files so the user's other work stays intact.
    if (workspace.projectRoot && approval.baselineRef && this.assistant.revertWorkingTree) {
      appliedDiff = await this.collectTurnDiff(
        workspace.projectRoot,
        approval.baselineRef,
        approval.baselineUntracked ?? [],
        approval.baselineUntrackedSnapshots ?? []
      );
      await this.assistant.revertWorkingTree(
        workspace.projectRoot,
        approval.baselineRef,
        appliedDiff.files.map((file) => ({ filePath: file.filePath, status: file.status })),
        approval.baselineUntrackedSnapshots ?? []
      );
    }

    const rejectionMessage = buildApprovalDecisionMessage(
      'rejected',
      approval.title,
      appliedDiff ?? { isGitRepo: Boolean(workspace.projectRoot), changedFiles: [], files: [] }
    );

    const assistantMessage = this.toChatMessage(
      'assistant',
      trimmedFeedback
        ? `${rejectionMessage}\n\nI'll revise based on your feedback.`
        : rejectionMessage,
      'text'
    );
    await this.persistMessages([assistantMessage]);
    this.runtime.clearPendingApproval();

    // The decision is complete, so the active review diff should disappear.
    this.runtime.setLastDiff(null);

    await this.approvalRepository.recordDecision({
      workspaceId: this.runtime.getWorkspaceState().id,
      conversationSessionId: await this.repository.getActiveSessionId(),
      taskTitle: approval.title,
      taskSummary: trimmedFeedback
        ? `Rejected with feedback: ${trimmedFeedback}`
        : approval.summary,
      approved: false
    });

    // If the user rejected with feedback, treat it as a new instruction and let the AI revise
    // immediately — this produces a fresh proposal (or reply) the user can review again.
    if (trimmedFeedback && workspace.writeAccessEnabled && workspace.projectRoot) {
      const userMessage = this.toChatMessage('user', trimmedFeedback, 'text');
      logger.info('chat.reject.revising', { feedbackLength: trimmedFeedback.length });
      const revised = await this.processTurnWithUserMessage(trimmedFeedback, 'text', userMessage);
      return { assistantMessage: revised.assistantMessage };
    }

    return {
      assistantMessage
    };
  }

  getPendingApproval(approvalId: string) {
    const approval = this.runtime.getPendingApproval();
    if (!approval || approval.id !== approvalId) {
      return null;
    }

    return approval;
  }

  clearDiff() {
    this.runtime.setLastDiff(null);
  }

  async readRecentMessages(limit = 120) {
    return this.repository.listRecentMessages(limit);
  }

  async clearConversationHistory() {
    await this.attachments.clearAll();
    await this.repository.clearMessages();
  }

  async uploadAttachment(fileName: string, mimeType: string, buffer: Buffer) {
    return this.attachments.createUpload({
      fileName,
      mimeType,
      sizeBytes: buffer.byteLength,
      buffer
    });
  }

  async getAttachmentContent(attachmentId: string) {
    return this.attachments.getContent(attachmentId);
  }

  private async readConversationHistory() {
    return this.repository.listRecentMessages(120);
  }

  private async persistMessages(messages: ChatMessage[]) {
    await this.repository.appendMessages(messages);
    for (const message of messages) {
      const attachmentIds = (message.attachments ?? []).map((attachment) => attachment.id);
      await this.attachments.assignToMessage(attachmentIds, message.id);
    }
  }
}

// High-recall pre-filter: route to the model's write-intent decision whenever the message
// expresses ANY edit/imperative intent. Voice and chat requests are conversational and rarely
// contain tech nouns (people say "that line"/"the footer"/"this text"), and they often include
// question words ("how are you", "what I want is…"), so we deliberately do NOT bail on those.
// The model's decideWriteIntent makes the precise reply-vs-propose_write call; a false positive
// here just costs one decision pass that returns "reply".
function looksLikeWriteRequest(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  // Explicit confirmation/approval of a prior proposal.
  const confirmationPattern = /\b(go ahead|do it|proceed|apply|approve)\b/;
  if (confirmationPattern.test(normalized)) {
    return true;
  }

  // Any edit/imperative verb anywhere in the message → treat as a possible write.
  const actionPattern =
    /\b(fix|implement|change|edit|modif(y|ies)|update|adjust|add|insert|append|prepend|remove|removing|delete|deleting|drop|strip|get\s+rid\s+of|replace|swap|rename|move|relocate|center|centre|centrali[sz]e|align|refactor|rewrite|restyle|style|format|create|build|scaffold|generate|patch|set\s*up|install|wire|hook\s+up|tweak|clean\s+up|make\s+(it|this|that|the|them|sure)|turn\s+(it|this|that|the)|set\s+(it|this|that|the))\b/;

  return actionPattern.test(normalized);
}

function toPublicAttachments(
  attachments: Array<ChatAttachment & { storagePath?: string; messageId?: string | null }>
) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    kind: attachment.kind,
    createdAt: attachment.createdAt,
    excerpt: attachment.excerpt
  }));
}

function buildAssistantInput(
  text: string,
  attachments: Array<ChatAttachment & { storagePath?: string }>
) {
  if (attachments.length === 0) {
    return text;
  }

  const attachmentLines = attachments.map((attachment, index) => {
    const metadata = [
      `name=${attachment.name}`,
      `type=${attachment.mimeType}`,
      `size=${attachment.sizeBytes}B`,
      attachment.storagePath ? `path=${attachment.storagePath}` : null
    ]
      .filter(Boolean)
      .join(', ');

    const excerpt =
      attachment.excerpt && (attachment.kind === 'text' || attachment.kind === 'code')
        ? `\nExcerpt:\n${attachment.excerpt.slice(0, 1600)}`
        : '';

    return `Attachment ${index + 1} (${attachment.kind}): ${metadata}${excerpt}`;
  });

  const prompt = text.trim()
    ? text.trim()
    : 'The user sent attachments. Use them as context when answering.';

  return `${prompt}\n\nAttached files:\n${attachmentLines.join('\n\n')}`;
}

function buildApprovalDecisionMessage(
  decision: 'approved' | 'rejected',
  title: string,
  diff: DiffSummary
) {
  const fileCount = diff.files.length;
  const { additions, deletions } = countDiffLines(diff.files.map((file) => file.diff));
  const fileList = diff.files
    .slice(0, 5)
    .map((file) => file.filePath)
    .join(', ');
  const remaining = Math.max(0, fileCount - 5);
  const filesText =
    fileCount === 0
      ? 'No visible file diff was available.'
      : `${fileCount} ${fileCount === 1 ? 'file' : 'files'} changed (${additions} additions, ${deletions} deletions): ${fileList}${remaining ? `, and ${remaining} more` : ''}.`;

  if (decision === 'approved') {
    return `Approved and kept the changes: ${title}.\n\nSummary: ${filesText}`;
  }

  return `Rejected and reverted the changes: ${title}.\n\nSummary: ${filesText}`;
}

function countDiffLines(diffs: string[]) {
  let additions = 0;
  let deletions = 0;

  for (const diff of diffs) {
    for (const line of diff.split('\n')) {
      if (line.startsWith('+++') || line.startsWith('---')) {
        continue;
      }
      if (line.startsWith('+')) {
        additions += 1;
      } else if (line.startsWith('-')) {
        deletions += 1;
      }
    }
  }

  return { additions, deletions };
}
