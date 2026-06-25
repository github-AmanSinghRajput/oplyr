import { useCallback, useEffect, useState } from 'react';
import {
  ChevronsDownUp,
  FolderTree,
  Loader2,
  Network,
  RefreshCw,
  Sparkles,
  Workflow,
  X
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useApi } from '@/providers/ApiProvider';
import type {
  CodebaseFileSummaryResponse,
  CodebaseFileSymbol,
  CodebaseMapData
} from '@/containers/voice-console/lib/types';
import { TreeGraph } from './codebase-map/TreeGraph';
import { ForceGraph } from './codebase-map/ForceGraph';
import { allFolderIds } from './codebase-map/elk-layout';

interface CodebaseMapScreenProps {
  projectRoot: string | null;
}

type SummaryState = { loading: boolean; summary: string | null; error?: string };
type SymbolState = { loading: boolean; items: CodebaseFileSymbol[]; error?: string };
type ViewMode = 'tree' | 'force';

// Default the tree to fully collapsed: every top-level folder closed, so you start with a tidy
// overview and drill in. (Deeper folders are inside these, hidden until you expand.)
function topLevelCollapsed(map: CodebaseMapData | null): Set<string> {
  if (!map) return new Set();
  return new Set(allFolderIds(map.nodes).filter((id) => !id.includes('/')));
}

