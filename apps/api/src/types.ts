export type ChatRole = 'user' | 'assistant';
export type ChatSource = 'voice' | 'text';
export type ChatAttachmentKind = 'image' | 'text' | 'code' | 'file';

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: ChatAttachmentKind;
  createdAt: string;
  excerpt: string | null;
}

/** A memory atom that recall injected into this turn, trimmed for display in the chat chip. */
export interface ChatMemoryAtom {
  id: string;
  type: string;
  text: string;
  scope: 'global' | 'project';
  projectKey: string | null;
  crossProject: boolean;
  contributors: AssistantProviderId[];
}

/** Provenance for the "used N memories" chip: what the brain contributed to an assistant turn. */
export interface ChatMemoryUsage {
  atoms: ChatMemoryAtom[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  source: ChatSource;
  attachments?: ChatAttachment[];
  /** Present on assistant messages when recall injected memory (live-only; not persisted). */
  memory?: ChatMemoryUsage;
}

export interface LogStore {
  messages: ChatMessage[];
}

export interface WorkspaceState {
  id: string | null;
  projectRoot: string | null;
  projectName: string | null;
  isGitRepo: boolean;
  writeAccessEnabled: boolean;
  secretPolicy: string[];
}

export interface PendingApproval {
  id: string;
  createdAt: string;
  projectRoot: string;
  userRequest: string;
  title: string;
  summary: string;
  tasks: string[];
  agents: string[];
  // Working-tree snapshot taken before the assistant applied its edit, so a reject can revert
  // ONLY the assistant's changes back to this point without disturbing other uncommitted work.
  baselineRef?: string | null;
  // Untracked files that already existed at snapshot time — used to tell the assistant's NEW
  // files apart from the user's pre-existing untracked files when scoping the diff.
  baselineUntracked?: string[];
  // Content snapshots for pre-existing untracked files. These let review/reject detect AI edits
  // to files that are not tracked by git without showing unrelated untracked files.
  baselineUntrackedSnapshots?: BaselineUntrackedSnapshot[];
  // The assistant's own natural-language message from applying the edit (captured at proposal time).
  // Shown verbatim on approve as the post-edit summary ("I changed X, Y…"), like a CLI agent would.
  executionSummary?: string;
}

export interface BaselineUntrackedSnapshot {
  filePath: string;
  blobHash: string;
  mode?: number;
}

export type DiffFileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface DiffFileBlock {
  filePath: string;
  diff: string;
  status: DiffFileStatus;
}

export interface DiffSummary {
  isGitRepo: boolean;
  changedFiles: string[];
  files: DiffFileBlock[];
  redactedFiles?: string[];
}

export interface AudioBridgeState {
  platform: string;
  available: boolean;
  inputDeviceLabel: string | null;
  outputDeviceLabel: string | null;
  transcriptionEngine: string;
  lastCheckedAt: string | null;
  error: string | null;
}

export type AssistantProviderId = 'codex' | 'claude' | 'gemini';

export interface AssistantProviderStatus {
  id: AssistantProviderId;
  name: string;
  installed: boolean;
  loggedIn: boolean;
  appConnected: boolean;
  connectedAt: string | null;
  accountLabel: string | null;
  authMode: string | null;
  statusText: string;
  loginCommand: string;
  logoutCommand: string | null;
  canSwitchAccount: boolean;
}

export interface ProviderUsageMeter {
  id: string;
  label: string;
  percentUsed: number | null;
  percentLeft: number | null;
  detail: string | null;
  resetAt: string | null;
}

export interface ProviderUsageContextWindow {
  percentLeft: number | null;
  percentUsed: number | null;
  detail: string;
}

export interface ProviderUsageDetail {
  label: string;
  value: string;
}

export interface ProviderUsageSnapshot {
  providerId: AssistantProviderId | null;
  providerName: string | null;
  command: string | null;
  capturedAt: string;
  available: boolean;
  error: string | null;
  model: string | null;
  accountLabel: string | null;
  sessionId: string | null;
  contextWindow: ProviderUsageContextWindow | null;
  meters: ProviderUsageMeter[];
  details: ProviderUsageDetail[];
}

export type VoiceBootstrapPhase =
  | 'idle'
  | 'install_required'
  | 'installing'
  | 'warming'
  | 'ready'
  | 'failed';

export type VoiceBootstrapStepState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface VoiceBootstrapStep {
  id: 'parakeet' | 'warmup';
  label: string;
  description: string;
  state: VoiceBootstrapStepState;
  detail: string | null;
}

export interface VoiceBootstrapStatus {
  phase: VoiceBootstrapPhase;
  progressPercent: number;
  message: string;
  error: string | null;
  installRoot: string;
  seedRoot: string | null;
  steps: VoiceBootstrapStep[];
  updatedAt: string;
}

export type TranscriptionModelProfile = 'parakeet';

export interface TranscriptionRuntimeConfig {
  provider: 'parakeet-local';
  speechModelVersion: string;
  languageCode: string;
}

export interface TranscriptionModelOption {
  id: TranscriptionModelProfile;
  label: string;
  description: string;
  available: boolean;
}

export type AppTheme = 'dark' | 'light';

export interface AppSettings {
  displayName: string | null;
  theme: AppTheme;
  welcomedAt: string | null;
  // Whether the little desk-pet (walking duck) shows on the topbar. On by default; devs can opt out.
  showDeskPet: boolean;
}

export interface VoiceSettings {
  silenceWindowMs: number;
  autoResumeAfterReply: boolean;
  transcriptionModel: TranscriptionModelProfile;
}

export type CodexReasoningEffort =
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'ultra';
export type AssistantVoiceModelMode = 'auto' | 'fast' | 'inherit';

export interface CodexReasoningOption {
  effort: CodexReasoningEffort;
  description: string;
}

export interface CodexModelOption {
  slug: string;
  displayName: string;
  description: string;
  defaultReasoningEffort: CodexReasoningEffort | null;
  supportedReasoningEfforts: CodexReasoningOption[];
}

export interface CodexSettings {
  model: string | null;
  reasoningEffort: CodexReasoningEffort | null;
  voiceModelMode: AssistantVoiceModelMode;
}

export interface ClaudeModelOption {
  slug: string;
  displayName: string;
  description: string;
  suggestedForDiscussion: boolean;
}

// Claude Code sets reasoning effort via its `/effort` slash command (not a CLI flag), so we inject
// it into the prompt. Kept to the levels Claude accepts.
export type ClaudeReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

export interface ClaudeReasoningOption {
  effort: ClaudeReasoningEffort;
  description: string;
}

export interface ClaudeSettings {
  model: string | null;
  reasoningEffort: ClaudeReasoningEffort | null;
  voiceModelMode: AssistantVoiceModelMode;
}

export interface GeminiModelOption {
  slug: string;
  displayName: string;
  description: string;
  suggestedForDiscussion: boolean;
}

export interface GeminiSettings {
  model: string | null;
  voiceModelMode: AssistantVoiceModelMode;
}

export type VoiceSessionPhase =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

export interface VoiceSessionState {
  active: boolean;
  phase: VoiceSessionPhase;
  liveTranscript: string;
  lastTranscript: string | null;
  silenceWindowMs: number;
  transport: 'desktop-media' | 'browser-webspeech' | 'unsupported';
  error: string | null;
}

export interface RuntimeState {
  activeProviderId: AssistantProviderId | null;
  workspace: WorkspaceState;
  pendingApproval: PendingApproval | null;
  lastDiff: DiffSummary | null;
  audio: AudioBridgeState;
  voiceSession: VoiceSessionState;
}
