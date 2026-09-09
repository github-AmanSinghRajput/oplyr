import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, Settings2 } from 'lucide-react';
import { useApi } from '@/providers/ApiProvider';
import type {
  BrainGraphResponse,
  BrainProjectSettings,
  BrainRecallAtom,
  BrainStatusResponse
} from '@/containers/voice-console/lib/types';
import { MemoryStatusPill } from './memory/MemoryStatusPill';
import { MemoryGraph } from './memory/MemoryGraph';
import { MemorySearchBox } from './memory/MemorySearch';
import { MemoryInspector } from './memory/MemoryInspector';
import { MemoryDrawer } from './memory/MemoryDrawer';
import { recentToDrawerItems, resultsToDrawerItems } from './memory/memory-shared';
import { MemorySettingsOverlay } from './memory/MemorySettingsOverlay';
import { resolveAtomDetail } from './memory/memory-atom-detail-model';
import { useBrainEvents } from './memory/use-brain-events';
import type { BrainSettingsUpdate } from './memory/memory-settings-model';
import './memory/memory.css';

const emptyGraph: BrainGraphResponse = { nodes: [], edges: [] };

export function MemoryScreen({ refreshNonce }: { refreshNonce?: number }) {
  const { service } = useApi();
  const [status, setStatus] = useState<BrainStatusResponse | null>(null);
  const [graph, setGraph] = useState<BrainGraphResponse>(emptyGraph);
  const [searchResults, setSearchResults] = useState<BrainRecallAtom[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [livePulse, setLivePulse] = useState(false);

  const livePulseTimer = useRef<number | null>(null);
  // Trailing-debounce timer for live reloads: an import stores atoms in a burst (one brain_update
  // each), so we collapse the burst into a single graph rebuild instead of dozens.
  const reloadTimer = useRef<number | null>(null);
  // Guards async state writes: a burst of brain_update events can leave a load() in flight when the
  // screen unmounts; without this React warns about setting state on an unmounted component.
  const mountedRef = useRef(true);

  // Selecting a node and selecting an edge are mutually exclusive — one inspector at a time.
  const selectNode = useCallback((id: string | null) => {
    setSelectedEdgeId(null);
    setSelectedId(id);
  }, []);

  const selectEdge = useCallback((id: string) => {
    setSelectedId(null);
    setSelectedEdgeId(id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedEdgeId(null);
  }, []);

  // Load status + graph together (called on mount and on every live brain_update).
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStatus, nextGraph] = await Promise.all([
        service.getBrainStatus(),
        service.getBrainGraph()
      ]);
      if (!mountedRef.current) {
        return;
      }
      setStatus(nextStatus);
      setGraph(nextGraph);
    } catch (loadError) {
      if (mountedRef.current) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load memory.');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  // Full-app refresh (topbar refresh button bumps refreshNonce): re-fetch the brain. Skip the first
  // run — the mount effect above already loads.
  const refreshMountRef = useRef(false);
  useEffect(() => {
    if (!refreshMountRef.current) {
      refreshMountRef.current = true;
      return;
    }
    void load();
  }, [refreshNonce, load]);

  // Live refresh: reuse the existing /api/voice/events SSE stream (no polling, no second stream).
  const handleBrainUpdate = useCallback(() => {
    setLivePulse(true);
    if (livePulseTimer.current !== null) {
      window.clearTimeout(livePulseTimer.current);
    }
    livePulseTimer.current = window.setTimeout(() => setLivePulse(false), 2500);
    // Debounce the actual reload — the pulse is instant feedback, but rebuilding the whole graph on
    // every event during an import storm thrashes the canvas. One trailing reload once it quiets.
    if (reloadTimer.current !== null) {
      window.clearTimeout(reloadTimer.current);
    }
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null;
      void load();
    }, 900);
  }, [load]);

  useBrainEvents(handleBrainUpdate);

  useEffect(() => {
    // Reset on (re)mount, not just at init: under React StrictMode the mount→unmount→remount cycle
    // runs the cleanup once, setting this false. useRef keeps its value across that remount, so
    // without re-setting it here the ref stays false forever and every load()'s state writes
    // (status/graph/loading) are silently skipped — the graph + settings drawer hang on "Loading…".
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (livePulseTimer.current !== null) {
        window.clearTimeout(livePulseTimer.current);
      }
      if (reloadTimer.current !== null) {
        window.clearTimeout(reloadTimer.current);
      }
    };
  }, []);

  /** Return the drawer to the live capture feed, as if no search had happened. */
  const resetSearch = useCallback(() => {
    setQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setSearching(false);
  }, []);

  const runSearch = useCallback(
    async (nextQuery: string) => {
      // Clearing the box and pressing Enter reverts to the pre-search state. It used to send the
      // empty string to the API and leave the results view pinned open with nothing in it.
      if (!nextQuery.trim()) {
        resetSearch();
        return;
      }
      setSearching(true);
      setHasSearched(true);
      setError(null);
      try {
        const response = await service.searchBrain(nextQuery);
        setSearchResults(response.atoms);
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : 'Search failed.');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [resetSearch, service]
  );

  const updateSettings = useCallback<BrainSettingsUpdate>(
    (input, optimistic) => {
      if (optimistic) {
        setStatus((current) =>
          current ? { ...current, settings: optimistic(current.settings) } : current
        );
      }
      setBusy('settings');
      setError(null);
      void (async () => {
        try {
          const nextSettings = await service.updateBrainSettings(input);
          setStatus((current) => (current ? { ...current, settings: nextSettings } : current));
        } catch (updateError) {
          setError(
            updateError instanceof Error ? updateError.message : 'Could not update settings.'
          );
          await load();
        } finally {
          setBusy(null);
        }
      })();
    },
    [load, service]
  );

  const updateProject = useCallback(
    (input: Partial<BrainProjectSettings>) => {
      const projectKey = status?.project.key;
      if (!projectKey) {
        return;
      }
      setStatus((current) =>
        current ? { ...current, project: { ...current.project, ...input } } : current
      );
      setBusy('project');
      setError(null);
      void (async () => {
        try {
          const next = await service.updateBrainProjectSettings(projectKey, input);
          setStatus((current) =>
            current ? { ...current, project: { ...current.project, ...next } } : current
          );
        } catch (projectError) {
          setError(
            projectError instanceof Error ? projectError.message : 'Could not update project.'
          );
          await load();
        } finally {
          setBusy(null);
        }
      })();
    },
    [load, service, status?.project.key]
  );

  const deleteAtom = useCallback(
    (atomId: string) => {
      setBusy(atomId);
      setError(null);
      void (async () => {
        try {
          await service.deleteBrainAtom(atomId);
          if (selectedId === atomId) {
            setSelectedId(null);
          }
          setSearchResults((current) => current.filter((atom) => atom.id !== atomId));
          await load();
        } catch (deleteError) {
          setError(deleteError instanceof Error ? deleteError.message : 'Could not delete memory.');
        } finally {
          setBusy(null);
        }
      })();
    },
    [load, selectedId, service]
  );

  const resetBrain = useCallback(() => {
    if (
      !window.confirm('Delete ALL local Oplyr Brain memory on this machine? This cannot be undone.')
    ) {
      return;
    }
    setBusy('reset');
    setError(null);
    void (async () => {
      try {
        await service.resetBrain();
        clearSelection();
        setSearchResults([]);
        setHasSearched(false);
        setQuery('');
        setSettingsOpen(false);
        await load();
      } catch (resetError) {
        setError(resetError instanceof Error ? resetError.message : 'Could not reset memory.');
      } finally {
        setBusy(null);
      }
    })();
  }, [clearSelection, load, service]);

  const currentProjectKey = status?.project.key ?? null;
  const recentAtoms = useMemo(() => status?.recentAtoms ?? [], [status?.recentAtoms]);
  const selectedDetail = useMemo(
    () =>
      selectedId
        ? resolveAtomDetail(selectedId, {
            recentAtoms,
            searchResults,
            graphNodes: graph.nodes,
            currentProjectKey
          })
        : null,
    [currentProjectKey, graph.nodes, recentAtoms, searchResults, selectedId]
  );

  const selectedEdge = useMemo(
    () =>
      selectedEdgeId ? (graph.edges.find((edge) => edge.id === selectedEdgeId) ?? null) : null,
    [graph.edges, selectedEdgeId]
  );
  const edgeSource = useMemo(
    () =>
      selectedEdge ? (graph.nodes.find((node) => node.id === selectedEdge.source) ?? null) : null,
    [graph.nodes, selectedEdge]
  );
  const edgeTarget = useMemo(
    () =>
      selectedEdge ? (graph.nodes.find((node) => node.id === selectedEdge.target) ?? null) : null,
    [graph.nodes, selectedEdge]
  );

  const hasGraph = graph.nodes.length > 0;

  return (
    <div className="memory-page">
      {error ? <div className="memory-error">{error}</div> : null}

      <div className="memory-toolbar">
        <MemoryStatusPill
          status={status}
          busy={busy === 'settings'}
          onToggleEnabled={(enabled) =>
            updateSettings({ enabled }, (current) => ({ ...current, enabled }))
          }
        />

        <MemorySearchBox
          query={query}
          searching={searching}
          matchCount={hasSearched ? searchResults.length : null}
          onQueryChange={setQuery}
          onSubmit={(next) => void runSearch(next)}
          onReset={resetSearch}
        />

        <button
          type="button"
          className="memory-toolbar__gear"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open memory settings"
          title="Memory settings"
        >
          <Settings2 size={16} />
        </button>
      </div>

      <div className="memory-stage">
        {hasGraph ? (
          <MemoryGraph
            nodes={graph.nodes}
            edges={graph.edges}
            selectedId={selectedId}
            selectedEdgeId={selectedEdgeId}
            onSelectNode={selectNode}
            onSelectEdge={selectEdge}
            onClear={clearSelection}
          />
        ) : (
          <div className="memory-empty-state">
            <BrainCircuit size={30} />
            <strong>{loading ? 'Loading the graph…' : 'No memories yet'}</strong>
            <p>
              Just talk to your agent — share how you like to work or a decision for this project,
              and Oplyr distills a durable memory from each turn and draws it here.
            </p>
          </div>
        )}

        <MemoryInspector
          detail={selectedDetail}
          edge={selectedEdge}
          edgeSource={edgeSource}
          edgeTarget={edgeTarget}
          busy={busy === selectedDetail?.id}
          onSelectNode={selectNode}
          onDelete={deleteAtom}
          onClose={clearSelection}
        />
      </div>

      <MemoryDrawer
        items={hasSearched ? resultsToDrawerItems(searchResults) : recentToDrawerItems(recentAtoms)}
        mode={hasSearched ? 'results' : 'recent'}
        query={query}
        live={livePulse}
        selectedId={selectedId}
        collapsed={drawerCollapsed}
        onToggleCollapsed={() => setDrawerCollapsed((value) => !value)}
        onSelect={selectNode}
      />

      <MemorySettingsOverlay
        open={settingsOpen}
        status={status}
        busy={busy === 'settings' || busy === 'project' || busy === 'reset'}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={updateSettings}
        onUpdateProject={updateProject}
        onReset={resetBrain}
      />
    </div>
  );
}
