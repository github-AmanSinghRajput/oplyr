import { useCallback, useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { ChevronLeft, ChevronRight, FileText, Loader2, Search, FolderTree } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useApi } from '@/providers/ApiProvider';
import { CodeBlock } from '@/components/chat/CodeBlock';
import type { MarkdownFileEntry } from '@/containers/voice-console/lib/types';

interface MarkdownScreenProps {
  projectRoot: string | null;
}

const PAGE_SIZE = 12;

export function MarkdownScreen({ projectRoot }: MarkdownScreenProps) {
  const { service } = useApi();
  const [files, setFiles] = useState<MarkdownFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Load the markdown file list when the workspace changes.
  useEffect(() => {
    // No workspace → nothing to load; the render path already shows the "no workspace" state, so we
    // don't need to clear state here (avoids a synchronous setState in the effect body).
    if (!projectRoot) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional load on workspace change
    setLoading(true);
    setError(null);
    service
      .listMarkdownDocs()
      .then((res) => {
        if (active) setFiles(res.files);
      })
      .catch(() => {
        if (active) setError('Could not load markdown files.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectRoot, service]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.path.toLowerCase().includes(q));
  }, [files, query]);

  // Reset to the first page when the search query changes (handled in the input's onChange).
  const onSearchChange = useCallback((value: string) => {
    setQuery(value);
    setPage(0);
  }, []);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const openFile = useCallback(
    (path: string) => {
      setSelectedPath(path);
      setContent(null);
      setContentError(null);
      setContentLoading(true);
      service
        .getMarkdownDoc(path)
        .then((res) => {
          if (res.content != null) setContent(res.content);
          else setContentError(res.error ?? 'Could not read this file.');
        })
        .catch(() => setContentError('Could not read this file.'))
        .finally(() => setContentLoading(false));
    },
    [service]
  );

  if (!projectRoot) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <FolderTree size={32} className="text-text-tertiary" />
        <h2 className="text-lg font-semibold text-text-primary">No workspace connected</h2>
        <p className="max-w-sm text-sm text-text-tertiary">
          Connect a project on the Workspace screen to browse its markdown documentation here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">
          Documentation
        </p>
        <h2 className="text-lg font-semibold text-text-primary">
          Markdown {files.length ? `· ${files.length} files` : ''}
        </h2>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <div className="flex min-h-0 gap-4">
        {/* File list — search + pagination */}
        <div className="flex h-[calc(100vh-var(--topbar-height)-200px)] min-h-[460px] w-80 shrink-0 flex-col rounded-[var(--radius-panel)] border border-border bg-surface-1">
          <div className="border-b border-border p-2.5">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
              <Search size={14} className="shrink-0 text-text-tertiary" />
              <input
                value={query}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search files…"
                className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-text-tertiary">
                <Loader2 size={15} className="animate-spin" /> Loading…
              </div>
            ) : pageItems.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-text-tertiary">
                {files.length === 0 ? 'No markdown files found.' : 'No files match your search.'}
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {pageItems.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => openFile(file.path)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                      file.path === selectedPath
                        ? 'bg-accent-muted text-accent'
                        : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                    )}
                    title={file.path}
                  >
                    <FileText size={14} className="mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{file.name}</span>
                      <span className="block truncate font-mono text-[10px] text-text-tertiary">
                        {file.path}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-text-tertiary">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors enabled:hover:text-text-primary disabled:opacity-40"
              >
                <ChevronLeft size={13} /> Prev
              </button>
              <span>
                Page {safePage + 1} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors enabled:hover:text-text-primary disabled:opacity-40"
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          ) : null}
        </div>

        {/* Preview */}
        <div className="flex h-[calc(100vh-var(--topbar-height)-200px)] min-h-[460px] flex-1 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-border bg-background">
          {!selectedPath ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <FileText size={28} className="text-text-tertiary" />
              <p className="max-w-xs text-sm text-text-tertiary">
                Select a markdown file to preview it here.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <FileText size={14} className="shrink-0 text-accent" />
                <span
                  className="truncate font-mono text-xs text-text-secondary"
                  title={selectedPath}
                >
                  {selectedPath}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {contentLoading ? (
                  <div className="flex items-center gap-2 text-sm text-text-tertiary">
                    <Loader2 size={15} className="animate-spin" /> Reading…
                  </div>
                ) : contentError ? (
                  <p className="text-sm text-rose-400">{contentError}</p>
                ) : (
                  <div className="text-sm leading-relaxed text-text-primary prose-sm">
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={{ code: CodeBlock }}
                    >
                      {content ?? ''}
                    </Markdown>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
