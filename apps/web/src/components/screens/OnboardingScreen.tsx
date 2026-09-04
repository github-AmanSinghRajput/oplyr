import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { ProviderLogo } from '@/components/providers/ProviderLogo';
import { MemoryImportPanel } from '@/components/screens/memory/MemoryImportPanel';
import { useMemoryImport } from '@/providers/MemoryImportProvider';
import { OplyrLogoMark } from '@/components/branding/OplyrLogoMark';
import { PetPreview } from '@/components/pets/PetCompanion';
import { PET_LABELS } from '@/components/pets/pet-art';
import {
  DESK_PETS,
  type AppSettings,
  type AssistantProviderId,
  type AssistantProviderStatus,
  type DeskPet
} from '@/containers/voice-console/lib/types';

interface OnboardingScreenProps {
  appSettings: AppSettings | null;
  error: string;
  isSavingDisplayName: boolean;
  step: 1 | 2 | 3 | 4 | 5;
  selectedProviderId: AssistantProviderId | null;
  providers: AssistantProviderStatus[];
  onConnectProvider: (providerId: AssistantProviderId) => void;
  onRefresh: () => void;
  onSaveDisplayName: (displayName: string) => void;
  onSelectProvider: (providerId: AssistantProviderId) => void;
  onContinueToInstructions: () => void;
  onBackToProviderChoice: () => void;
  onBackToName: () => void;
  canBrowseProjectFolder: boolean;
  onBrowseProjectFolder: () => Promise<string | null>;
  onConnectProject: (path: string) => void;
  onSkipProject: () => void;
  /** Step back from the pet step to the project + memory-import step (easy to click past by accident). */
  onBackToProject: () => void;
  currentPet: DeskPet;
  onChoosePet: (pet: DeskPet) => void;
  onSkipPet: () => void;
}

