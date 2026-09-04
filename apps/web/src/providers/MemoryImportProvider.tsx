/* eslint-disable react-refresh/only-export-components -- provider + its hook are intentionally co-located; this rule is hot-reload DX only */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { useApi } from './ApiProvider';
import { useStatus } from './StatusProvider';
import type {
  AssistantProviderId,
  ImportFile,
  ImportManifest,
  ImportSelector
} from '@/containers/voice-console/lib/types';

export type ImportScanState = 'idle' | 'scanning' | 'ready' | 'error';
export type ImportRunStatus = 'idle' | 'running' | 'done' | 'error';
export type SourceRunState = 'adding' | 'added';

export interface ImportRunState {
  status: ImportRunStatus;
  current: number;
  total: number;
  atomsAdded: number;
  activeLabel: string;
  error: string | null;
  /** Path → live state while a run streams; absent means "queued". */
  perSource: Record<string, SourceRunState>;
  skipped: string[];
}

const IDLE_RUN: ImportRunState = {
  status: 'idle',
  current: 0,
  total: 0,
  atomsAdded: 0,
  activeLabel: '',
  error: null,
  perSource: {},
  skipped: []
};

interface MemoryImportContextValue {
  scanState: ImportScanState;
  manifest: ImportManifest | null;
  scanError: string | null;
  /** Any discovered sources at all (pending or already-in). */
  hasImportable: boolean;
  /** Count of pending (new/changed) sources — what the panels show as selectable. */
  pendingCount: number;
  /** Count of sources already in the brain — what the "N already in your brain" line reveals. */
  addedCount: number;
  selected: Set<string>;
  selectedCount: number;
  toggle: (path: string) => void;
  rescan: () => Promise<void>;
  run: ImportRunState;
  startImport: () => Promise<void>;
  dismissDone: () => void;
  /** Session-level "hide the import card" — lives here (not in a screen) so it survives tab switches.
   *  Dismissing collapses the card to a slim row rather than removing it, so it's always recoverable. */
  dismissed: boolean;
  dismiss: () => void;
  undismiss: () => void;
}

const MemoryImportContext = createContext<MemoryImportContextValue | null>(null);

/** Flatten a manifest to (providerId, file) pairs in a stable order (global, projects, sessions). */
function eachFile(
  manifest: ImportManifest | null
): Array<{ providerId: AssistantProviderId; file: ImportFile }> {
  if (!manifest) return [];
  const out: Array<{ providerId: AssistantProviderId; file: ImportFile }> = [];
  for (const agent of manifest.agents) {
    if (agent.global) out.push({ providerId: agent.providerId, file: agent.global });
    for (const file of agent.projects) out.push({ providerId: agent.providerId, file });
    for (const file of agent.sessions) out.push({ providerId: agent.providerId, file });
  }
  return out;
}

/** Pending = not already in the brain (new / changed / unscanned). */
export function isPendingSource(file: ImportFile): boolean {
  return file.status !== 'added';
}

/**
 * App-root owner of the memory-import experience: one scan, one selection, one running import shared
 * by every surface (Onboarding, Workspace, Memory) plus the Topbar pill. Because it lives above the
 * screens it never unmounts, so a running import survives navigation instead of restarting.
 */
