import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import '@xterm/xterm/css/xterm.css';

interface ShellScreenProps {
  cwd: string | null;
  theme: 'dark' | 'light';
}

export function ShellScreen({ cwd, theme }: ShellScreenProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<unknown>(null);
  const fitAddonRef = useRef<unknown>(null);
  const ptyIdRef = useRef<string | null>(null);
  const fitTimerRef = useRef<number | null>(null);
  const initRef = useRef(false);
  // Latest theme, read when the terminal is first created. Live theme changes are applied by
  // the separate effect below, so the setup effect intentionally does not depend on `theme`.
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.desktopShell?.createPtySession) {
      setError('Terminal is only available in the desktop app.');
      return;
    }

    if (initRef.current) return;
    initRef.current = true;

    let disposed = false;
    let unsubData: (() => void) | null = null;
    let unsubExit: (() => void) | null = null;

    async function init() {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');

      if (disposed || !wrapperRef.current) return;

      const fitAddon = new FitAddon();
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
        theme: getTerminalTheme(themeRef.current),
        allowProposedApi: true
      });

      terminal.loadAddon(fitAddon);
      terminal.open(wrapperRef.current);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      await new Promise((r) => setTimeout(r, 100));
      if (disposed) return;
      fitAddon.fit();

      const cols = Math.max(terminal.cols, 80);
      const rows = Math.max(terminal.rows, 20);

      let ptyId: string;
      try {
        ptyId = await window.desktopShell!.createPtySession({
          cwd: cwd ?? undefined,
          cols,
          rows
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        terminal.writeln(`\r\n\x1b[31mFailed to start shell: ${msg}\x1b[0m`);
        terminal.writeln('\r\nThe integrated terminal requires the desktop runtime.');
        setError(msg);
        return;
      }

      if (disposed) {
        void window.desktopShell!.killPty(ptyId);
        terminal.dispose();
        return;
      }

      ptyIdRef.current = ptyId;

      terminal.onData((data: string) => {
        window.desktopShell?.writePty(ptyId, data);
      });

      terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        window.desktopShell?.resizePty(ptyId, cols, rows);
      });

      unsubData = window.desktopShell!.subscribePtyData((payload) => {
        if (payload.id === ptyId) {
          (terminal as unknown as { write: (data: string) => void }).write(payload.data);
        }
      });

      unsubExit = window.desktopShell!.subscribePtyExit((payload) => {
        if (payload.id === ptyId) {
          terminal.writeln(`\r\n[Process exited with code ${payload.exitCode}]`);
          ptyIdRef.current = null;
        }
      });

      setReady(true);
    }

    void init().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to initialize terminal.');
    });

    const screenEl = wrapperRef.current?.closest('[data-shell-screen]');
    const resizeObserver = new ResizeObserver(() => {
      if (fitTimerRef.current !== null) window.clearTimeout(fitTimerRef.current);

      fitTimerRef.current = window.setTimeout(() => {
        fitTimerRef.current = null;
        const fit = fitAddonRef.current as { fit?: () => void } | null;
        if (fit?.fit) {
          try {
            fit.fit();
          } catch {
            /* ignore fit errors */
          }
        }
      }, 150);
    });

    if (screenEl) resizeObserver.observe(screenEl);

    return () => {
      disposed = true;
      initRef.current = false;

      if (fitTimerRef.current !== null) {
        window.clearTimeout(fitTimerRef.current);
        fitTimerRef.current = null;
      }

      resizeObserver.disconnect();
      unsubData?.();
      unsubExit?.();

      if (ptyIdRef.current) {
        void window.desktopShell?.killPty(ptyIdRef.current);
        ptyIdRef.current = null;
      }

      const terminal = terminalRef.current as { dispose?: () => void } | null;
      if (terminal?.dispose) terminal.dispose();

      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [cwd]);

  useEffect(() => {
    const terminal = terminalRef.current as { options?: { theme?: unknown } } | null;
    if (terminal?.options) {
      terminal.options.theme = getTerminalTheme(theme);
    }
  }, [theme]);

  if (error && !terminalRef.current) {
    return (
      <div data-shell-screen className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
            Shell
          </p>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-text-primary">Integrated terminal</h2>
            <Badge variant="destructive">Error</Badge>
          </div>
        </div>
        <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <p className="text-xs text-text-tertiary mt-1">
            Check the desktop console logs for details.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-shell-screen
      className="flex flex-col gap-4 h-[calc(100vh-var(--topbar-height)-48px)]"
    >
      <div className="flex items-center justify-between shrink-0">
        <div>
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
            Shell
          </p>
          <h2 className="text-lg font-semibold text-text-primary">
            {cwd ?? 'No project selected'}
          </h2>
        </div>
        {ready ? (
          <Badge variant="outline" className="text-success border-success/30">
            Connected
          </Badge>
        ) : (
          <Badge variant="secondary">Starting...</Badge>
        )}
      </div>
      <div
        className="flex-1 overflow-hidden rounded-[var(--radius-control)] border border-border p-3"
        style={{ backgroundColor: getTerminalTheme(theme).background }}
      >
        <div className="h-full w-full" ref={wrapperRef} />
      </div>
    </div>
  );
}

function getTerminalTheme(theme: 'dark' | 'light') {
  if (theme === 'light') {
    return {
      background: '#f7fbff',
      foreground: '#1d2a38',
      cursor: '#0b8ac2',
      selectionBackground: '#cfe7f7',
      black: '#dfe8f1',
      red: '#c94961',
      green: '#0a8f62',
      yellow: '#a67712',
      blue: '#0b8ac2',
      magenta: '#9b4de0',
      cyan: '#168f9d',
      white: '#203041',
      brightBlack: '#7a8998',
      brightRed: '#d14b61',
      brightGreen: '#0a8f62',
      brightYellow: '#a67712',
      brightBlue: '#0b8ac2',
      brightMagenta: '#9b4de0',
      brightCyan: '#168f9d',
      brightWhite: '#13202d'
    };
  }

  return {
    background: '#0b0d11',
    foreground: '#e0e6ed',
    cursor: '#00e5ff',
    selectionBackground: '#1e3a5f',
    black: '#0b0d11',
    red: '#ff5c57',
    green: '#5af78e',
    yellow: '#f3f99d',
    blue: '#57c7ff',
    magenta: '#ff6ac1',
    cyan: '#9aedfe',
    white: '#f1f1f0',
    brightBlack: '#686868',
    brightRed: '#ff5c57',
    brightGreen: '#5af78e',
    brightYellow: '#f3f99d',
    brightBlue: '#57c7ff',
    brightMagenta: '#ff6ac1',
    brightCyan: '#9aedfe',
    brightWhite: '#f1f1f0'
  };
}
