import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronsDownUp,
  FolderTree,
  Info,
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
  AssistantErrorKind,
  CodebaseFileSummaryResponse,
  CodebaseFileSymbol,
  CodebaseMapData,
  DetectedRepo
} from '@/containers/voice-console/lib/types';
import { TreeGraph } from './codebase-map/TreeGraph';
import { ForceGraph } from './codebase-map/ForceGraph';
import { allFolderIds, childFolderIds } from './codebase-map/elk-layout';

interface CodebaseMapScreenProps {
  projectRoot: string | null;
}

type SummaryState = {
  loading: boolean;
  summary: string | null;
  error?: string;
  errorKind?: AssistantErrorKind;
};
type SymbolState = { loading: boolean; items: CodebaseFileSymbol[]; error?: string };
type ViewMode = 'tree' | 'force';

// Default the tree to fully collapsed: every top-level folder closed, so you start with a tidy
// overview and drill in. (Deeper folders are inside these, hidden until you expand.)
function topLevelCollapsed(map: CodebaseMapData | null): Set<string> {
  if (!map) return new Set();
  return new Set(allFolderIds(map.nodes).filter((id) => !id.includes('/')));
}

// Programming languages the scanner labels that are worth flagging as "present but not mapped yet"
// (excludes data/markup like JSON, Markdown, CSS, YAML, SQL, Shell, Other).
const MAPPABLE_CANDIDATE_LANGUAGES = new Set([
  'Ruby',
  'Go',
  'Rust',
  'Java',
  'Kotlin',
  'Swift',
  'C',
  'C++',
  'C#',
  'PHP'
]);

