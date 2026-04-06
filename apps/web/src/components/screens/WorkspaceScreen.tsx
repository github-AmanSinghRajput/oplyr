import { FolderOpen, Shield, FileCheck, AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import type { WorkspaceState } from '@/containers/voice-console/lib/types';

interface WorkspaceScreenProps {
  activeProviderName: string;
  projectInput: string;
  workspace: WorkspaceState | null;
  canBrowseProjectFolder: boolean;
  isResetting: boolean;
  onProjectInputChange: (value: string) => void;
  onBrowseProjectFolder: () => void;
  onSaveProject: () => void;
  onToggleWriteAccess: (enabled: boolean) => void;
  onResetApp: () => void;
}

export function WorkspaceScreen({
  activeProviderName,
  projectInput,
  workspace,
  canBrowseProjectFolder,
  isResetting,
  onProjectInputChange,
  onBrowseProjectFolder,
  onSaveProject,
  onToggleWriteAccess,
  onResetApp
}: WorkspaceScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
          Workspace
        </p>
        <h2 className="text-lg font-semibold text-text-primary">
          Choose the folder {activeProviderName} is allowed to work inside.
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          Until you select a folder, {activeProviderName} can chat with you but should not inspect
          project files.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <Badge variant="outline">
            {workspace?.projectRoot ? 'folder selected' : 'no folder selected'}
          </Badge>
          <Badge variant="outline">
            {workspace?.writeAccessEnabled ? 'changes require approval' : 'changes off'}
          </Badge>
        </div>
      </div>

      {/* Project folder selector */}
      <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-5">
        <label className="block mb-3">
          <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
            Project folder
          </span>
          <div className="flex items-center gap-2 mt-2">
            <Input
              value={projectInput}
              onChange={(e) => onProjectInputChange(e.target.value)}
              placeholder="/absolute/path/to/your/project"
              className="flex-1"
            />
            <Button
              variant="outline"
              disabled={!canBrowseProjectFolder}
              onClick={onBrowseProjectFolder}
            >
              <FolderOpen size={14} className="mr-1.5" /> Browse
            </Button>
            <Button onClick={onSaveProject}>Connect folder</Button>
          </div>
        </label>

        <div className="mt-3">
          <Button
            variant={workspace?.writeAccessEnabled ? 'destructive' : 'outline'}
            disabled={!workspace?.projectRoot}
            onClick={() => onToggleWriteAccess(!workspace?.writeAccessEnabled)}
          >
            {workspace?.writeAccessEnabled
              ? 'Turn off file changes'
              : 'Allow approved file changes'}
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen size={14} className="text-accent" />
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
              Connected folder
            </span>
          </div>
          <p className="text-sm font-medium text-text-primary">
            {workspace?.projectRoot ?? 'No folder connected yet'}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            Once selected, {activeProviderName} should stay scoped to this folder only.
          </p>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} className="text-warning" />
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
              Protected secrets
            </span>
          </div>
          <p className="text-sm font-medium text-text-primary">
            {workspace?.secretPolicy.length
              ? workspace.secretPolicy.slice(0, 3).join(', ')
              : 'Select a folder to see the active policy'}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            Secret-like files stay outside normal coding operations.
          </p>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileCheck size={14} className="text-success" />
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
              Change policy
            </span>
          </div>
          <p className="text-sm font-medium text-text-primary">
            {workspace?.writeAccessEnabled ? 'Approved edits enabled' : 'Chat and advice only'}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            No file changes are automatic. Every edit still requires explicit approval.
          </p>
        </div>
      </div>

      <Separator />

      {/* Danger zone */}
      <div className="rounded-[var(--radius-panel)] border border-danger/30 bg-danger-muted/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-danger mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Reset VOCOD</h3>
              <p className="text-xs text-text-secondary mt-1">
                This clears chat history, notes, approvals, saved workspace, voice settings, app
                preferences, and app-level provider connections. It does not run system-wide Codex
                or Claude logout commands.
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            disabled={isResetting}
            onClick={onResetApp}
            className="shrink-0"
          >
            <RotateCcw size={14} className="mr-1.5" />
            {isResetting ? 'Resetting...' : 'Reset everything'}
          </Button>
        </div>
      </div>
    </div>
  );
}
