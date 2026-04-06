import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import type { AppSettings, AssistantProviderId, AssistantProviderStatus } from '@/containers/voice-console/lib/types';

interface OnboardingScreenProps {
  appSettings: AppSettings | null;
  step: 1 | 2 | 3;
  selectedProviderId: AssistantProviderId | null;
  providers: AssistantProviderStatus[];
  onConnectProvider: (providerId: AssistantProviderId) => void;
  onRefresh: () => void;
  onSaveDisplayName: (displayName: string) => void;
  onSelectProvider: (providerId: AssistantProviderId) => void;
  onContinueToInstructions: () => void;
  onBackToProviderChoice: () => void;
  onBackToName: () => void;
}

export function OnboardingScreen({
  appSettings,
  step,
  selectedProviderId,
  providers,
  onConnectProvider,
  onRefresh,
  onSaveDisplayName,
  onSelectProvider,
  onContinueToInstructions,
  onBackToProviderChoice,
  onBackToName,
}: OnboardingScreenProps) {
  const [displayNameInput, setDisplayNameInput] = useState(appSettings?.displayName ?? '');
  const [typedWelcome, setTypedWelcome] = useState('');
  const [showSwitchAccountGuide, setShowSwitchAccountGuide] = useState(false);
  const stableDisplayNameRef = useRef(appSettings?.displayName?.trim() ?? '');
  const lastAnimatedWelcomeRef = useRef<string | null>(null);

  useEffect(() => {
    setDisplayNameInput(appSettings?.displayName ?? '');
  }, [appSettings?.displayName]);

  useEffect(() => {
    const nextDisplayName = appSettings?.displayName?.trim() ?? '';
    if (nextDisplayName) stableDisplayNameRef.current = nextDisplayName;
  }, [appSettings?.displayName]);

  useEffect(() => {
    setShowSwitchAccountGuide(false);
  }, [selectedProviderId, step]);

  useEffect(() => {
    if (step !== 2) { setTypedWelcome(''); return; }
    const displayName = appSettings?.displayName?.trim() || stableDisplayNameRef.current;
    if (!displayName) { setTypedWelcome(''); return; }
    const target = `Welcome, ${displayName}`;
    if (lastAnimatedWelcomeRef.current === target) { setTypedWelcome(target); return; }
    lastAnimatedWelcomeRef.current = target;
    setTypedWelcome('');
    let index = 0;
    const interval = window.setInterval(() => {
      index += 1;
      setTypedWelcome(target.slice(0, index));
      if (index >= target.length) { setTypedWelcome(target); window.clearInterval(interval); }
    }, 18);
    return () => window.clearInterval(interval);
  }, [appSettings?.displayName, step]);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-var(--topbar-height)-48px)]">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-colors',
              s <= step ? 'bg-accent text-background border-accent' : 'bg-surface-2 text-text-tertiary border-border',
            )}>
              {s}
            </div>
          ))}
        </div>

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-3">
            <span className="text-accent font-bold text-xl">V</span>
          </div>
          <p className="text-xs text-text-tertiary">Voice-first coding assistant</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {step === 1 && (
              <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-8 text-center">
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Step 1</p>
                <h1 className="text-xl font-semibold text-text-primary mb-2">What would you like VOCOD to call you?</h1>
                <p className="text-sm text-text-secondary mb-6">This stays local to the app and you can change it later.</p>
                <div className="max-w-xs mx-auto mb-6">
                  <Input
                    autoFocus
                    maxLength={48}
                    placeholder="Your name"
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                  />
                </div>
                <Button disabled={!displayNameInput.trim()} onClick={() => onSaveDisplayName(displayNameInput)}>
                  Continue
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-8 text-center">
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Step 2</p>
                {typedWelcome && (
                  <p className="text-accent font-medium mb-3" aria-live="polite">{typedWelcome}</p>
                )}
                <h1 className="text-xl font-semibold text-text-primary mb-2">Pick the assistant you want to start with.</h1>
                <p className="text-sm text-text-secondary mb-6">Choose one now. You can add the other later.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-6">
                  {providers.map((provider) => (
                    <motion.button
                      key={provider.id}
                      whileHover={{ y: -2 }}
                      className={cn(
                        'p-4 rounded-[var(--radius-panel)] border text-left transition-colors',
                        selectedProviderId === provider.id
                          ? 'border-accent bg-accent-muted/50'
                          : 'border-border bg-surface-2 hover:border-accent-border',
                      )}
                      onClick={() => onSelectProvider(provider.id)}
                      type="button"
                    >
                      <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
                        {provider.id === 'codex' ? 'OpenAI' : 'Anthropic'}
                      </span>
                      <p className="text-sm font-semibold text-text-primary mt-1">{provider.name}</p>
                      {selectedProviderId === provider.id && (
                        <Badge className="mt-2 text-xs">Selected</Badge>
                      )}
                      <p className="text-xs text-text-secondary mt-1">{getProviderCardSummary(provider)}</p>
                    </motion.button>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-3">
                  <Button variant="ghost" onClick={onBackToName}>Back</Button>
                  <Button disabled={!selectedProviderId} onClick={onContinueToInstructions}>Continue</Button>
                </div>
              </div>
            )}

            {step === 3 && selectedProvider && (
              <div className="flex flex-col gap-4">
                <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-8 text-center">
                  <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Step 3</p>
                  <h1 className="text-xl font-semibold text-text-primary mb-2">Connect {selectedProvider.name} to finish setup.</h1>
                  <p className="text-sm text-text-secondary">{getFriendlyProviderStatus(selectedProvider)}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-[var(--radius-panel)] border border-accent-border/30 bg-surface-1 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-[10px] text-text-tertiary uppercase tracking-wider">{selectedProvider.id === 'codex' ? 'OpenAI' : 'Anthropic'}</span>
                        <p className="text-sm font-semibold text-text-primary">{selectedProvider.name}</p>
                      </div>
                      <Badge variant={selectedProvider.appConnected ? 'outline' : selectedProvider.loggedIn ? 'secondary' : 'destructive'} className="text-xs">
                        {getProviderConnectionStateLabel(selectedProvider)}
                      </Badge>
                    </div>

                    {selectedProvider.loggedIn && !showSwitchAccountGuide && (
                      <div className="rounded-[var(--radius-control)] bg-surface-2 p-3 mb-3">
                        <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Detected on this Mac</span>
                        <p className="text-sm font-medium text-text-primary mt-1">{selectedProvider.accountLabel ?? 'Signed-in local session detected'}</p>
                      </div>
                    )}

                    {(!selectedProvider.loggedIn || showSwitchAccountGuide) && (
                      <div className="flex flex-col gap-2 mb-3">
                        {showSwitchAccountGuide && selectedProvider.logoutCommand && (
                          <div className="rounded-[var(--radius-control)] bg-surface-2 p-3">
                            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Switch account first</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-accent">$</span>
                              <code className="text-sm font-mono text-text-primary">{selectedProvider.logoutCommand}</code>
                            </div>
                          </div>
                        )}
                        <div className="rounded-[var(--radius-control)] bg-surface-2 p-3">
                          <span className="text-[10px] text-text-tertiary uppercase tracking-wider">{showSwitchAccountGuide ? 'Sign in again' : 'Login command'}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-accent">$</span>
                            <code className="text-sm font-mono text-text-primary">{selectedProvider.loginCommand}</code>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" onClick={onBackToProviderChoice}>Back</Button>
                      <Button variant="outline" onClick={onRefresh}>Check again</Button>
                      {selectedProvider.loggedIn && !selectedProvider.appConnected && selectedProvider.canSwitchAccount && (
                        <Button variant="outline" onClick={() => setShowSwitchAccountGuide((c) => !c)}>
                          {showSwitchAccountGuide ? 'Use detected' : 'Different account'}
                        </Button>
                      )}
                      <Button disabled={!selectedProvider.loggedIn || selectedProvider.appConnected} onClick={() => onConnectProvider(selectedProvider.id)}>
                        {getConnectButtonLabel(selectedProvider, showSwitchAccountGuide)}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-5">
                    <span className="text-[10px] text-text-tertiary uppercase tracking-wider">What to do</span>
                    <ol className="mt-2 space-y-2">
                      {getProviderConnectSteps(selectedProvider, showSwitchAccountGuide).map((stepText) => (
                        <li key={stepText} className="flex items-start gap-2 text-sm text-text-secondary">
                          <span className="w-5 h-5 rounded-full bg-accent-muted flex items-center justify-center text-[10px] font-bold text-accent shrink-0 mt-0.5">
                            {getProviderConnectSteps(selectedProvider, showSwitchAccountGuide).indexOf(stepText) + 1}
                          </span>
                          {stepText}
                        </li>
                      ))}
                    </ol>
                    <p className="text-xs text-text-tertiary mt-4">
                      {getProviderConnectNote(selectedProvider, appSettings?.displayName ?? null, showSwitchAccountGuide)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function getProviderCardSummary(provider: AssistantProviderStatus) {
  if (provider.appConnected) return 'Already connected in VOCOD';
  if (provider.loggedIn) return 'CLI ready to connect';
  if (provider.installed) return 'Needs local login first';
  return 'Install the CLI first';
}

function getFriendlyProviderStatus(provider: AssistantProviderStatus) {
  const normalized = provider.statusText.toLowerCase();
  if (!provider.installed || normalized.includes('enoent') || normalized.includes('not installed'))
    return `${provider.name} is not installed on this Mac yet. Install it first, then return here and refresh.`;
  if (!provider.loggedIn || normalized.includes('not logged in'))
    return `Run the login command below, finish the browser sign-in flow, then come back and press Refresh.`;
  if (!provider.appConnected) {
    return provider.accountLabel
      ? `${provider.name} is already signed in as ${provider.accountLabel}. Continue or switch accounts.`
      : `${provider.name} is already signed in on this Mac. Continue or switch accounts.`;
  }
  return `${provider.name} is connected and ready inside VOCOD.`;
}

function getProviderConnectionStateLabel(provider: AssistantProviderStatus) {
  if (provider.appConnected) return 'Connected';
  if (provider.loggedIn) return 'Ready to connect';
  if (provider.installed) return 'Login required';
  return 'Not installed';
}

function getConnectButtonLabel(provider: AssistantProviderStatus, showSwitchAccountGuide: boolean) {
  if (provider.appConnected) return 'Connected';
  if (!provider.loggedIn) return provider.installed ? 'Login required' : 'Install first';
  if (showSwitchAccountGuide) return 'Login first';
  return `Continue with ${provider.id === 'claude' ? 'Claude' : 'Codex'}`;
}

function getProviderConnectSteps(provider: AssistantProviderStatus, showSwitchAccountGuide: boolean) {
  if (!provider.installed) return [`Install ${provider.name} on this Mac.`, 'Return here and press Check again.', 'Finish by connecting it inside VOCOD.'];
  if (!provider.loggedIn) return ['Run the login command in Terminal.', 'Complete the browser sign-in flow.', 'Come back here and press Check again.'];
  if (showSwitchAccountGuide && provider.logoutCommand) return [`Run ${provider.logoutCommand} in Terminal.`, `Sign back in with ${provider.loginCommand}.`, 'Return here, press Check again, then continue.'];
  if (!provider.appConnected) return [provider.accountLabel ? `${provider.name} is signed in as ${provider.accountLabel}.` : `${provider.name} is signed in.`, 'Press Continue to let VOCOD use this account.', 'You can add the other provider later in Settings.'];
  return [`${provider.name} is connected to VOCOD.`, 'Your workspace unlocks automatically after setup.', 'You can switch providers anytime later.'];
}

function getProviderConnectNote(provider: AssistantProviderStatus, displayName: string | null, showSwitchAccountGuide: boolean) {
  const firstName = displayName?.trim().split(/\s+/)[0];
  if (provider.appConnected) return firstName ? `You are ready to go, ${firstName}.` : 'You are ready to go.';
  if (showSwitchAccountGuide) return 'VOCOD does not change system accounts itself. Switch accounts in the CLI first, then come back and reconnect here.';
  if (provider.loggedIn) return 'VOCOD only connects to the session already signed in on this machine. It does not copy or store your provider credentials.';
  return 'VOCOD only uses providers you explicitly connect here. Nothing is auto-enabled.';
}