/** "A, B & C" — human-friendly language list. */
function formatLanguageList(languages: string[]): string {
  if (languages.length <= 1) return languages[0] ?? '';
  return `${languages.slice(0, -1).join(', ')} & ${languages[languages.length - 1]}`;
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
  // A workspace folder can hold several git repos (backend + frontend). We detect them and let the
  // user pick which one to map; `selectedRepo` is that repo's path relative to the folder (undefined
  // = map the folder itself, for a plain single-repo or non-git folder).
  const [repos, setRepos] = useState<DetectedRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | undefined>(undefined);

  const loadMap = useCallback(
    async (repo: string | undefined) => {
      setLoading(true);
      setError(null);
      try {
        const response = await service.getCodebaseMap(repo);
        setMap(response.map);
        setCollapsed(topLevelCollapsed(response.map));
      } catch {
        setError('Could not load the codebase map.');
      } finally {
        setLoading(false);
      }
    },
    [service]
  );

  // On connect: detect repos inside the folder, default to the first, and load its map. A folder with
  // no git repo (or a single repo) just maps itself; a parent with several lets the user switch below.
  useEffect(() => {
    if (!projectRoot) {
      setMap(null);
      setRepos([]);
      setSelectedRepo(undefined);
      return;
    }
    let active = true;
    void (async () => {
      let repoList: DetectedRepo[] = [];
      try {
        repoList = (await service.getWorkspaceRepos()).repos;
      } catch {
        /* repo detection is best-effort — fall back to mapping the folder itself */
      }
      if (!active) return;
      setRepos(repoList);
      if (repoList.length > 1) {
        // Several git repos in this workspace — don't auto-pick one; the user chooses below and the
        // map stays empty (with a prompt) until they do.
        setSelectedRepo(undefined);
        setMap(null);
      } else {
        // A single repo (map it) or a plain/non-git folder (map the folder itself).
        const initial = repoList.length === 1 ? repoList[0]!.relativePath : undefined;
        setSelectedRepo(initial);
        await loadMap(initial);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectRoot, service, loadMap]);

  const handleSelectRepo = useCallback(
    (repo: string) => {
      setSelectedRepo(repo);
      setSummaries({});
      setSymbolsByPath({});
      setFnSummaries({});
      setSelectedId(null);
      void loadMap(repo);
    },
    [loadMap]
  );

  const handleRescan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const response = await service.rescanCodebaseMap(selectedRepo);
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
  }, [service, selectedRepo]);

  const requestSummary = useCallback(
    async (path: string) => {
      setSummaries((prev) => {
        if (prev[path]?.summary || prev[path]?.loading) return prev;
        return { ...prev, [path]: { loading: true, summary: null } };
      });
      try {
        const result: CodebaseFileSummaryResponse = await service.summarizeCodebaseFile(
          path,
          undefined,
          selectedRepo
        );
        setSummaries((prev) => ({
          ...prev,
          [path]: {
            loading: false,
            summary: result.summary,
            error: result.error,
            errorKind: result.errorKind
          }
        }));
      } catch {
        setSummaries((prev) => ({
          ...prev,
          [path]: { loading: false, summary: null, error: 'Could not generate a summary.' }
        }));
      }
    },
    [service, selectedRepo]
  );

  const requestSymbols = useCallback(
    async (path: string) => {
      setSymbolsByPath((prev) =>
        prev[path] ? prev : { ...prev, [path]: { loading: true, items: [] } }
      );
      try {
        const res = await service.getCodebaseFileSymbols(path, selectedRepo);
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
    [service, selectedRepo]
  );

  const requestFnSummary = useCallback(
    async (path: string, name: string) => {
      setFnSummaries((prev) => ({
        ...prev,
        [path]: { ...(prev[path] ?? {}), [name]: { loading: true, summary: null } }
      }));
      try {
        const res = await service.summarizeCodebaseFile(path, name, selectedRepo);
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
    [service, selectedRepo]
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

  const toggleFolder = useCallback(
    (id: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          // Expanding: reveal only this folder's immediate contents — keep its child folders
          // collapsed so one click drills down a single level instead of the whole subtree.
          next.delete(id);
          for (const childId of childFolderIds(map?.nodes ?? [], id)) next.add(childId);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [map]
  );

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

  const supportedLanguages = map?.stats.supportedLanguages ?? [
    'TypeScript',
    'JavaScript',
    'Python'
  ];
  const supportedLabel = formatLanguageList(supportedLanguages);
  // Programming languages present in the repo that the map can't graph yet (skip data/markup langs).
  const unmappedLanguages = map
    ? Object.entries(map.stats.languages)
        .filter(
          ([lang]) => MAPPABLE_CANDIDATE_LANGUAGES.has(lang) && !supportedLanguages.includes(lang)
        )
        .sort((a, b) => b[1] - a[1])
    : [];

  // Multiple git repos detected but the user hasn't picked one yet → prompt instead of a blank canvas.
  const needsSelection = repos.length > 1 && selectedRepo === undefined;

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
      {/* Header — centered title + project picker (the picker names the repo, so we don't repeat it) */}
      <div className="flex flex-col items-center gap-3 text-center">
        {/* <h2 className="text-lg font-semibold text-text-primary">Codebase map</h2> */}

        {repos.length > 1 ? (
          <select
            id="repo-picker"
            aria-label="Choose a repository to map"
            value={selectedRepo ?? ''}
            onChange={(event) => {
              if (event.target.value) handleSelectRepo(event.target.value);
            }}
            disabled={loading || scanning}
            className="min-w-[16rem] rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-sm text-text-primary disabled:opacity-60"
          >
            <option value="" disabled>
              Select a project…
            </option>
            {repos.map((repo) => (
              <option key={repo.relativePath} value={repo.relativePath}>
                {repo.name}
                {repo.relativePath !== '.' ? ` — ${repo.relativePath}` : ''}
              </option>
            ))}
          </select>
        ) : map ? (
          // Single repo / plain folder: no dropdown to reveal the name, so show it here.
          <p className="text-sm text-text-tertiary">{map.projectName}</p>
        ) : null}

        {map ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
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

      {error ? <p className="text-center text-sm text-rose-400">{error}</p> : null}

      {needsSelection ? (
        <div className="flex h-[calc(100vh-var(--topbar-height)-180px)] min-h-[460px] flex-col items-center justify-center gap-3 rounded-[var(--radius-panel)] border border-border bg-background px-6 text-center">
          <Network size={30} className="text-text-tertiary" />
          <p className="max-w-md text-sm text-text-secondary">
            Choose a project from the dropdown above to view and explore its Git codebase.
          </p>
          <p className="max-w-md text-xs text-text-tertiary">
            This workspace has {repos.length} repositories — pick one to map its files, imports, and
            functions.
          </p>
        </div>
      ) : (
        <>
          {/* Controls toolbar */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-border bg-surface-1 p-0.5">
              <button
                type="button"
                onClick={() => setView('tree')}
                className={cn(
                  'flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors',
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
                  'flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors',
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

            <Button
              variant="outline"
              size="sm"
              onClick={handleRescan}
              disabled={scanning || loading}
            >
              <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
              {scanning ? 'Scanning…' : 'Re-scan'}
            </Button>
          </div>

          {/* Supported-languages banner — sets expectations, and flags any unmapped languages present. */}
          {map ? (
            <div className="flex items-start gap-2 rounded-sm border border-accent-border/30 bg-accent-muted/30 px-3 py-2">
              <Info size={14} className="mt-0.5 shrink-0 text-accent" />
              <p className="text-xs leading-relaxed text-text-secondary">
                Oplyr currently maps{' '}
                <span className="font-medium text-text-primary">{supportedLabel}</span> repositories
                — we&apos;re expanding to more languages continuously, thanks for your patience.
                {unmappedLanguages.length > 0 ? (
                  <>
                    {' '}
                    <span className="text-text-tertiary">
                      Heads up: this repo also has{' '}
                      {formatLanguageList(
                        unmappedLanguages.map(([lang, count]) => `${lang} (${count})`)
                      )}{' '}
                      — not mapped yet.
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          ) : null}

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
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <Workflow size={28} className="text-text-tertiary" />
                  <p className="max-w-md text-sm text-text-secondary">
                    Nothing to map here yet — no source, config, or document files were found inside
                    this project&rsquo;s boundary.
                  </p>
                  <p className="max-w-md text-xs text-text-tertiary">
                    Oplyr maps every non-binary file as a node; import links are traced for{' '}
                    <span className="font-medium text-text-primary">{supportedLabel}</span>. Re-scan
                    after adding files.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Detail panel — file summary + scrollable functions list (both views). */}
            {selectedNode ? (
              <aside className="flex max-h-[calc(100vh-var(--topbar-height)-180px)] w-80 shrink-0 flex-col gap-3 self-start overflow-y-auto rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className="truncate font-mono text-sm text-text-primary"
                      title={selectedNode.id}
                    >
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
                    className="rounded-sm p-1 text-text-tertiary transition-colors hover:text-text-primary"
                    aria-label="Close details"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{selectedNode.language}</Badge>
                  <Badge variant="secondary">{selectedNode.degree} connections</Badge>
                </div>

                <div className="rounded-sm border border-accent-border/30 bg-background p-3">
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
                  ) : selectedSummary?.errorKind === 'rate_limit' ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-2 rounded-sm border border-amber-500/30 bg-amber-500/10 p-2.5">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                        <div>
                          <p className="text-xs font-semibold text-amber-500">AI limit reached</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                            {selectedSummary.error}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void requestSummary(selectedNode.id)}
                      >
                        <RefreshCw size={13} /> Try again
                      </Button>
                    </div>
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
                          <div key={symbol.name} className="rounded-sm border border-border">
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
                              <p className="px-2 pb-1.5 text-[11px] text-text-tertiary">
                                Summarizing…
                              </p>
                            ) : fn?.summary ? (
                              <p className="px-2 pb-1.5 text-[11px] leading-relaxed text-text-secondary">
                                {fn.summary}
                              </p>
                            ) : fn?.error ? (
                              <p className="px-2 pb-1.5 text-[11px] text-text-tertiary">
                                {fn.error}
                              </p>
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
        </>
      )}
    </div>
  );
}
