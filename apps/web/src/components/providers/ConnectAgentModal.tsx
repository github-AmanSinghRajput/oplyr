import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ProviderLogo } from '@/components/providers/ProviderLogo';
import type {
  AssistantProviderId,
  AssistantProviderStatus
} from '@/containers/voice-console/lib/types';

// "Connect an agent" — a focused modal opened from the topbar "+". Each row adapts to the provider's
// real ladder (installed → loggedIn → appConnected): ready providers connect in one click; ones that
// need CLI install/sign-in reveal the exact command inline (copyable) instead of dumping the user in
// the full Settings screen. Gemini is shown as coming soon. Portals to <body> (the topbar is fixed).
interface ConnectAgentModalProps {
  open: boolean;
  onClose: () => void;
  providers: AssistantProviderStatus[];
  activeProviderId: AssistantProviderId | null;
  onConnect: (id: AssistantProviderId) => void;
  onSwitch: (id: AssistantProviderId) => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  busy?: boolean;
}

type Phase = 'connected' | 'ready' | 'needs-login' | 'needs-install' | 'coming-soon';

function phaseFor(p: AssistantProviderStatus): Phase {
  if (p.id === 'gemini' && !p.appConnected) return 'coming-soon';
  if (p.appConnected) return 'connected';
  if (!p.installed) return 'needs-install';
  if (!p.loggedIn) return 'needs-login';
  return 'ready';
}

export function ConnectAgentModal({
  open,
  onClose,
  providers,
  activeProviderId,
  onConnect,
  onSwitch,
  onRefresh,
  onOpenSettings,
  busy
}: ConnectAgentModalProps) {
  const [expanded, setExpanded] = useState<AssistantProviderId | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(text);
        setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
      },
      () => {}
    );
  };

  const command = (label: string, cmd: string, onDone: { label: string; run: () => void }) => (
    <div className="mt-2 rounded-[var(--radius-control)] border border-border bg-surface-2/60 p-2.5">
      <p className="mb-1.5 text-[11px] text-text-tertiary">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate font-mono text-xs text-text-secondary">{cmd}</code>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary"
          onClick={() => copy(cmd)}
        >
          {copied === cmd ? <Check size={11} /> : <Copy size={11} />}
          {copied === cmd ? 'Copied' : 'Copy'}
        </button>
      </div>
      <button
        type="button"
        className="mt-2 text-[11px] font-medium text-accent hover:underline"
        onClick={onDone.run}
      >
        {onDone.label}
      </button>
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface-1 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Connect an agent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Connect an agent</h2>
            <p className="mt-0.5 text-xs text-text-tertiary">Bring the AI you already pay for.</p>
          </div>
          <button
            type="button"
            className="text-text-tertiary hover:text-text-primary"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] divide-y divide-border/60 overflow-y-auto px-2 py-1">
          {providers.map((p) => {
            const phase = phaseFor(p);
            const isActive = p.id === activeProviderId;
            return (
              <div key={p.id} className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <ProviderLogo providerId={p.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{p.name}</p>
                    <p
                      className={cn(
                        'flex items-center gap-1.5 text-[11px]',
                        phase === 'ready' && 'text-success',
                        phase === 'needs-login' && 'text-warning',
                        (phase === 'needs-install' || phase === 'coming-soon') &&
                          'text-text-tertiary',
                        phase === 'connected' && 'text-text-secondary'
                      )}
                    >
                      {phase === 'ready' && (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-success" /> Ready to connect
                        </>
                      )}
                      {phase === 'needs-login' && 'Sign in required'}
                      {phase === 'needs-install' && 'Not installed'}
                      {phase === 'coming-soon' && 'Coming soon'}
                      {phase === 'connected' && (isActive ? 'Connected · active' : 'Connected')}
                    </p>
                  </div>

                  {/* Action */}
                  {phase === 'ready' && (
                    <button
                      type="button"
                      disabled={busy}
                      className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-background hover:bg-accent/90 disabled:opacity-50"
                      onClick={() => onConnect(p.id)}
                    >
                      Connect
                    </button>
                  )}
                  {(phase === 'needs-login' || phase === 'needs-install') && (
                    <button
                      type="button"
                      className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-2"
                      onClick={() => setExpanded((id) => (id === p.id ? null : p.id))}
                    >
                      {phase === 'needs-install' ? 'Install' : 'Sign in'}
                    </button>
                  )}
                  {phase === 'connected' &&
                    (isActive ? (
                      <span className="shrink-0 text-accent" aria-label="Active">
                        <Check size={16} />
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-2 disabled:opacity-50"
                        onClick={() => {
                          onSwitch(p.id);
                          onClose();
                        }}
                      >
                        Make active
                      </button>
                    ))}
                  {phase === 'coming-soon' && (
                    <span className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-text-tertiary">
                      Soon
                    </span>
                  )}
                </div>

                {/* Inline setup (install / sign-in) */}
                {expanded === p.id &&
                  phase === 'needs-install' &&
                  command('Install the CLI, then sign in:', p.installCommand, {
                    label: "I've installed it — recheck",
                    run: onRefresh
                  })}
                {expanded === p.id &&
                  phase === 'needs-login' &&
                  command('Run this to sign in, then recheck:', p.loginCommand, {
                    label: "I've signed in — recheck",
                    run: onRefresh
                  })}
              </div>
            );
          })}
        </div>

        {/* Memory import moved out of this modal — it lives on the Memory screen, the Workspace
            screen, and the onboarding project step (this modal is only for connecting agents). */}

        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            className="text-xs font-medium text-text-secondary hover:text-text-primary"
            onClick={onOpenSettings}
          >
            Open full agent settings →
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