export function OnboardingScreen({
  appSettings,
  error,
  isSavingDisplayName,
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
  canBrowseProjectFolder,
  onBrowseProjectFolder,
  onConnectProject,
  onSkipProject,
  onBackToProject,
  currentPet,
  onChoosePet,
  onSkipPet
}: OnboardingScreenProps) {
  // Leaving the project step also leaves the memory-import card behind — and it's easy to click past
  // by accident. If un-imported agent memory is still sitting there, confirm before advancing.
  const { pendingCount } = useMemoryImport();
  type Advance = { kind: 'skip' } | { kind: 'connect'; path: string };
  const [pendingAdvance, setPendingAdvance] = useState<Advance | null>(null);
  const runAdvance = (action: Advance) => {
    setPendingAdvance(null);
    if (action.kind === 'skip') onSkipProject();
    else onConnectProject(action.path);
  };
  const requestAdvance = (action: Advance) => {
    if (pendingCount > 0) setPendingAdvance(action);
    else runAdvance(action);
  };

  const [displayNameInput, setDisplayNameInput] = useState(appSettings?.displayName ?? '');
  const [projectInput, setProjectInput] = useState('');
  const [petChoice, setPetChoice] = useState<DeskPet>(currentPet);
  const [typedWelcome, setTypedWelcome] = useState('');
  const [showSwitchAccountGuide, setShowSwitchAccountGuide] = useState(false);
  const [syncedDisplayName, setSyncedDisplayName] = useState(appSettings?.displayName ?? null);
  const [syncedGuideKey, setSyncedGuideKey] = useState(`${selectedProviderId ?? ''}|${step}`);
  const stableDisplayNameRef = useRef(appSettings?.displayName?.trim() ?? '');
  const lastAnimatedWelcomeRef = useRef<string | null>(null);

  // Reset local state when the relevant props change, the render-phase way
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  if ((appSettings?.displayName ?? null) !== syncedDisplayName) {
    setSyncedDisplayName(appSettings?.displayName ?? null);
    setDisplayNameInput(appSettings?.displayName ?? '');
  }

  const guideResetKey = `${selectedProviderId ?? ''}|${step}`;
  if (guideResetKey !== syncedGuideKey) {
    setSyncedGuideKey(guideResetKey);
    setShowSwitchAccountGuide(false);
  }

  useEffect(() => {
    const nextDisplayName = appSettings?.displayName?.trim() ?? '';
    if (nextDisplayName) stableDisplayNameRef.current = nextDisplayName;
  }, [appSettings?.displayName]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- typewriter animation intentionally drives the local welcome text */
    if (step !== 2) {
      setTypedWelcome('');
      return;
    }
    const displayName = appSettings?.displayName?.trim() || stableDisplayNameRef.current;
    if (!displayName) {
      setTypedWelcome('');
      return;
    }
    const target = `Welcome, ${displayName}`;
    if (lastAnimatedWelcomeRef.current === target) {
      setTypedWelcome(target);
      return;
    }
    lastAnimatedWelcomeRef.current = target;
    setTypedWelcome('');
    let index = 0;
    const interval = window.setInterval(() => {
      index += 1;
      setTypedWelcome(target.slice(0, index));
      if (index >= target.length) {
        setTypedWelcome(target);
        window.clearInterval(interval);
      }
    }, 18);
    return () => window.clearInterval(interval);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [appSettings?.displayName, step]);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-var(--topbar-height)-48px)]">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-colors',
                s <= step
                  ? 'bg-accent text-background border-accent'
                  : 'bg-surface-2 text-text-tertiary border-border'
              )}
            >
              {s}
            </div>
          ))}
        </div>

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-3 ring-1 ring-border">
            <OplyrLogoMark className="h-9 w-9" />
          </div>
          <p className="text-xs text-text-tertiary">Your voice-native multi-agent dev cockpit</p>
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
              <div className="min-h-[28rem] rounded-[calc(var(--radius-panel)+6px)] border border-border bg-surface-1 px-10 py-10 text-center">
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Step 1</p>
                <h1 className="text-2xl font-semibold text-text-primary mb-3">
                  Welcome to Oplyr — what should we call you?
                </h1>
                <p className="mx-auto mb-5 max-w-xl text-sm text-text-secondary">
                  Oplyr is your voice-native dev cockpit: direct AI coding agents by voice or text,
                  review every change before it lands, and navigate your codebase as you build.
                </p>
                <div className="mx-auto mb-7 flex max-w-lg flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-text-tertiary">
                  <span>Talk or type to your agents</span>
                  <span aria-hidden>·</span>
                  <span>Approve every edit</span>
                  <span aria-hidden>·</span>
                  <span>Navigate your codebase</span>
                </div>
                <p className="mx-auto mb-6 max-w-xl text-xs text-text-tertiary">
                  Your name stays local to the app and you can change it later.
                </p>
                {error && <p className="text-sm text-danger mb-4">{error}</p>}
                <div className="mx-auto mb-8 max-w-sm">
                  <Input
                    autoFocus
                    maxLength={48}
                    className="h-12 rounded-[14px] px-4 text-base"
                    placeholder="Your name"
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && displayNameInput.trim() && !isSavingDisplayName) {
                        onSaveDisplayName(displayNameInput);
                      }
                    }}
                  />
                </div>
                <Button
                  disabled={!displayNameInput.trim() || isSavingDisplayName}
                  onClick={() => onSaveDisplayName(displayNameInput)}
                >
                  {isSavingDisplayName ? 'Saving...' : 'Continue'}
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="min-h-[34rem] rounded-[calc(var(--radius-panel)+6px)] border border-border bg-surface-1 px-10 py-10 text-center">
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Step 2</p>
                {typedWelcome && (
                  <p className="mb-4 text-lg font-medium text-accent" aria-live="polite">
                    {typedWelcome}
                  </p>
                )}
                <h1 className="text-3xl font-semibold text-text-primary mb-3">
                  Pick the agent you want to start with.
                </h1>
                <p className="mx-auto mb-8 max-w-2xl text-sm text-text-secondary">
                  Pick one to start — you can connect more agents and switch the active one anytime,
                  without losing your local project memory.
                </p>

                <div className="mx-auto mb-8 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
                  {providers.map((provider) => (
                    <motion.button
                      key={provider.id}
                      whileHover={{ y: -2 }}
                      className={cn(
                        'min-h-[15rem] rounded-[calc(var(--radius-panel)+2px)] border p-5 text-left transition-all',
                        selectedProviderId === provider.id
                          ? 'border-accent bg-accent-muted/60 shadow-[0_0_0_1px_rgba(0,212,245,0.22)]'
                          : 'border-border bg-surface-2 hover:border-accent-border hover:bg-surface-1'
                      )}
                      onClick={() => onSelectProvider(provider.id)}
                      type="button"
                    >
                      <div className="flex h-full flex-col">
                        <ProviderLogo
                          providerId={provider.id}
                          size="lg"
                          className="mb-5 h-20 w-full rounded-[20px] border-border/70"
                          imageClassName="h-9 w-auto max-w-[72%]"
                        />
                        <div className="mb-3">
                          <p className="text-lg font-semibold text-text-primary">{provider.name}</p>
                        </div>
                        <p className="mt-auto text-sm text-text-secondary">
                          {getProviderCardSummary(provider)}
                        </p>
                      </div>
                    </motion.button>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-3">
                  <Button variant="ghost" onClick={onBackToName}>
                    Back
                  </Button>
                  <Button disabled={!selectedProviderId} onClick={onContinueToInstructions}>
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && selectedProvider && (
              <div className="flex flex-col gap-4">
                <div className="overflow-hidden rounded-[calc(var(--radius-panel)+6px)] border border-border bg-surface-1">
                  <div className="bg-gradient-to-br from-accent-muted via-surface-1 to-surface-1 px-8 py-8 text-center">
                    <ProviderLogo
                      providerId={selectedProvider.id}
                      size="lg"
                      className="mx-auto mb-5 h-24 w-24 rounded-[28px]"
                      imageClassName="h-10 w-auto max-w-[72%]"
                    />
                    <p className="text-xs uppercase tracking-[0.22em] text-text-tertiary">Step 3</p>
                    <h1 className="mt-3 text-3xl font-semibold text-text-primary">
                      Connect {selectedProvider.name}
                    </h1>
                    <p className="mx-auto mt-3 max-w-2xl text-sm text-text-secondary">
                      {getFriendlyProviderStatus(selectedProvider)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-[calc(var(--radius-panel)+2px)] border border-accent-border/30 bg-surface-1 p-6">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                          Current provider
                        </p>
                        <p className="mt-2 text-lg font-semibold text-text-primary">
                          {selectedProvider.name}
                        </p>
                      </div>
                      <Badge
                        variant={
                          selectedProvider.appConnected
                            ? 'outline'
                            : selectedProvider.loggedIn
                              ? 'secondary'
                              : 'destructive'
                        }
                        className="text-xs"
                      >
                        {getProviderConnectionStateLabel(selectedProvider)}
                      </Badge>
                    </div>

                    {selectedProvider.loggedIn && !showSwitchAccountGuide && (
                      <div className="mb-4 rounded-[var(--radius-control)] bg-surface-2 p-4">
                        <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
                          Detected on this Mac
                        </span>
                        <div className="mt-3 flex items-center gap-3">
                          <ProviderLogo providerId={selectedProvider.id} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-text-primary">
                              {selectedProvider.accountLabel ?? 'Signed-in local session detected'}
                            </p>
                            <p className="text-xs text-text-tertiary">{selectedProvider.name}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {!selectedProvider.installed && (
                      <div className="mb-4 rounded-[var(--radius-control)] bg-surface-2 p-4">
                        <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
                          Install command
                        </span>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-accent">$</span>
                          <code className="text-sm font-mono text-text-primary">
                            {selectedProvider.installCommand}
                          </code>
                        </div>
                        <p className="mt-2 text-[11px] text-text-tertiary">
                          Needs Node.js / npm. After it installs, press “Check again”.
                        </p>
                      </div>
                    )}

                    {selectedProvider.installed &&
                      (!selectedProvider.loggedIn || showSwitchAccountGuide) && (
                        <div className="mb-4 flex flex-col gap-3">
                          {showSwitchAccountGuide && selectedProvider.logoutCommand && (
                            <div className="rounded-[var(--radius-control)] bg-surface-2 p-4">
                              <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
                                Switch account first
                              </span>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-accent">$</span>
                                <code className="text-sm font-mono text-text-primary">
                                  {selectedProvider.logoutCommand}
                                </code>
                              </div>
                            </div>
                          )}
                          <div className="rounded-[var(--radius-control)] bg-surface-2 p-4">
                            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
                              {showSwitchAccountGuide ? 'Sign in again' : 'Login command'}
                            </span>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-accent">$</span>
                              <code className="text-sm font-mono text-text-primary">
                                {selectedProvider.loginCommand}
                              </code>
                            </div>
                          </div>
                        </div>
                      )}

                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" onClick={onBackToProviderChoice}>
                        Back
                      </Button>
                      <Button variant="outline" onClick={onRefresh}>
                        Check again
                      </Button>
                      {selectedProvider.loggedIn &&
                        !selectedProvider.appConnected &&
                        selectedProvider.canSwitchAccount && (
                          <Button
                            variant="outline"
                            onClick={() => setShowSwitchAccountGuide((c) => !c)}
                          >
                            {showSwitchAccountGuide ? 'Use detected' : 'Different account'}
                          </Button>
                        )}
                      <Button
                        disabled={!selectedProvider.loggedIn || selectedProvider.appConnected}
                        onClick={() => onConnectProvider(selectedProvider.id)}
                      >
                        {getConnectButtonLabel(selectedProvider, showSwitchAccountGuide)}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-[calc(var(--radius-panel)+2px)] border border-border bg-surface-1 p-6">
                    <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
                      What to do
                    </span>
                    <ol className="mt-3 space-y-3">
                      {getProviderConnectSteps(selectedProvider, showSwitchAccountGuide).map(
                        (stepText) => (
                          <li
                            key={stepText}
                            className="flex items-start gap-3 text-sm text-text-secondary"
                          >
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-muted text-[10px] font-bold text-accent">
                              {getProviderConnectSteps(
                                selectedProvider,
                                showSwitchAccountGuide
                              ).indexOf(stepText) + 1}
                            </span>
                            {stepText}
                          </li>
                        )
                      )}
                    </ol>
                    <p className="mt-5 text-xs text-text-tertiary">
                      {getProviderConnectNote(
                        selectedProvider,
                        appSettings?.displayName ?? null,
                        showSwitchAccountGuide
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-4">
                <MemoryImportPanel compact hideWhenCaughtUp />
                <div className="min-h-[28rem] rounded-[calc(var(--radius-panel)+6px)] border border-border bg-surface-1 px-10 py-10 text-center">
                  <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Step 4</p>
                  <h1 className="text-2xl font-semibold text-text-primary mb-3">
                    Connect your first project
                  </h1>
                  <p className="mx-auto mb-8 max-w-xl text-sm text-text-secondary">
                    Point Oplyr at a project folder to start working — it scans your codebase into a
                    live map and your agents work inside this boundary. You can change it anytime.
                  </p>
                  {error && <p className="text-sm text-danger mb-4">{error}</p>}

                  <div className="mx-auto mb-6 flex max-w-md items-center gap-2">
                    <Input
                      autoFocus
                      className="h-11 flex-1 rounded-[14px] px-4 text-sm"
                      placeholder="/path/to/your/project"
                      value={projectInput}
                      onChange={(e) => setProjectInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && projectInput.trim())
                          onConnectProject(projectInput);
                      }}
                    />
                    {canBrowseProjectFolder && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          void onBrowseProjectFolder().then((folder) => {
                            if (folder) setProjectInput(folder);
                          });
                        }}
                      >
                        Browse…
                      </Button>
                    )}
                  </div>

                  {pendingAdvance ? (
                    <div className="mx-auto max-w-xl rounded-[var(--radius-panel)] border border-accent-border/40 bg-accent-muted/20 p-4 text-left">
                      <p className="text-sm font-medium text-text-primary">
                        Import your agent memory first?
                      </p>
                      <p className="mt-1 text-xs text-text-secondary">
                        We found {pendingCount} {pendingCount === 1 ? 'source' : 'sources'} from
                        your Claude / Codex setup that aren&apos;t in your brain yet. You can always
                        do this later from the Workspace screen.
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Button size="sm" onClick={() => setPendingAdvance(null)}>
                          Let me import
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => runAdvance(pendingAdvance)}
                        >
                          Continue without importing
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-3">
                      <Button variant="ghost" onClick={() => requestAdvance({ kind: 'skip' })}>
                        Skip for now
                      </Button>
                      <Button
                        disabled={!projectInput.trim()}
                        onClick={() => requestAdvance({ kind: 'connect', path: projectInput })}
                      >
                        Connect project
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="min-h-[28rem] rounded-[calc(var(--radius-panel)+6px)] border border-border bg-surface-1 px-10 py-10 text-center">
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Step 5</p>
                <h1 className="text-2xl font-semibold text-text-primary mb-3">
                  Pick your desk pet
                </h1>
                <p className="mx-auto mb-8 max-w-xl text-sm text-text-secondary">
                  A tiny companion that waddles along your top bar while you work. Purely for fun —
                  you can change it or turn it off anytime in Settings.
                </p>

                <div className="mx-auto mb-8 grid max-w-xl grid-cols-3 gap-3 sm:grid-cols-6">
                  {DESK_PETS.map((pet) => (
                    <button
                      key={pet}
                      type="button"
                      onClick={() => setPetChoice(pet)}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border px-2 py-4 transition-all',
                        petChoice === pet
                          ? 'border-accent bg-accent-muted/60 shadow-[0_0_0_1px_rgba(0,212,245,0.22)]'
                          : 'border-border bg-surface-2 hover:border-accent-border hover:bg-surface-1'
                      )}
                    >
                      <span className="flex h-12 items-end justify-center">
                        <PetPreview pet={pet} />
                      </span>
                      <span className="text-xs font-medium text-text-primary">
                        {PET_LABELS[pet]}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-3">
                  <Button variant="ghost" onClick={onBackToProject}>
                    ← Back
                  </Button>
                  <Button variant="ghost" onClick={onSkipPet}>
                    Skip — I&apos;ll pick later
                  </Button>
                  <Button onClick={() => onChoosePet(petChoice)}>
                    Choose {PET_LABELS[petChoice]}
                  </Button>
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
  if (provider.appConnected) return 'Already connected in Oplyr';
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
  return `${provider.name} is connected and ready inside Oplyr.`;
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
  return `Continue with ${getProviderShortName(provider.id)}`;
}

function getProviderConnectSteps(
  provider: AssistantProviderStatus,
  showSwitchAccountGuide: boolean
) {
  if (!provider.installed)
    return [
      `Install ${provider.name} on this Mac.`,
      'Return here and press Check again.',
      'Finish by connecting it inside Oplyr.'
    ];
  if (!provider.loggedIn)
    return [
      'Run the login command in Terminal.',
      'Complete the browser sign-in flow.',
      'Come back here and press Check again.'
    ];
  if (showSwitchAccountGuide && provider.logoutCommand)
    return [
      `Run ${provider.logoutCommand} in Terminal.`,
      `Sign back in with ${provider.loginCommand}.`,
      'Return here, press Check again, then continue.'
    ];
  if (!provider.appConnected)
    return [
      provider.accountLabel
        ? `${provider.name} is signed in as ${provider.accountLabel}.`
        : `${provider.name} is signed in.`,
      'Press Continue to let Oplyr use this account.',
      'You can disconnect later and reconnect a different provider without losing Oplyr history.'
    ];
  return [
    `${provider.name} is connected to Oplyr.`,
    'Your workspace unlocks automatically after setup.',
    'You can disconnect later and reconnect a different provider without deleting Oplyr memory.'
  ];
}

function getProviderConnectNote(
  provider: AssistantProviderStatus,
  displayName: string | null,
  showSwitchAccountGuide: boolean
) {
  const firstName = displayName?.trim().split(/\s+/)[0];
  if (provider.appConnected)
    return firstName ? `You are ready to go, ${firstName}.` : 'You are ready to go.';
  if (showSwitchAccountGuide)
    return 'Oplyr does not change system accounts itself. Switch accounts in the CLI first, then come back and reconnect here.';
  if (provider.loggedIn)
    return 'Oplyr only connects to the session already signed in on this machine. It does not copy or store your provider credentials.';
  return 'Oplyr only uses providers you explicitly connect here. Nothing is auto-enabled.';
}

function getProviderShortName(providerId: AssistantProviderId) {
  if (providerId === 'claude') {
    return 'Claude';
  }

  if (providerId === 'gemini') {
    return 'Gemini';
  }

  return 'Codex';
}