export function CodebaseMapScreen({ projectRoot }: CodebaseMapScreenProps) {
  const { service } = useApi();
  const [map, setMap] = useState<CodebaseMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('force');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});
  const [symbolsByPath, setSymbolsByPath] = useState<Record<string, SymbolState>>({});
  const [fnSummaries, setFnSummaries] = useState<Record<string, Record<string, SummaryState>>>({});

  useEffect(() => {
    let active = true;
    if (!projectRoot) {
      setMap(null);
      return;
    }
    setLoading(true);
    setError(null);
    service
      .getCodebaseMap()
      .then((response) => {
        if (active) {
          setMap(response.map);
          setCollapsed(topLevelCollapsed(response.map));
        }
      })
      .catch(() => {
        if (active) setError('Could not load the codebase map.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectRoot, service]);

  const handleRescan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const response = await service.rescanCodebaseMap();
      setMap(response.map);
      setSummaries({});
      setSymbolsByPath({});
      setFnSummaries({});
      setSelectedId(null);
      setCollapsed(topLevelCollapsed(response.map));
    } catch {
      setError('Re-scan failed.');
    } finally {
      setScanning(false);
    }
  }, [service]);

  const requestSummary = useCallback(
    async (path: string) => {
      setSummaries((prev) => {
        if (prev[path]?.summary || prev[path]?.loading) return prev;
        return { ...prev, [path]: { loading: true, summary: null } };
      });
      try {
        const result: CodebaseFileSummaryResponse = await service.summarizeCodebaseFile(path);
        setSummaries((prev) => ({
          ...prev,
          [path]: { loading: false, summary: result.summary, error: result.error }
        }));
      } catch {
        setSummaries((prev) => ({
          ...prev,
          [path]: { loading: false, summary: null, error: 'Could not generate a summary.' }
        }));
      }
    },
    [service]
  );

  const requestSymbols = useCallback(
    async (path: string) => {
      setSymbolsByPath((prev) =>
        prev[path] ? prev : { ...prev, [path]: { loading: true, items: [] } }
      );
      try {
        const res = await service.getCodebaseFileSymbols(path);
        setSymbolsByPath((prev) => ({
          ...prev,
          [path]: { loading: false, items: res.symbols, error: res.error }
        }));
      } catch {
        setSymbolsByPath((prev) => ({
          ...prev,
          [path]: { loading: false, items: [], error: 'Could not read functions.' }
        }));
      }
    },
    [service]
  );

  const requestFnSummary = useCallback(
    async (path: string, name: string) => {
      setFnSummaries((prev) => ({
        ...prev,
        [path]: { ...(prev[path] ?? {}), [name]: { loading: true, summary: null } }
      }));
      try {
        const res = await service.summarizeCodebaseFile(path, name);
        setFnSummaries((prev) => ({
          ...prev,
          [path]: {
            ...(prev[path] ?? {}),
            [name]: { loading: false, summary: res.summary, error: res.error }
          }
        }));
      } catch {
        setFnSummaries((prev) => ({
          ...prev,
          [path]: {
            ...(prev[path] ?? {}),
            [name]: { loading: false, summary: null, error: 'Could not summarize.' }
          }
        }));
      }
    },
    [service]
  );

  const handleSelect = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id) {
        void requestSummary(id);
        void requestSymbols(id);
      }
    },
    [requestSummary, requestSymbols]
  );

  const toggleFolder = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    if (!map) return;
    setCollapsed(new Set(allFolderIds(map.nodes).filter((id) => !id.includes('/'))));
  }, [map]);
  const expandAll = useCallback(() => setCollapsed(new Set()), []);

  const selectedNode = map?.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedSummary = selectedId ? summaries[selectedId] : undefined;
  const topLanguages = map
    ? Object.entries(map.stats.languages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : [];

  if (!projectRoot) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <FolderTree size={32} className="text-text-tertiary" />
        <h2 className="text-lg font-semibold text-text-primary">No workspace connected</h2>
        <p className="max-w-sm text-sm text-text-tertiary">
          Connect a project on the Workspace screen — Oplyr scans it into a live map the moment
          it&apos;s connected.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Codebase map
          </p>
          <h2 className="text-lg font-semibold text-text-primary">
            {map?.projectName ?? 'Scanning your repository…'}
          </h2>
          {map ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{map.stats.totalFiles} files</Badge>
              <Badge variant="outline">{map.nodes.length} mapped</Badge>
              <Badge variant="outline">{map.stats.edges} links</Badge>
              {topLanguages.map(([language, fileCount]) => (
                <Badge key={language} variant="secondary">
                  {language} · {fileCount}
                </Badge>
              ))}
              {map.stats.truncated ? (
                <Badge variant="secondary" title="Large repo — showing the most-connected files">
                  top {map.nodes.length} shown
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-border bg-surface-1 p-0.5">
            <button
              type="button"
              onClick={() => setView('tree')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                view === 'tree'
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-tertiary hover:text-text-primary'
              )}
            >
              <FolderTree size={13} /> Tree
            </button>
            <button
              type="button"
              onClick={() => setView('force')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                view === 'force'
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-tertiary hover:text-text-primary'
              )}
            >
              <Network size={13} /> Force
            </button>
          </div>

          {view === 'tree' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={collapsed.size > 0 ? expandAll : collapseAll}
              disabled={!map}
            >
              <ChevronsDownUp size={14} />
              {collapsed.size > 0 ? 'Expand all' : 'Collapse all'}
            </Button>
          ) : null}

          <Button variant="outline" size="sm" onClick={handleRescan} disabled={scanning || loading}>
            <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
            {scanning ? 'Scanning…' : 'Re-scan'}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {/* Graph + detail */}
      <div className="flex min-h-0 gap-4">
        <div className="relative h-[calc(100vh-var(--topbar-height)-180px)] min-h-[460px] flex-1 overflow-hidden rounded-[var(--radius-panel)] border border-border bg-background">
          {loading ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/70">
              <Loader2 size={22} className="animate-spin text-accent" />
              <p className="text-sm text-text-tertiary">Scanning the repository…</p>
            </div>
          ) : null}

          {map && map.nodes.length > 0 ? (
            view === 'tree' ? (
              <TreeGraph
                map={map}
                selectedId={selectedId}
                collapsed={collapsed}
                onSelect={handleSelect}
                onToggleFolder={toggleFolder}
              />
            ) : (
              <ForceGraph map={map} selectedId={selectedId} onSelect={handleSelect} />
            )
          ) : !loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Workflow size={28} className="text-text-tertiary" />
              <p className="max-w-xs text-sm text-text-tertiary">
                No JavaScript/TypeScript source files found to map yet. Re-scan, or open a repo with
                source files.
              </p>
            </div>
          ) : null}
        </div>

        {/* Detail panel — file summary + scrollable functions list (both views). */}
        {selectedNode ? (
          <aside className="flex max-h-[calc(100vh-var(--topbar-height)-180px)] w-80 shrink-0 flex-col gap-3 self-start overflow-y-auto rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-text-primary" title={selectedNode.id}>
                  {selectedNode.label}
                </p>
                <p
                  className="mt-0.5 truncate font-mono text-[11px] text-text-tertiary"
                  title={selectedNode.id}
                >
                  {selectedNode.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-md p-1 text-text-tertiary transition-colors hover:text-text-primary"
                aria-label="Close details"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{selectedNode.language}</Badge>
              <Badge variant="secondary">{selectedNode.degree} connections</Badge>
            </div>

            <div className="rounded-md border border-accent-border/30 bg-background p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                <Sparkles size={12} className="text-accent" />
                AI summary
              </div>
              {selectedSummary?.loading ? (
                <div className="flex items-center gap-2 text-sm text-text-tertiary">
                  <Loader2 size={14} className="animate-spin" />
                  Reading the file…
                </div>
              ) : selectedSummary?.summary ? (
                <p className="text-sm leading-relaxed text-text-primary">
                  {selectedSummary.summary}
                </p>
              ) : selectedSummary?.error ? (
                <p className="text-sm text-text-tertiary">{selectedSummary.error}</p>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void requestSummary(selectedNode.id)}
                >
                  <Sparkles size={13} /> Generate summary
                </Button>
              )}
            </div>

            {/* Functions */}
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Functions
                {symbolsByPath[selectedNode.id]?.items?.length
                  ? ` · ${symbolsByPath[selectedNode.id].items.length}`
                  : ''}
              </p>
              {symbolsByPath[selectedNode.id]?.loading ? (
                <p className="flex items-center gap-1.5 text-sm text-text-tertiary">
                  <Loader2 size={13} className="animate-spin" /> Scanning…
                </p>
              ) : symbolsByPath[selectedNode.id]?.items?.length ? (
                <div className="flex flex-col gap-1">
                  {symbolsByPath[selectedNode.id].items.map((symbol) => {
                    const fn = fnSummaries[selectedNode.id]?.[symbol.name];
                    return (
                      <div key={symbol.name} className="rounded-md border border-border">
                        <button
                          type="button"
                          onClick={() => void requestFnSummary(selectedNode.id, symbol.name)}
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-2"
                        >
                          <span className="font-mono text-[12px] text-text-primary">
                            {symbol.name}
                          </span>
                          <span className="ml-auto text-[9px] uppercase tracking-wide text-text-tertiary">
                            {symbol.kind}
                          </span>
                          <Sparkles size={11} className="text-accent" />
                        </button>
                        {fn?.loading ? (
                          <p className="px-2 pb-1.5 text-[11px] text-text-tertiary">Summarizing…</p>
                        ) : fn?.summary ? (
                          <p className="px-2 pb-1.5 text-[11px] leading-relaxed text-text-secondary">
                            {fn.summary}
                          </p>
                        ) : fn?.error ? (
                          <p className="px-2 pb-1.5 text-[11px] text-text-tertiary">{fn.error}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-text-tertiary">
                  {symbolsByPath[selectedNode.id]?.error ?? 'No top-level functions found.'}
                </p>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
