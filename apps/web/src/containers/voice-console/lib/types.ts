export type ScreenId =
  | 'workspace'
  | 'voice'
  | 'terminal'
  | 'shell'
  | 'review'
  | 'settings'
  | 'memory'
  | 'meetings'
  | 'markdown'
  | 'music'
  | 'codebase-map';

// ── Codebase map ────────────────────────────────────────────────────────────
export interface CodebaseMapNode {
  id: string;
  label: string;
  dir: string;
  language: string;
  degree: number;
}

export interface CodebaseMapEdge {
  from: string;
  to: string;
}

export interface CodebaseMapStats {
  totalFiles: number;
  sourceFiles: number;
  edges: number;
  languages: Record<string, number>;
  supportedLanguages: string[];
  truncated: boolean;
}

export interface CodebaseMapTreeNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  language?: string;
  children?: CodebaseMapTreeNode[];
}

export interface CodebaseMapData {
  rootPath: string;
  projectName: string;
  nodes: CodebaseMapNode[];
  edges: CodebaseMapEdge[];
  tree: CodebaseMapTreeNode[];
  stats: CodebaseMapStats;
  scannedAt: string;
}

export interface CodebaseMapResponse {
  map: CodebaseMapData | null;
}

/** Mirrors the backend AssistantClientError kinds so the UI can react to (e.g.) rate limits. */
export type AssistantErrorKind = 'auth' | 'rate_limit' | 'service' | 'unknown';

export interface CodebaseFileSummaryResponse {
  path: string;
  summary: string | null;
  cached: boolean;
  error?: string;
  errorKind?: AssistantErrorKind;
}

export interface CodebaseFileSymbol {
  name: string;
  kind: string;
  line: number;
  exported: boolean;
}

export interface CodebaseFileSymbolsResponse {
  path: string;
  symbols: CodebaseFileSymbol[];
  error?: string;
}

export type ChatRole = 'user' | 'assistant';
export type MessageSource = 'voice' | 'text';
export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
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

/** A memory the brain injected into an assistant turn, for the "used N memories" chip. */
export interface ChatMemoryAtom {
  id: string;
  type: string;
  text: string;
  scope: 'global' | 'project';
  projectKey: string | null;
  crossProject: boolean;
  contributors: string[];
}

export interface ChatMemoryUsage {
  atoms: ChatMemoryAtom[];
}

export interface MessageEntry {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  source: MessageSource;
  attachments?: ChatAttachment[];
  /** Present on assistant messages when recall injected memory into the turn. */
  memory?: ChatMemoryUsage;
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

export interface AudioState {
  platform: string;
  available: boolean;
  inputDeviceLabel: string | null;
  outputDeviceLabel: string | null;
  transcriptionEngine: string;
  lastCheckedAt: string | null;
  error: string | null;
}

export interface VoiceSessionState {
  active: boolean;
  phase: 'idle' | 'starting' | 'listening' | 'thinking' | 'speaking' | 'error';
  liveTranscript: string;
  lastTranscript: string | null;
  silenceWindowMs: number;
  transport: 'browser-webspeech' | 'desktop-media' | 'unsupported';
  error: string | null;
}

export type TranscriptionModelProfile = 'parakeet';

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
}

export interface VoiceSettings {
  silenceWindowMs: number;
  autoResumeAfterReply: boolean;
  transcriptionModel: TranscriptionModelProfile;
}

export interface VoiceSettingsResponse {
  settings: VoiceSettings;
  options: {
    transcriptionModels: TranscriptionModelOption[];
  };
  currentDevices: {
    inputLabel: string | null;
    outputLabel: string | null;
  };
}

export type CodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
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