export function MemoryImportProvider({ children }: { children: ReactNode }) {
  const { service } = useApi();
  const { assistantReady } = useStatus();
  const [scanState, setScanState] = useState<ImportScanState>('idle');
  const [manifest, setManifest] = useState<ImportManifest | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [run, setRun] = useState<ImportRunState>(IDLE_RUN);
  const [dismissed, setDismissed] = useState(false);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const rescan = useCallback(async () => {
    setScanState('scanning');
    setScanError(null);
    try {
      const result = await service.scanMemoryImport();
      if (!mountedRef.current) return;
      setManifest(result);
      // Pre-select every pending source; already-added ones are excluded from selection.
      const next = new Set<string>();
      for (const { file } of eachFile(result)) if (isPendingSource(file)) next.add(file.path);
      setSelected(next);
      setScanState('ready');
    } catch (err) {
      if (!mountedRef.current) return;
      setScanError(err instanceof Error ? err.message : 'Could not check for existing memory.');
      setScanState('error');
    }
  }, [service]);

  // Scan once an agent is connected — there's nothing to find before that, and the scan is read-only.
  useEffect(() => {
    if (assistantReady && scanState === 'idle') void rescan();
  }, [assistantReady, scanState, rescan]);

  const toggle = useCallback((path: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const startImport = useCallback(async () => {
    if (runningRef.current || !manifest) return;
    const selectors: ImportSelector[] = [];
    for (const agent of manifest.agents) {
      const paths = [agent.global, ...agent.projects, ...agent.sessions]
        .filter((file): file is ImportFile => Boolean(file))
        .filter((file) => selected.has(file.path))
        .map((file) => file.path);
      if (paths.length > 0) selectors.push({ providerId: agent.providerId, paths });
    }
    const total = selectors.reduce((sum, selector) => sum + selector.paths.length, 0);
    if (total === 0) return;

    runningRef.current = true;
    setDismissed(false); // a starting run always re-shows the panel so its progress is visible
    setRun({ ...IDLE_RUN, status: 'running', total });
    try {
      await service.runMemoryImport({ selectors, includeProjectScope: true }, (event) => {
        if (!mountedRef.current) return;
        if (event.phase === 'summary') {
          setRun((prev) => ({ ...prev, atomsAdded: event.atomsAdded, skipped: event.skipped }));
          return;
        }
        setRun((prev) => {
          const perSource = { ...prev.perSource };
          if (event.sourcePath) {
            // The previously-active source is done; the current one is now being added.
            for (const key of Object.keys(perSource)) {
              if (perSource[key] === 'adding') perSource[key] = 'added';
            }
            if (event.phase !== 'done') perSource[event.sourcePath] = 'adding';
          }
          return {
            ...prev,
            current: event.current,
            total: event.total || prev.total,
            atomsAdded: event.atomsAdded,
            activeLabel: event.sourceLabel || prev.activeLabel,
            perSource
          };
        });
      });
      if (!mountedRef.current) return;
      setRun((prev) => {
        const perSource = { ...prev.perSource };
        for (const key of Object.keys(perSource)) perSource[key] = 'added';
        return { ...prev, status: 'done', current: prev.total, perSource };
      });
      // Refresh from the ledger so the just-added sources drop out of the pending list.
      await rescan();
    } catch (err) {
      if (!mountedRef.current) return;
      setRun((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Import failed. Please try again.'
      }));
    } finally {
      runningRef.current = false;
    }
  }, [manifest, selected, service, rescan]);

  // Clear a finished run (so the pill hides and panels reset). A no-op mid-run.
  const dismissDone = useCallback(() => {
    setRun((prev) => (prev.status === 'running' ? prev : IDLE_RUN));
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);
  const undismiss = useCallback(() => setDismissed(false), []);

  const value = useMemo<MemoryImportContextValue>(() => {
    const files = eachFile(manifest);
    const pending = files.filter(({ file }) => isPendingSource(file));
    const added = files.filter(({ file }) => file.status === 'added');
    return {
      scanState,
      manifest,
      scanError,
      hasImportable: files.length > 0,
      pendingCount: pending.length,
      addedCount: added.length,
      selected,
      selectedCount: selected.size,
      toggle,
      rescan,
      run,
      startImport,
      dismissDone,
      dismissed,
      dismiss,
      undismiss
    };
  }, [
    scanState,
    manifest,
    scanError,
    selected,
    run,
    toggle,
    rescan,
    startImport,
    dismissDone,
    dismissed,
    dismiss,
    undismiss
  ]);

  return <MemoryImportContext value={value}>{children}</MemoryImportContext>;
}

export function useMemoryImport() {
  const ctx = useContext(MemoryImportContext);
  if (!ctx) throw new Error('useMemoryImport must be used within MemoryImportProvider');
  return ctx;
}
