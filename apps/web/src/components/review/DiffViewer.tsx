import { useMemo } from 'react';
import hljs from 'highlight.js/lib/common';
import 'highlight.js/styles/atom-one-dark.css';
import { parseFileDiff } from '@/containers/voice-console/lib/diff';
import { cn } from '@/lib/cn';
import type { DiffHunk, DiffRow } from '@/containers/voice-console/lib/types';

// Map common file extensions to highlight.js language ids. We only resolve a
// language when highlight.js actually registers it; otherwise we fall back to
// plain (escaped) text so unknown file types still render correctly.
const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'xml',
  xml: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  toml: 'ini',
  ini: 'ini'
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function resolveLanguage(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;
  const candidate = EXTENSION_LANGUAGE[ext] ?? ext;
  return hljs.getLanguage(candidate) ? candidate : undefined;
}

// Highlight a single line of code, returning safe HTML. Highlighting per line
// keeps the diff layout simple and performant; multi-line constructs lose some
// context, which is an acceptable trade-off for code-review fragments.
function highlightLine(text: string, language: string | undefined): string {
  if (text.length === 0) {
    return '';
  }
  if (!language) {
    return escapeHtml(text);
  }
  try {
    return hljs.highlight(text, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(text);
  }
}

interface DiffViewerProps {
  filePath: string;
  diff: string;
  mode: 'split' | 'unified';
}

export function DiffViewer({ filePath, diff, mode }: DiffViewerProps) {
  const parsed = useMemo(() => parseFileDiff(diff), [diff]);
  const language = useMemo(() => resolveLanguage(filePath), [filePath]);

  if (parsed.hunks.length === 0) {
    return (
      <div className="p-4 text-sm text-text-tertiary">No diff content available for this file.</div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface-1">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-2/50 text-xs text-text-tertiary font-mono">
        {mode === 'split' ? (
          <>
            <span>Before</span>
            <span>After</span>
          </>
        ) : (
          <span>Unified diff</span>
        )}
      </div>
      <div className={cn('text-xs font-mono', mode === 'split' ? 'grid grid-cols-2' : '')}>
        {parsed.hunks.map((hunk, hunkIndex) => (
          <DiffHunkSection
            key={`${filePath}-hunk-${hunkIndex}`}
            filePath={filePath}
            hunk={hunk}
            hunkIndex={hunkIndex}
            previousHunk={hunkIndex > 0 ? parsed.hunks[hunkIndex - 1] : null}
            mode={mode}
            language={language}
          />
        ))}
      </div>
    </div>
  );
}

interface DiffHunkSectionProps {
  filePath: string;
  hunk: DiffHunk;
  hunkIndex: number;
  previousHunk: DiffHunk | null;
  mode: 'split' | 'unified';
  language: string | undefined;
}

function DiffHunkSection({
  filePath,
  hunk,
  hunkIndex,
  previousHunk,
  mode,
  language
}: DiffHunkSectionProps) {
  const gapSize = computeGap(previousHunk, hunk);

  return (
    <div className={mode === 'split' ? 'col-span-2' : ''}>
      {gapSize > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-1 bg-surface-2/30 text-text-tertiary text-xs"
          role="note"
        >
          <span>...</span>
          <span>{gapSize} unchanged lines omitted</span>
        </div>
      )}
      <div className="px-3 py-1 bg-accent-muted/20 text-accent text-xs border-y border-border/30">
        <code>{hunk.header}</code>
      </div>
      {mode === 'split'
        ? hunk.rows.map((row, rowIndex) => (
            <SplitDiffRow
              key={`${filePath}-${hunkIndex}-${rowIndex}`}
              row={row}
              language={language}
            />
          ))
        : hunk.rows.map((row, rowIndex) => (
            <UnifiedDiffRow
              key={`${filePath}-${hunkIndex}-${rowIndex}`}
              row={row}
              language={language}
            />
          ))}
    </div>
  );
}

const kindClasses = {
  context: 'bg-transparent',
  remove: 'bg-danger-muted/40',
  add: 'bg-success-muted/40',
  empty: 'bg-transparent'
} as const;

// Renders a syntax-highlighted code fragment. We keep the surrounding add/remove
// row background (the diff coloring) and only highlight the text content via
// highlight.js' `hljs-*` token classes, so diff semantics and syntax colors coexist.
function CodeCell({ text, language }: { text: string; language: string | undefined }) {
  const html = useMemo(() => highlightLine(text, language), [text, language]);
  if (text.length === 0) {
    return <code className="hljs flex-1 whitespace-pre-wrap break-all pr-2 bg-transparent"> </code>;
  }
  return (
    <code
      className="hljs flex-1 whitespace-pre-wrap break-all pr-2 bg-transparent"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function SplitDiffRow({ row, language }: { row: DiffRow; language: string | undefined }) {
  return (
    <div className="grid grid-cols-2 border-b border-border/20">
      <div className={cn('flex items-start', kindClasses[row.leftKind])}>
        <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none">
          {row.leftLineNumber ?? ''}
        </span>
        <span className="w-4 shrink-0 text-center text-text-tertiary select-none">
          {row.leftKind === 'remove' ? '-' : row.leftKind === 'context' ? ' ' : ''}
        </span>
        <CodeCell text={row.leftText} language={language} />
      </div>
      <div className={cn('flex items-start border-l border-border/20', kindClasses[row.rightKind])}>
        <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none">
          {row.rightLineNumber ?? ''}
        </span>
        <span className="w-4 shrink-0 text-center text-text-tertiary select-none">
          {row.rightKind === 'add' ? '+' : row.rightKind === 'context' ? ' ' : ''}
        </span>
        <CodeCell text={row.rightText} language={language} />
      </div>
    </div>
  );
}

function UnifiedDiffRow({ row, language }: { row: DiffRow; language: string | undefined }) {
  if (row.leftKind === 'context') {
    return (
      <div className="flex items-start border-b border-border/20">
        <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none">
          {row.leftLineNumber ?? ''}
        </span>
        <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none">
          {row.rightLineNumber ?? ''}
        </span>
        <span className="w-4 shrink-0 text-center text-text-tertiary select-none"> </span>
        <CodeCell text={row.leftText} language={language} />
      </div>
    );
  }

  return (
    <>
      {row.leftKind === 'remove' && (
        <div className={cn('flex items-start border-b border-border/20', kindClasses.remove)}>
          <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none">
            {row.leftLineNumber ?? ''}
          </span>
          <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none" />
          <span className="w-4 shrink-0 text-center text-danger select-none">-</span>
          <CodeCell text={row.leftText} language={language} />
        </div>
      )}
      {row.rightKind === 'add' && (
        <div className={cn('flex items-start border-b border-border/20', kindClasses.add)}>
          <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none" />
          <span className="w-10 shrink-0 text-right pr-2 text-text-tertiary select-none">
            {row.rightLineNumber ?? ''}
          </span>
          <span className="w-4 shrink-0 text-center text-success select-none">+</span>
          <CodeCell text={row.rightText} language={language} />
        </div>
      )}
    </>
  );
}

function computeGap(previousHunk: DiffHunk | null, currentHunk: DiffHunk): number {
  if (!previousHunk) return 0;
  const previousEnd = previousHunk.oldStart + previousHunk.oldCount;
  const currentStart = currentHunk.oldStart;
  return Math.max(0, currentStart - previousEnd);
}