export interface ClaudeSettings {
  model: string | null;
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

export interface CodexSettingsResponse {
  settings: CodexSettings;
  source: 'app' | 'environment' | 'global' | 'default';
  options: {
    models: CodexModelOption[];
  };
}

export interface ClaudeSettingsResponse {
  settings: ClaudeSettings;
  source: 'app' | 'default';
  options: {
    models: ClaudeModelOption[];
  };
}

export interface GeminiSettingsResponse {
  settings: GeminiSettings;
  source: 'app' | 'global' | 'default';
  options: {
    models: GeminiModelOption[];
  };
}

export interface CodexStatus {
  installed: boolean;
  loggedIn: boolean;
  authMode: string | null;
  statusText: string;
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
  id: 'speech_model' | 'warmup';
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

export interface AssistantProvidersState {
  activeProviderId: AssistantProviderId | null;
  activeProvider: AssistantProviderStatus | null;
  providers: AssistantProviderStatus[];
}

export interface DatabaseStatus {
  configured: boolean;
  reachable: boolean;
  message: string;
}

export interface BrainAgentWritePermission {
  writeEnabled: boolean;
  updatedAt: string | null;
}

// `standard` = everyday capture + recall (cross-project gated by crossProjectEnabled, sensitive
// atoms never touched). `local_god` = explicit power-user unlock that makes sensitive
// capture/injection settable (still off until toggled).
export type BrainMode = 'standard' | 'local_god';
export type BrainAtomType = 'fact' | 'entity' | 'preference' | 'convention' | 'decision';
export type BrainAtomScope = 'global' | 'project';
export type BrainAtomSensitivity = 'normal' | 'sensitive';
export type BrainSourceType = 'chat_turn' | 'diff' | 'transcript' | 'file_snapshot' | 'meeting';

export interface BrainSettings {
  mode: BrainMode;
  enabled: boolean;
  recallEnabled: boolean;
  captureEnabled: boolean;
  /** Tiered, labeled cross-project recall. Per-project `isolate` overrides this. */
  crossProjectEnabled: boolean;
  rawArchiveEnabled: boolean;
  allowSensitiveCapture: boolean;
  allowSensitiveInjection: boolean;
  maxRecallAtoms: number;
  maxRecallCharacters: number;
  maxGraphHops: number;
  agentWritePermissions: Record<AssistantProviderId, BrainAgentWritePermission>;
}

/** Per-project overrides returned by PUT /api/brain/projects/:projectKey and in status.project. */
export interface BrainProjectSettings {
  isolate: boolean;
  captureEnabled: boolean;
}

export interface BrainProvenance {
  source: BrainSourceType;
  providerId: AssistantProviderId;
  sessionId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  projectRoot: string | null;
  capturedAt: string;
}

/** One agent's assertion of an atom. Multiple contributors = corroboration across agents. */
export interface BrainContributor {
  providerId: AssistantProviderId;
  sessionId: string | null;
  lastAssertedAt: string;
}

export interface BrainAtom {
  id: string;
  type: BrainAtomType;
  text: string;
  normalizedText: string;
  scope: BrainAtomScope;
  projectKey: string | null;
  sourceHash: string;
  sensitivity: BrainAtomSensitivity;
  confidence: number;
  salience: number;
  provenance: BrainProvenance;
  /** Named things this atom is about — the graph derives its edges from these. */
  entities: string[];
  contributors: BrainContributor[];
  createdAt: string;
  lastSeenAt: string;
  deletedAt: string | null;
}

export interface BrainStatusResponse {
  settings: BrainSettings;
  stats: {
    totalAtoms: number;
    projectAtoms: number;
    globalAtoms: number;
    deletedAtoms: number;
  };
  recentAtoms: BrainAtom[];
  project: {
    key: string | null;
    isolate: boolean;
    captureEnabled: boolean;
  };
  embeddingsModel: string;
}

// ── Knowledge graph (real, backend-computed edges — never derived on the frontend) ──────────────
export interface BrainGraphNode {
  id: string;
  label: string;
  type: BrainAtomType;
  scope: BrainAtomScope;
  projectKey: string | null;
  salience: number;
  confidence: number;
  contributors: AssistantProviderId[];
  entities: string[];
}

export interface BrainGraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  sharedEntities: string[];
}

export interface BrainGraphResponse {
  nodes: BrainGraphNode[];
  edges: BrainGraphEdge[];
}

// ── Semantic search (browse, not inject) ────────────────────────────────────────────────────────
export interface BrainRecallAtom {
  id: string;
  type: BrainAtomType;
  text: string;
  scope: BrainAtomScope;
  projectKey: string | null;
  sensitivity: BrainAtomSensitivity;
  score: number;
  provenance: BrainProvenance;
  lastSeenAt: string;
  /** True when this atom belongs to a different project than the one being searched from. */
  crossProject: boolean;
  contributors: AssistantProviderId[];
}

export interface BrainSearchResponse {
  atoms: BrainRecallAtom[];
}

/** New event pushed through the existing /api/voice/events SSE stream on brain writes. */
export interface BrainUpdateEvent {
  type: 'brain_update';
  payload: { projectKey: string | null; capturedAtoms: number };
}

/** Any frame the /api/voice/events SSE stream may deliver. Consumers narrow on `type`. */
export type AppSseEvent =
  | BrainUpdateEvent
  | { type: 'voice_state'; payload: unknown }
  | { type: 'chat_append'; payload: unknown }
  | { type: 'status_refresh'; payload: Record<string, never> };

export interface StatusResponse {
  codexStatus: CodexStatus;
  assistantProviders: AssistantProvidersState;
  appSettings: AppSettings;
  workspace: WorkspaceState;
  pendingApproval: PendingApproval | null;
  lastDiff: DiffSummary | null;
  audio: AudioState;
  voiceSession: VoiceSessionState;
  system: {
    database: DatabaseStatus;
    brainDatabase: DatabaseStatus;
  };
}

export interface SystemResponse {
  environment: string;
  database: DatabaseStatus;
  brainDatabase: DatabaseStatus;
  providers: {
    tts: string;
    queue: string;
    email: string;
    vector: string;
    rag: string;
    ocr: string;
  };
  recommendations: Record<string, string>;
  auth: {
    operator: {
      id: string;
      email: string | null;
      displayName: string | null;
      createdAt: string;
      updatedAt: string;
    } | null;
    codexAuth: string;
    productAuth: string;
    trackedSessions: AuthSessionEntry[];
    note: string;
  };
}

export interface ReplyResponse {
  type: 'reply';
  userMessage: MessageEntry;
  assistantMessage: MessageEntry;
}

export interface ApprovalRequiredResponse {
  type: 'approval_required';
  userMessage: MessageEntry;
  assistantMessage: MessageEntry;
  pendingApproval: PendingApproval;
}

export type ChatStreamEvent =
  | {
      type: 'started';
      userMessage: MessageEntry;
      assistantMessage: MessageEntry;
    }
  | {
      type: 'delta';
      assistantMessage: MessageEntry;
    }
  | {
      type: 'activity';
      activity: string;
    }
  | {
      type: 'completed';
      result: ReplyResponse | ApprovalRequiredResponse;
    }
  | {
      type: 'error';
      error: string;
      errorKind?: AssistantErrorKind;
    };

export interface SetWorkspaceResponse {
  workspace: WorkspaceState;
}

export interface VoiceSessionResponse {
  ok: boolean;
  voiceSession: VoiceSessionState;
}

export interface ClearResponse {
  ok: boolean;
  assistantProviders?: AssistantProvidersState;
}

export interface ProviderUsageResponse {
  usage: ProviderUsageSnapshot;
}

export interface VoiceBootstrapResponse {
  bootstrap: VoiceBootstrapStatus;
}

export interface VoiceTranscriptionResponse {
  provider: string;
  transcript: string;
}

export type VoiceCommandScreen = 'voice' | 'workspace' | 'review' | 'terminal';

export type VoiceCommandAction =
  | {
      type: 'set_codex_model';
      model: string;
      reasoningEffort: CodexReasoningEffort | null;
    }
  | {
      type: 'set_claude_model';
      model: string;
    };

export interface VoiceCommandOption {
  id: string;
  label: string;
  description: string;
  action: VoiceCommandAction;
}

export type VoiceCommandResolveResponse =
  | {
      status: 'no_match';
    }
  | {
      status: 'handled';
      userMessage: MessageEntry;
      assistantMessage: MessageEntry;
      suggestedScreen?: VoiceCommandScreen;
    }
  | {
      status: 'options_required';
      userMessage: MessageEntry;
      assistantMessage: MessageEntry;
      commandTitle: string;
      commandPrompt: string;
      options: VoiceCommandOption[];
      suggestedScreen?: VoiceCommandScreen;
    };

export interface VoiceCommandApplyResponse {
  ok: boolean;
  assistantMessage: MessageEntry;
  suggestedScreen?: VoiceCommandScreen;
}

export interface LogsResponse {
  messages: MessageEntry[];
}

export interface ApprovalResponse {
  ok: boolean;
  assistantMessage: MessageEntry;
  diff?: DiffSummary;
}

export interface MarkdownFileEntry {
  path: string;
  name: string;
  dir: string;
}

export interface MarkdownListResponse {
  files: MarkdownFileEntry[];
}

export interface MarkdownContentResponse {
  path: string;
  content: string | null;
  error?: string;
}

export interface ApprovalHistoryEntry {
  id: string;
  workspaceId: string | null;
  conversationSessionId: string | null;
  taskTitle: string;
  taskSummary: string;
  approved: boolean;
  reviewedAt: string;
}

export interface ApprovalHistoryResponse {
  approvals: ApprovalHistoryEntry[];
}

export interface AuthSessionEntry {
  id: string;
  provider: string;
  providerSubject: string | null;
  accessScope: string[];
  createdAt: string;
  expiresAt: string | null;
}

export interface AuthSessionsResponse {
  sessions: AuthSessionEntry[];
}

export interface DiffRow {
  leftLineNumber: number | null;
  leftText: string;
  leftKind: 'context' | 'remove' | 'empty';
  rightLineNumber: number | null;
  rightText: string;
  rightKind: 'context' | 'add' | 'empty';
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  contextLabel: string;
  rows: DiffRow[];
}

export interface ParsedFileDiff {
  hunks: DiffHunk[];
  stats: { additions: number; deletions: number };
}

export interface VoiceEventPayload {
  type: 'voice_state' | 'chat_append' | 'status_refresh';
  payload: unknown;
}

export interface MessageGroup {
  id: string;
  role: ChatRole;
  source: MessageSource;
  createdAt: string;
  messages: MessageEntry[];
}

export interface ConsolePreferences {
  defaultScreen: Extract<ScreenId, 'workspace' | 'voice' | 'terminal'>;
  // When false, a finished voice transcript is shown for review/edit before sending (not auto-sent).
  autoSendVoice: boolean;
}
