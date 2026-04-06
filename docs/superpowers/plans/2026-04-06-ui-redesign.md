# VOCOD Desktop App — UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground-up UI redesign of the VOCOD Electron desktop app — install Tailwind v4 + shadcn/ui, break the 4,094-line god component into providers + hooks, redesign all screens with modern layout (Arc-style sidebar, thin topbar), add Framer Motion animations, Rive voice orb, Lucide icons, Geist fonts. Preserve every existing feature.

**Architecture:** React 19 + Vite 7 + Electron 36. Replace the monolithic `VoiceConsoleContainer.tsx` with 7 context providers and 6 custom hooks. Replace `styles.css` (4,081 lines) with Tailwind v4 utilities. Use shadcn/ui (Radix-based) for all interactive primitives. Framer Motion for layout animations. Rive for voice agent orb.

**Tech Stack:** Tailwind CSS v4, shadcn/ui, Framer Motion, @rive-app/react-canvas, Lucide React, Geist fonts (self-hosted), clsx + tailwind-merge.

**Spec:** `docs/superpowers/specs/2026-04-06-ui-redesign-design.md`

---

## File Map

### New files to create

```
apps/web/
  src/
    app.css                              — Tailwind v4 entry (imports, @theme tokens, base layer)
    lib/
      cn.ts                              — clsx + tailwind-merge utility

    providers/
      ThemeProvider.tsx                   — dark/light mode context, localStorage, data-theme attribute
      ApiProvider.tsx                     — API service instance context
      StatusProvider.tsx                  — status/system polling, desktop runtime
      VoiceSessionProvider.tsx            — voice state machine, mic capture, VAD, TTS playback
      NavigationProvider.tsx              — active screen, sidebar open/collapsed
      ToastProvider.tsx                   — toast queue, auto-dismiss
      ApprovalProvider.tsx               — pending approval, approve/reject, history

    hooks/
      use-voice-session.ts               — start/stop/mute extracted from god component
      use-chat-stream.ts                 — SSE stream, delta merging, cancel
      use-desktop-bridge.ts              — Electron IPC for runtime status, PTY
      use-preferences.ts                 — console preferences from localStorage
      use-approval.ts                    — approval actions + history fetch
      use-keyboard-shortcuts.ts          — global key bindings

    components/
      layout/
        AppShell.tsx                      — composes Sidebar + Topbar + ContentFrame + screens
        Sidebar.tsx                       — Arc-style 56px→240px collapsible sidebar
        Topbar.tsx                        — 44px thin topbar
        ContentFrame.tsx                  — centered scrollable content area

      voice/
        AgentOrb.tsx                      — Rive-powered voice visualization (replaces FaceOrb)
        VoiceControls.tsx                 — start/stop/mute pill buttons
        TranscriptCard.tsx                — live transcript display card
        ActivityFeed.tsx                  — "what it's doing" log
        CommandPicker.tsx                 — voice command option modal

      chat/
        MessageList.tsx                   — scrollable message feed
        MessageBubble.tsx                 — single message (user or assistant)
        ChatComposer.tsx                  — input + mic + attachments + send
        CodeBlock.tsx                     — syntax-highlighted code with copy
        AttachmentChip.tsx                — file attachment preview chip

      review/
        DiffViewer.tsx                    — split/unified diff display
        ReviewFileCard.tsx                — single file diff section
        ReviewHeader.tsx                  — approval summary + approve/reject
        FileTreePanel.tsx                 — collapsible file tree navigation
        ApprovalHistoryList.tsx           — past approvals

      screens/
        VoiceScreen.tsx                   — new voice screen layout
        ChatScreen.tsx                    — new chat screen (renamed from Terminal)
        ReviewScreen.tsx                  — new review screen
        WorkspaceScreen.tsx               — project picker + info
        ShellScreen.tsx                   — xterm.js terminal
        SettingsScreen.tsx                — tabbed settings (replaces drawer)
        OnboardingScreen.tsx              — setup wizard
        MemoryScreen.tsx                  — notes viewer

      ui/                                — shadcn/ui components (installed via CLI)
        button.tsx
        badge.tsx
        tooltip.tsx
        dropdown-menu.tsx
        select.tsx
        scroll-area.tsx
        tabs.tsx
        dialog.tsx
        sheet.tsx
        separator.tsx
        skeleton.tsx
        toggle.tsx
        input.tsx
        label.tsx

  assets/
    fonts/
      GeistSans-[weights].woff2         — self-hosted Geist Sans
      GeistMono-[weights].woff2         — self-hosted Geist Mono
    rive/
      agent-orb.riv                      — Rive animation file (placeholder, refined later)
```

### Files to modify

```
apps/web/vite.config.ts                  — add @tailwindcss/vite plugin, path aliases
apps/web/tsconfig.json                   — add path aliases (@/)
apps/web/package.json                    — new dependencies
apps/web/index.html                      — update CSP for self-hosted fonts, remove Google Fonts
apps/web/src/main.tsx                    — import app.css, wrap with providers
apps/web/src/App.tsx                     — render AppShell instead of VoiceConsoleContainer
```

### Files to delete (Phase 4)

```
apps/web/src/styles.css                                        — replaced by Tailwind
apps/web/src/containers/voice-console/VoiceConsoleContainer.tsx — split into providers/hooks/screens
apps/web/src/containers/voice-console/components/FaceOrb.tsx    — replaced by AgentOrb
apps/web/src/containers/voice-console/components/BrandLogo.tsx  — inlined into Sidebar
apps/web/src/containers/voice-console/components/MobileDock.tsx — rebuilt in layout/
```

---

## Phase 1: Foundation

### Task 1: Install Tailwind v4 and configure Vite

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/tsconfig.json`
- Create: `apps/web/src/app.css`

- [ ] **Step 1: Install Tailwind v4 and Vite plugin**

```bash
cd apps/web
npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Add Tailwind Vite plugin and path aliases**

Update `apps/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173
  }
});
```

- [ ] **Step 3: Add path alias to tsconfig**

Update `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "types": ["vite/client"]
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 4: Create Tailwind CSS entry with design tokens**

Create `apps/web/src/app.css`:

```css
@import "tailwindcss";

@theme {
  /* ── Colors ── */
  --color-background: #0e1015;
  --color-background-elevated: #14171d;
  --color-surface-1: #181c23;
  --color-surface-2: #1e222b;
  --color-surface-3: #262b36;

  --color-border: rgba(110, 125, 143, 0.15);
  --color-border-strong: rgba(130, 146, 166, 0.28);

  --color-text-primary: #eaf0fa;
  --color-text-secondary: #8a97ab;
  --color-text-tertiary: #5a6578;

  --color-accent: #00d4f5;
  --color-accent-muted: rgba(0, 212, 245, 0.12);
  --color-accent-border: rgba(0, 212, 245, 0.24);

  --color-success: #6ffbbe;
  --color-success-muted: rgba(111, 251, 190, 0.10);
  --color-warning: #f2d070;
  --color-warning-muted: rgba(242, 208, 112, 0.10);
  --color-danger: #ff8e98;
  --color-danger-muted: rgba(255, 142, 152, 0.10);

  /* ── Layout ── */
  --sidebar-width-collapsed: 56px;
  --sidebar-width-expanded: 240px;
  --topbar-height: 44px;

  /* ── Radius ── */
  --radius-panel: 16px;
  --radius-control: 10px;
  --radius-sm: 8px;
  --radius-pill: 999px;

  /* ── Fonts ── */
  --font-sans: 'Geist Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, 'SFMono-Regular', monospace;
}

/* Light mode overrides */
:root[data-theme='light'] {
  --color-background: #f4f7fb;
  --color-background-elevated: #ffffff;
  --color-surface-1: #ffffff;
  --color-surface-2: #f0f4f9;
  --color-surface-3: #e4ebf3;
  --color-border: rgba(88, 103, 122, 0.18);
  --color-border-strong: rgba(79, 98, 121, 0.32);
  --color-text-primary: #0f1a28;
  --color-text-secondary: #5a6a7e;
  --color-text-tertiary: #8995a6;
  --color-accent: #0891b2;
  --color-accent-muted: rgba(8, 145, 178, 0.10);
  --color-accent-border: rgba(8, 145, 178, 0.20);
  --color-success: #059669;
  --color-success-muted: rgba(5, 150, 105, 0.10);
  --color-warning: #b45309;
  --color-warning-muted: rgba(180, 83, 9, 0.10);
  --color-danger: #dc2626;
  --color-danger-muted: rgba(220, 38, 38, 0.10);
}

/* ── Base layer ── */
@layer base {
  * { box-sizing: border-box; }

  html, body, #root {
    height: 100%;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: var(--font-sans);
    background: var(--color-background);
    color: var(--color-text-primary);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    overflow: hidden;
  }

  code, pre, kbd {
    font-family: var(--font-mono);
  }

  ::selection {
    background: var(--color-accent-muted);
    color: var(--color-accent);
  }
}
```

- [ ] **Step 5: Verify Tailwind compiles**

```bash
cd apps/web && npx vite build 2>&1 | head -20
```

Expected: Build succeeds. (The old `styles.css` still exists alongside `app.css` for now.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/vite.config.ts apps/web/tsconfig.json apps/web/src/app.css
git commit -m "feat(web): install Tailwind v4, add design tokens and path aliases"
```

---

### Task 2: Self-host Geist fonts and update CSP

**Files:**
- Create: `apps/web/src/assets/fonts/` (font files)
- Modify: `apps/web/src/app.css`
- Modify: `apps/web/index.html`

- [ ] **Step 1: Download Geist fonts**

```bash
cd apps/web
mkdir -p src/assets/fonts

# Download Geist Sans (variable weight)
curl -L -o src/assets/fonts/GeistVF.woff2 \
  "https://cdn.jsdelivr.net/npm/geist@1.4.1/dist/fonts/geist-sans/Geist-Regular.woff2"

# Download Geist Mono (variable weight)
curl -L -o src/assets/fonts/GeistMonoVF.woff2 \
  "https://cdn.jsdelivr.net/npm/geist@1.4.1/dist/fonts/geist-mono/GeistMono-Regular.woff2"
```

Note: If the CDN URLs change, install the `geist` npm package (`npm install geist`) and copy fonts from `node_modules/geist/dist/fonts/`.

- [ ] **Step 2: Add @font-face declarations to app.css**

Add at the TOP of `apps/web/src/app.css`, before the `@import "tailwindcss"` line:

```css
@font-face {
  font-family: 'Geist Sans';
  src: url('./assets/fonts/GeistVF.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}

@font-face {
  font-family: 'Geist Mono';
  src: url('./assets/fonts/GeistMonoVF.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}
```

- [ ] **Step 3: Update CSP in index.html**

In `apps/web/index.html`, update the CSP `font-src` directive to remove Google Fonts and allow only self:

Change:
```
font-src 'self' https://fonts.gstatic.com data:;
```
To:
```
font-src 'self' data:;
```

Also remove the `style-src` allowance for Google Fonts:
Change:
```
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
```
To:
```
style-src 'self' 'unsafe-inline';
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/assets/fonts/ apps/web/src/app.css apps/web/index.html
git commit -m "feat(web): self-host Geist Sans and Geist Mono fonts, remove Google Fonts"
```

---

### Task 3: Install UI dependencies

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/cn.ts`

- [ ] **Step 1: Install all UI packages**

```bash
cd apps/web
npm install framer-motion lucide-react clsx tailwind-merge
npm install @rive-app/react-canvas
```

- [ ] **Step 2: Create cn() utility**

Create `apps/web/src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json apps/web/src/lib/cn.ts
git commit -m "feat(web): install framer-motion, lucide-react, rive, clsx, tailwind-merge"
```

---

### Task 4: Initialize shadcn/ui and install base components

**Files:**
- Create: `apps/web/components.json`
- Create: `apps/web/src/components/ui/*.tsx` (14 components)

- [ ] **Step 1: Initialize shadcn**

```bash
cd apps/web
npx shadcn@latest init
```

When prompted:
- Style: **Default**
- Base color: **Neutral**
- CSS variables: **Yes**
- Tailwind CSS config: let it auto-detect
- Components alias: `@/components`
- Utils alias: `@/lib/cn`

If the CLI doesn't detect Tailwind v4 correctly, manually create `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/cn",
    "ui": "@/components/ui",
    "hooks": "@/hooks",
    "lib": "@/lib"
  }
}
```

- [ ] **Step 2: Install shadcn components**

```bash
npx shadcn@latest add button badge tooltip dropdown-menu select scroll-area tabs dialog sheet separator skeleton toggle input label
```

This creates individual files in `src/components/ui/`. Each is a self-contained, customizable component built on Radix UI primitives.

- [ ] **Step 3: Verify build compiles with shadcn components**

```bash
cd apps/web && npx vite build 2>&1 | head -20
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components.json apps/web/src/components/ui/
git commit -m "feat(web): initialize shadcn/ui, install 14 base components"
```

---

### Task 5: Create ThemeProvider

**Files:**
- Create: `apps/web/src/providers/ThemeProvider.tsx`

- [ ] **Step 1: Write ThemeProvider**

Create `apps/web/src/providers/ThemeProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppTheme } from '@/containers/voice-console/lib/types';

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'voice-codex-local.app-theme';

function loadStoredTheme(): AppTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(loadStoredTheme);

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <ThemeContext value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/providers/ThemeProvider.tsx
git commit -m "feat(web): create ThemeProvider with dark/light mode context"
```

---

### Task 6: Create ApiProvider

**Files:**
- Create: `apps/web/src/providers/ApiProvider.tsx`

- [ ] **Step 1: Write ApiProvider**

Create `apps/web/src/providers/ApiProvider.tsx`:

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { OperatorConsoleApiService } from '@/services/api/OperatorConsoleApiService';

interface ApiContextValue {
  service: OperatorConsoleApiService;
  baseUrl: string;
}

const ApiContext = createContext<ApiContextValue | null>(null);

function getApiBaseUrl() {
  return window.desktopShell?.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8787';
}

function getApiAuthToken() {
  return window.desktopShell?.apiAuthToken ?? import.meta.env.VITE_LOCAL_API_AUTH_TOKEN ?? null;
}

export function ApiProvider({ children }: { children: ReactNode }) {
  const baseUrl = getApiBaseUrl();
  const service = useMemo(
    () => new OperatorConsoleApiService(baseUrl, getApiAuthToken()),
    [baseUrl]
  );

  return (
    <ApiContext value={{ service, baseUrl }}>
      {children}
    </ApiContext>
  );
}

export function useApi() {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used within ApiProvider');
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/providers/ApiProvider.tsx
git commit -m "feat(web): create ApiProvider for service instance context"
```

---

### Task 7: Create NavigationProvider

**Files:**
- Create: `apps/web/src/providers/NavigationProvider.tsx`

- [ ] **Step 1: Write NavigationProvider**

Create `apps/web/src/providers/NavigationProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { ScreenId } from '@/containers/voice-console/lib/types';

interface NavigationContextValue {
  activeScreen: ScreenId;
  setActiveScreen: (screen: ScreenId) => void;
  sidebarExpanded: boolean;
  setSidebarExpanded: (expanded: boolean) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('workspace');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const navigate = useCallback((screen: ScreenId) => {
    setActiveScreen(screen);
  }, []);

  return (
    <NavigationContext value={{
      activeScreen,
      setActiveScreen: navigate,
      sidebarExpanded,
      setSidebarExpanded,
    }}>
      {children}
    </NavigationContext>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/providers/NavigationProvider.tsx
git commit -m "feat(web): create NavigationProvider for screen routing and sidebar state"
```

---

### Task 8: Create ToastProvider

**Files:**
- Create: `apps/web/src/providers/ToastProvider.tsx`

- [ ] **Step 1: Write ToastProvider**

Create `apps/web/src/providers/ToastProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface ToastItem {
  id: string;
  tone: 'success' | 'error' | 'info';
  title: string;
  detail: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  pushToast: (tone: ToastItem['tone'], title: string, detail: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((tone: ToastItem['tone'], title: string, detail: string) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    setToasts((prev) => [...prev, { id, tone, title, detail }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timeout = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 3200);
    return () => window.clearTimeout(timeout);
  }, [toasts]);

  return (
    <ToastContext value={{ toasts, pushToast, dismissToast }}>
      {children}
    </ToastContext>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/providers/ToastProvider.tsx
git commit -m "feat(web): create ToastProvider with auto-dismiss queue"
```

---

### Task 9: Create StatusProvider

**Files:**
- Create: `apps/web/src/providers/StatusProvider.tsx`
- Create: `apps/web/src/hooks/use-desktop-bridge.ts`

- [ ] **Step 1: Write use-desktop-bridge hook**

Create `apps/web/src/hooks/use-desktop-bridge.ts`:

```ts
import { useEffect, useState } from 'react';
import type { DesktopRuntimeStatus } from '@/desktop-shell';

export function useDesktopBridge() {
  const isDesktopShell = Boolean(window.desktopShell?.isDesktop);
  const [desktopRuntime, setDesktopRuntime] = useState<DesktopRuntimeStatus | null>(null);

  useEffect(() => {
    if (!window.desktopShell) return;

    let active = true;
    void window.desktopShell.getRuntimeStatus().then((status) => {
      if (active) setDesktopRuntime(status);
    });

    const unsubscribe = window.desktopShell.subscribeRuntimeStatus((status) => {
      setDesktopRuntime(status);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { isDesktopShell, desktopRuntime };
}
```

- [ ] **Step 2: Write StatusProvider**

Create `apps/web/src/providers/StatusProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useApi } from './ApiProvider';
import { useDesktopBridge } from '@/hooks/use-desktop-bridge';
import type { StatusResponse, SystemResponse } from '@/containers/voice-console/lib/types';
import type { DesktopRuntimeStatus } from '@/desktop-shell';

interface StatusContextValue {
  status: StatusResponse | null;
  system: SystemResponse | null;
  desktopRuntime: DesktopRuntimeStatus | null;
  isDesktopShell: boolean;
  assistantReady: boolean;
  refreshStatus: () => Promise<void>;
}

const StatusContext = createContext<StatusContextValue | null>(null);

export function StatusProvider({ children }: { children: ReactNode }) {
  const { service } = useApi();
  const { isDesktopShell, desktopRuntime } = useDesktopBridge();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [system, setSystem] = useState<SystemResponse | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const [nextStatus, nextSystem] = await Promise.all([
        service.getStatus(),
        service.getSystem()
      ]);
      setStatus(nextStatus);
      setSystem(nextSystem);
    } catch (err) {
      console.warn('[status] refresh failed', err);
    }
  }, [service]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const assistantReady = Boolean(status?.assistantProviders.activeProvider?.appConnected);

  return (
    <StatusContext value={{
      status,
      system,
      desktopRuntime,
      isDesktopShell,
      assistantReady,
      refreshStatus,
    }}>
      {children}
    </StatusContext>
  );
}

export function useStatus() {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error('useStatus must be used within StatusProvider');
  return ctx;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-desktop-bridge.ts apps/web/src/providers/StatusProvider.tsx
git commit -m "feat(web): create StatusProvider and use-desktop-bridge hook"
```

---

### Task 10: Create use-preferences hook

**Files:**
- Create: `apps/web/src/hooks/use-preferences.ts`

- [ ] **Step 1: Write use-preferences hook**

Create `apps/web/src/hooks/use-preferences.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { ConsolePreferences } from '@/containers/voice-console/lib/types';

const STORAGE_KEY = 'voice-codex-local.console-preferences';

const defaults: ConsolePreferences = {
  defaultScreen: 'voice',
  transcriptDensity: 'comfortable',
  motionMode: 'full'
};

function load(): ConsolePreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

export function usePreferences() {
  const [preferences, setPreferencesState] = useState<ConsolePreferences>(load);

  const setPreference = useCallback(<K extends keyof ConsolePreferences>(
    key: K,
    value: ConsolePreferences[K]
  ) => {
    setPreferencesState((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  return { preferences, setPreference };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/use-preferences.ts
git commit -m "feat(web): create use-preferences hook for console preferences"
```

---

### Task 11: Build the Sidebar component (Arc-style)

**Files:**
- Create: `apps/web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write Sidebar with hover expand/collapse**

Create `apps/web/src/components/layout/Sidebar.tsx`:

```tsx
import { useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  Mic,
  MessageSquare,
  Terminal,
  GitCompare,
  Settings,
  BrainCircuit
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useNavigation } from '@/providers/NavigationProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import type { ScreenId } from '@/containers/voice-console/lib/types';

interface NavItemDef {
  id: ScreenId;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItemDef[] = [
  { id: 'workspace', label: 'Workspace', icon: Folder },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'terminal', label: 'Chat', icon: MessageSquare },
  { id: 'shell', label: 'Shell', icon: Terminal },
  { id: 'review', label: 'Review', icon: GitCompare },
  { id: 'memory', label: 'Memory', icon: BrainCircuit },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  badges?: Partial<Record<ScreenId, string | number>>;
}

export function Sidebar({ badges }: SidebarProps) {
  const { activeScreen, setActiveScreen, sidebarExpanded, setSidebarExpanded } = useNavigation();
  const collapseTimeout = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (collapseTimeout.current) {
      clearTimeout(collapseTimeout.current);
      collapseTimeout.current = null;
    }
    setSidebarExpanded(true);
  }, [setSidebarExpanded]);

  const handleMouseLeave = useCallback(() => {
    collapseTimeout.current = window.setTimeout(() => {
      setSidebarExpanded(false);
    }, 150);
  }, [setSidebarExpanded]);

  return (
    <TooltipProvider delayDuration={300}>
      <motion.aside
        className={cn(
          'fixed top-0 left-0 h-full z-20',
          'flex flex-col py-3 gap-1',
          'bg-background-elevated/80 backdrop-blur-xl',
          'border-r border-border',
        )}
        animate={{ width: sidebarExpanded ? 240 : 56 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 px-3 h-[var(--topbar-height)] shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <span className="text-accent font-bold text-sm">V</span>
          </div>
          <AnimatePresence>
            {sidebarExpanded && (
              <motion.span
                className="text-sm font-semibold text-text-primary whitespace-nowrap overflow-hidden"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
              >
                VOCOD
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-0.5 px-2 flex-1">
          {navItems.map((item) => {
            const isActive = activeScreen === item.id;
            const Icon = item.icon;
            const badge = badges?.[item.id];

            const button = (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
                className={cn(
                  'flex items-center gap-3 w-full rounded-radius-control h-10 px-2',
                  'transition-colors duration-150',
                  'hover:bg-surface-2',
                  isActive && 'bg-accent-muted text-accent',
                  !isActive && 'text-text-secondary hover:text-text-primary'
                )}
                type="button"
              >
                <Icon size={18} className="shrink-0" />
                <AnimatePresence>
                  {sidebarExpanded && (
                    <motion.span
                      className="text-sm font-medium whitespace-nowrap overflow-hidden flex-1 text-left"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {badge && sidebarExpanded && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {badge}
                  </Badge>
                )}
              </button>
            );

            if (!sidebarExpanded) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    <p>{item.label}</p>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return button;
          })}
        </nav>
      </motion.aside>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/layout/Sidebar.tsx
git commit -m "feat(web): build Arc-style collapsible sidebar with Framer Motion"
```

---

### Task 12: Build the Topbar component

**Files:**
- Create: `apps/web/src/components/layout/Topbar.tsx`

- [ ] **Step 1: Write Topbar**

Create `apps/web/src/components/layout/Topbar.tsx`:

```tsx
import { Sun, Moon, RefreshCw, Settings, Unplug } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/providers/ThemeProvider';
import { useNavigation } from '@/providers/NavigationProvider';
import { useStatus } from '@/providers/StatusProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TopbarProps {
  displayName: string | null;
  onRefresh: () => void;
  onDisconnect: () => void;
  busyLabel?: string;
  error?: string;
}

export function Topbar({ displayName, onRefresh, onDisconnect, busyLabel, error }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { sidebarExpanded, setActiveScreen } = useNavigation();
  const { status, desktopRuntime, assistantReady } = useStatus();

  const workspaceLabel = status?.workspace.projectName ?? 'No project selected';
  const writeMode = status?.workspace.writeAccessEnabled ? 'Approval-gated' : 'Advisory';
  const activeProvider = status?.assistantProviders.activeProvider;
  const authLabel = activeProvider?.name ?? 'Not connected';

  return (
    <TooltipProvider delayDuration={300}>
      <header
        className={cn(
          'fixed top-0 right-0 z-10 h-[var(--topbar-height)]',
          'flex items-center justify-between px-4',
          'bg-background/80 backdrop-blur-xl border-b border-border',
          'transition-[left] duration-300 ease-out',
        )}
        style={{ left: sidebarExpanded ? 240 : 56 }}
      >
        {/* Left: workspace info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {displayName ? `${displayName} — ${workspaceLabel}` : workspaceLabel}
            </p>
          </div>
          {assistantReady && (
            <Badge variant="outline" className="text-xs shrink-0">
              {writeMode}
            </Badge>
          )}
        </div>

        {/* Right: status + actions */}
        <div className="flex items-center gap-2">
          {busyLabel && (
            <Badge variant="secondary" className="text-xs">{busyLabel}</Badge>
          )}
          {error && (
            <Badge variant="destructive" className="text-xs">{error}</Badge>
          )}

          {assistantReady && desktopRuntime && (
            <Badge
              variant={desktopRuntime.apiReachable ? 'outline' : 'destructive'}
              className="text-xs"
            >
              <span className={cn(
                'w-1.5 h-1.5 rounded-full mr-1.5',
                desktopRuntime.apiReachable ? 'bg-success' : 'bg-danger'
              )} />
              {authLabel}
            </Badge>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle theme</TooltipContent>
          </Tooltip>

          {assistantReady && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh}>
                    <RefreshCw size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setActiveScreen('settings')}>
                    <Settings size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-danger hover:text-danger" onClick={onDisconnect}>
                    <Unplug size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Disconnect</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </header>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/layout/Topbar.tsx
git commit -m "feat(web): build 44px thin topbar with status badges and controls"
```

---

### Task 13: Build AppShell and ContentFrame

**Files:**
- Create: `apps/web/src/components/layout/ContentFrame.tsx`
- Create: `apps/web/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Write ContentFrame**

Create `apps/web/src/components/layout/ContentFrame.tsx`:

```tsx
import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useNavigation } from '@/providers/NavigationProvider';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ContentFrameProps {
  children: ReactNode;
  maxWidth?: 'narrow' | 'default' | 'wide' | 'full';
}

const maxWidthClasses = {
  narrow: 'max-w-2xl',
  default: 'max-w-4xl',
  wide: 'max-w-6xl',
  full: 'max-w-full',
} as const;

export function ContentFrame({ children, maxWidth = 'default' }: ContentFrameProps) {
  const { sidebarExpanded } = useNavigation();

  return (
    <ScrollArea
      className={cn(
        'fixed top-[var(--topbar-height)] bottom-0 right-0',
        'transition-[left] duration-300 ease-out',
      )}
      style={{ left: sidebarExpanded ? 240 : 56 }}
    >
      <div className={cn('mx-auto px-6 py-6', maxWidthClasses[maxWidth])}>
        {children}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 2: Write AppShell (bridge — renders old screens temporarily)**

Create `apps/web/src/components/layout/AppShell.tsx`:

```tsx
import { Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ContentFrame } from './ContentFrame';
import { useNavigation } from '@/providers/NavigationProvider';
import { useStatus } from '@/providers/StatusProvider';
import { useToast } from '@/providers/ToastProvider';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy-load screens to keep initial bundle small.
// During Phase 1 these point to OLD screen components wrapped in adapters.
// Phase 2-3 will replace them with new implementations one by one.
// Placeholder: screens will be wired in subsequent tasks.

function ScreenFallback() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-radius-panel" />
    </div>
  );
}

export function AppShell() {
  const { activeScreen } = useNavigation();
  const { status, refreshStatus } = useStatus();
  const { toasts } = useToast();

  const displayName = status?.appSettings.displayName ?? null;

  return (
    <div className="h-full w-full bg-background text-text-primary">
      <Sidebar />
      <Topbar
        displayName={displayName}
        onRefresh={() => void refreshStatus()}
        onDisconnect={() => {/* wired in Phase 2 */}}
      />
      <ContentFrame>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeScreen}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Suspense fallback={<ScreenFallback />}>
              {/* Screens wired progressively in Phase 2-3 tasks */}
              <div className="text-text-secondary text-sm">
                Screen: <span className="text-accent font-mono">{activeScreen}</span>
                <br />
                <span className="text-text-tertiary">
                  (Screen components will be wired here as Phase 2/3 tasks are implemented)
                </span>
              </div>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </ContentFrame>

      {/* Toast viewport */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 80 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={cn(
                'px-4 py-3 rounded-radius-control border text-sm',
                'bg-surface-1 border-border',
                toast.tone === 'error' && 'border-danger/30 bg-danger-muted',
                toast.tone === 'success' && 'border-success/30 bg-success-muted',
              )}
            >
              <p className="font-medium text-text-primary">{toast.title}</p>
              <p className="text-text-secondary text-xs mt-0.5">{toast.detail}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/ContentFrame.tsx apps/web/src/components/layout/AppShell.tsx
git commit -m "feat(web): build AppShell with ContentFrame, animated screen transitions, toast viewport"
```

---

### Task 14: Wire providers and AppShell as new entry point

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Update main.tsx to import the new CSS**

Update `apps/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 2: Update App.tsx to compose providers + AppShell**

Update `apps/web/src/App.tsx`:

```tsx
import { ThemeProvider } from '@/providers/ThemeProvider';
import { ApiProvider } from '@/providers/ApiProvider';
import { StatusProvider } from '@/providers/StatusProvider';
import { NavigationProvider } from '@/providers/NavigationProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { AppShell } from '@/components/layout/AppShell';

export function App() {
  return (
    <ThemeProvider>
      <ApiProvider>
        <StatusProvider>
          <NavigationProvider>
            <ToastProvider>
              <AppShell />
            </ToastProvider>
          </NavigationProvider>
        </StatusProvider>
      </ApiProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: Verify dev server starts and shows the new shell**

```bash
cd apps/web && npx vite --host 2>&1 &
# Open http://localhost:5173 in browser
# Expected: dark background, collapsible sidebar on left, thin topbar, screen placeholder text
```

- [ ] **Step 4: Verify build succeeds**

```bash
cd apps/web && npx vite build 2>&1 | tail -10
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.tsx apps/web/src/App.tsx
git commit -m "feat(web): wire providers and AppShell as new app entry point"
```

---

## Phase 2: Core Screens

### Task 15: Build chat components (MessageBubble, CodeBlock, MessageList)

**Files:**
- Create: `apps/web/src/components/chat/CodeBlock.tsx`
- Create: `apps/web/src/components/chat/MessageBubble.tsx`
- Create: `apps/web/src/components/chat/MessageList.tsx`

- [ ] **Step 1: Write CodeBlock**

Create `apps/web/src/components/chat/CodeBlock.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
}

export function CodeBlock({ children, className, ...props }: CodeBlockProps & React.HTMLAttributes<HTMLElement>) {
  const isInline = !className;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = String(children).replace(/\n$/, '');
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [children]);

  if (isInline) {
    return (
      <code className="px-1.5 py-0.5 rounded-radius-sm bg-surface-2 text-accent text-[0.85em] font-mono" {...props}>
        {children}
      </code>
    );
  }

  const lang = (className ?? '').replace('language-', '');

  return (
    <div className="relative group rounded-radius-control overflow-hidden border border-border bg-surface-1 my-3">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-2/50">
        <span className="text-xs text-text-tertiary font-mono">{lang || 'code'}</span>
        <button
          className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
          onClick={handleCopy}
          type="button"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3">
        <code className={cn('text-sm leading-relaxed', className)} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}
```

- [ ] **Step 2: Write MessageBubble**

Create `apps/web/src/components/chat/MessageBubble.tsx`:

```tsx
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/cn';
import { CodeBlock } from './CodeBlock';
import type { MessageEntry, ChatAttachment } from '@/containers/voice-console/lib/types';
import { formatClock } from '@/containers/voice-console/lib/helpers';

interface MessageBubbleProps {
  message: MessageEntry;
  isStreaming?: boolean;
  typedText?: string;
  apiBaseUrl?: string;
}

export function MessageBubble({ message, isStreaming, typedText, apiBaseUrl }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const displayText = typedText ?? message.text;

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <div className={cn(
        'max-w-[85%] rounded-2xl px-4 py-3',
        isUser
          ? 'bg-accent-muted border border-accent-border text-text-primary'
          : 'bg-surface-1 border border-border text-text-primary',
      )}>
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{displayText}</p>
        ) : (
          <div className="text-sm leading-relaxed prose-sm">
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{ code: CodeBlock }}
            >
              {displayText}
            </Markdown>
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-accent rounded-full animate-pulse ml-0.5" />
            )}
          </div>
        )}

        {message.attachments?.length ? (
          <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
            {message.attachments.map((att) => (
              <span key={att.id} className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-text-secondary">
                {att.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <span className="text-[10px] text-text-tertiary px-1">
        {message.source === 'voice' ? '🎙 ' : ''}{formatClock(message.createdAt)}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Write MessageList**

Create `apps/web/src/components/chat/MessageList.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './MessageBubble';
import type { MessageEntry } from '@/containers/voice-console/lib/types';

interface MessageListProps {
  messages: MessageEntry[];
  streamingMessageId?: string | null;
  typedMessages?: Record<string, string>;
  apiBaseUrl?: string;
}

export function MessageList({ messages, streamingMessageId, typedMessages, apiBaseUrl }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  useEffect(() => {
    if (!showScrollButton) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, showScrollButton]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollButton(distanceFromBottom > 100);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      <div className="flex flex-col gap-4">
        {messages.map((msg, i) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i === messages.length - 1 ? 0.05 : 0 }}
          >
            <MessageBubble
              message={msg}
              isStreaming={msg.id === streamingMessageId}
              typedText={typedMessages?.[msg.id]}
              apiBaseUrl={apiBaseUrl}
            />
          </motion.div>
        ))}
      </div>
      <div ref={bottomRef} />

      <AnimatePresence>
        {showScrollButton && (
          <motion.div
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-10"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <Button
              size="sm"
              variant="secondary"
              className="rounded-full shadow-lg"
              onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              <ArrowDown size={14} className="mr-1" /> New messages
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/
git commit -m "feat(web): build chat components — CodeBlock, MessageBubble, MessageList"
```

---

### Task 16: Build ChatComposer and ChatScreen

**Files:**
- Create: `apps/web/src/components/chat/ChatComposer.tsx`
- Create: `apps/web/src/components/chat/AttachmentChip.tsx`
- Create: `apps/web/src/components/screens/ChatScreen.tsx`

- [ ] **Step 1: Write AttachmentChip**

Create `apps/web/src/components/chat/AttachmentChip.tsx`:

```tsx
import { X, File } from 'lucide-react';
import type { ChatAttachment } from '@/containers/voice-console/lib/types';

interface AttachmentChipProps {
  attachment: ChatAttachment;
  onRemove: (id: string) => void;
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border text-xs text-text-secondary">
      <File size={12} />
      <span className="truncate max-w-[120px]">{attachment.name}</span>
      <button
        className="hover:text-danger transition-colors"
        onClick={() => onRemove(attachment.id)}
        type="button"
      >
        <X size={12} />
      </button>
    </span>
  );
}
```

- [ ] **Step 2: Write ChatComposer**

Create `apps/web/src/components/chat/ChatComposer.tsx`:

```tsx
import { type FormEvent, type KeyboardEvent, useRef } from 'react';
import { Mic, Paperclip, Send, StopCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AttachmentChip } from './AttachmentChip';
import type { ChatAttachment } from '@/containers/voice-console/lib/types';

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onStartVoice: () => void;
  onCancelStreaming: () => void;
  draftAttachments: ChatAttachment[];
  disabled?: boolean;
  isStreaming?: boolean;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onAttachFiles,
  onRemoveAttachment,
  onStartVoice,
  onCancelStreaming,
  draftAttachments,
  disabled,
  isStreaming,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      onAttachFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <form
        className="border-t border-border bg-background/60 backdrop-blur-sm px-4 py-3"
        onSubmit={onSubmit}
      >
        {draftAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {draftAttachments.map((att) => (
              <AttachmentChip key={att.id} attachment={att} onRemove={onRemoveAttachment} />
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              className={cn(
                'w-full resize-none rounded-radius-control bg-surface-1 border border-border',
                'px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary',
                'focus:outline-none focus:border-accent-border focus:ring-1 focus:ring-accent-border',
                'min-h-[40px] max-h-[160px]',
              )}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              value={value}
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Paperclip size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach file</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={onStartVoice}
                type="button"
              >
                <Mic size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Switch to voice</TooltipContent>
          </Tooltip>

          {isStreaming ? (
            <Button
              variant="destructive"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={onCancelStreaming}
              type="button"
            >
              <StopCircle size={16} />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 shrink-0 bg-accent hover:bg-accent/90 text-background"
              disabled={disabled || (!value.trim() && draftAttachments.length === 0)}
            >
              <Send size={16} />
            </Button>
          )}
        </div>
      </form>
    </TooltipProvider>
  );
}
```

- [ ] **Step 3: Write ChatScreen**

Create `apps/web/src/components/screens/ChatScreen.tsx`:

```tsx
import { type FormEvent } from 'react';
import { MessageList } from '@/components/chat/MessageList';
import { ChatComposer } from '@/components/chat/ChatComposer';
import type { ChatAttachment, MessageEntry } from '@/containers/voice-console/lib/types';

interface ChatScreenProps {
  apiBaseUrl: string;
  messages: MessageEntry[];
  textInput: string;
  draftAttachments: ChatAttachment[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  typedMessages: Record<string, string>;
  disabled: boolean;
  onTextInputChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onStartVoice: () => void;
  onCancelStreaming: () => void;
}

export function ChatScreen({
  apiBaseUrl,
  messages,
  textInput,
  draftAttachments,
  isStreaming,
  streamingMessageId,
  typedMessages,
  disabled,
  onTextInputChange,
  onSubmit,
  onAttachFiles,
  onRemoveAttachment,
  onStartVoice,
  onCancelStreaming,
}: ChatScreenProps) {
  return (
    <div className="flex flex-col h-[calc(100vh-var(--topbar-height))]">
      <MessageList
        messages={messages}
        streamingMessageId={streamingMessageId}
        typedMessages={typedMessages}
        apiBaseUrl={apiBaseUrl}
      />
      <ChatComposer
        value={textInput}
        onChange={onTextInputChange}
        onSubmit={onSubmit}
        onAttachFiles={onAttachFiles}
        onRemoveAttachment={onRemoveAttachment}
        onStartVoice={onStartVoice}
        onCancelStreaming={onCancelStreaming}
        draftAttachments={draftAttachments}
        disabled={disabled}
        isStreaming={isStreaming}
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/ apps/web/src/components/screens/ChatScreen.tsx
git commit -m "feat(web): build ChatComposer, AttachmentChip, and ChatScreen"
```

---

### Task 17: Build voice components (AgentOrb, VoiceControls, TranscriptCard, ActivityFeed)

**Files:**
- Create: `apps/web/src/components/voice/AgentOrb.tsx`
- Create: `apps/web/src/components/voice/VoiceControls.tsx`
- Create: `apps/web/src/components/voice/TranscriptCard.tsx`
- Create: `apps/web/src/components/voice/ActivityFeed.tsx`
- Create: `apps/web/src/components/voice/CommandPicker.tsx`

- [ ] **Step 1: Write AgentOrb with CSS fallback (Rive placeholder)**

Create `apps/web/src/components/voice/AgentOrb.tsx`:

```tsx
import { cn } from '@/lib/cn';
import type { VoiceState } from '@/containers/voice-console/lib/types';

interface AgentOrbProps {
  voiceState: VoiceState;
  size?: number;
}

const stateColors: Record<VoiceState, string> = {
  idle: 'from-accent/20 to-accent/5',
  listening: 'from-accent/40 to-success/20',
  thinking: 'from-warning/30 to-accent/20',
  speaking: 'from-success/40 to-accent/20',
  error: 'from-danger/40 to-danger/10',
};

const stateGlow: Record<VoiceState, string> = {
  idle: 'shadow-[0_0_60px_rgba(0,212,245,0.08)]',
  listening: 'shadow-[0_0_80px_rgba(0,212,245,0.2)]',
  thinking: 'shadow-[0_0_80px_rgba(242,208,112,0.15)]',
  speaking: 'shadow-[0_0_100px_rgba(111,251,190,0.2)]',
  error: 'shadow-[0_0_60px_rgba(255,142,152,0.15)]',
};

export function AgentOrb({ voiceState, size = 200 }: AgentOrbProps) {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Outer glow ring */}
      <div
        className={cn(
          'absolute inset-0 rounded-full bg-gradient-radial',
          stateColors[voiceState],
          stateGlow[voiceState],
          'transition-all duration-700 ease-out',
          voiceState === 'listening' && 'animate-pulse',
          voiceState === 'thinking' && 'animate-spin-slow',
        )}
      />

      {/* Inner orb */}
      <div
        className={cn(
          'relative rounded-full bg-gradient-to-br border border-white/5',
          stateColors[voiceState],
          'backdrop-blur-xl',
          'transition-all duration-500 ease-out',
        )}
        style={{ width: size * 0.6, height: size * 0.6 }}
      >
        {/* Animated wave bars inside orb */}
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          {[0, 0.12, 0.24, 0.36, 0.48].map((delay, i) => (
            <span
              key={i}
              className={cn(
                'w-0.5 rounded-full bg-accent/60 transition-all duration-300',
                voiceState === 'idle' && 'h-1',
                voiceState === 'listening' && 'animate-voice-bar',
                voiceState === 'thinking' && 'h-2 animate-pulse',
                voiceState === 'speaking' && 'animate-voice-bar',
                voiceState === 'error' && 'h-1 bg-danger/60',
              )}
              style={{
                animationDelay: `${delay}s`,
                height: voiceState === 'idle' ? 4 : undefined,
              }}
            />
          ))}
        </div>
      </div>

      {/* State label */}
      <span className={cn(
        'absolute -bottom-8 text-xs font-medium tracking-wide uppercase',
        voiceState === 'error' ? 'text-danger' : 'text-text-secondary',
      )}>
        {voiceState}
      </span>
    </div>
  );
}
```

Note: Add these keyframes to `app.css` in the `@layer base` block:

```css
@keyframes voice-bar {
  0%, 100% { height: 4px; }
  50% { height: 24px; }
}

@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

And add to the Tailwind `@theme`:
```css
--animate-voice-bar: voice-bar 1.2s ease-in-out infinite;
--animate-spin-slow: spin-slow 8s linear infinite;
```

- [ ] **Step 2: Write VoiceControls**

Create `apps/web/src/components/voice/VoiceControls.tsx`:

```tsx
import { Mic, MicOff, Square, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { VoiceNarrationMode, VoiceState } from '@/containers/voice-console/lib/types';

interface VoiceControlsProps {
  voiceState: VoiceState;
  voiceActive: boolean;
  audioAvailable: boolean;
  narrationMode: VoiceNarrationMode;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}

export function VoiceControls({
  voiceState,
  voiceActive,
  audioAvailable,
  narrationMode,
  onStart,
  onStop,
  onToggleMute,
}: VoiceControlsProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center justify-center gap-3">
        {/* Start / Retry */}
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                className={cn(
                  'rounded-full h-12 px-6',
                  'bg-accent hover:bg-accent/90 text-background font-medium',
                )}
                disabled={voiceActive || !audioAvailable}
                onClick={onStart}
              >
                {voiceState === 'error' ? <RotateCcw size={18} className="mr-2" /> : <Mic size={18} className="mr-2" />}
                {voiceState === 'error' ? 'Retry' : 'Start voice'}
              </Button>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent>Start voice session</TooltipContent>
        </Tooltip>

        {/* Stop */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full h-10 w-10"
              disabled={!voiceActive}
              onClick={onStop}
            >
              <Square size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>End session</TooltipContent>
        </Tooltip>

        {/* Mute toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                'rounded-full h-10 w-10',
                narrationMode === 'muted' && 'border-danger/30 text-danger',
              )}
              onClick={onToggleMute}
            >
              {narrationMode === 'muted' ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{narrationMode === 'muted' ? 'Unmute' : 'Mute'}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 3: Write TranscriptCard**

Create `apps/web/src/components/voice/TranscriptCard.tsx`:

```tsx
import { cn } from '@/lib/cn';

interface TranscriptCardProps {
  label: string;
  text: string;
  variant?: 'primary' | 'muted';
  badge?: string;
  badgeActive?: boolean;
}

export function TranscriptCard({ label, text, variant = 'muted', badge, badgeActive }: TranscriptCardProps) {
  return (
    <div className={cn(
      'rounded-radius-panel border p-4',
      variant === 'primary'
        ? 'bg-surface-1 border-accent-border/30'
        : 'bg-surface-1/50 border-border',
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">{label}</span>
        {badge && (
          <span className={cn(
            'text-[10px] font-medium px-2 py-0.5 rounded-full',
            badgeActive ? 'bg-success-muted text-success' : 'bg-surface-2 text-text-tertiary',
          )}>
            {badge}
          </span>
        )}
      </div>
      <p className={cn(
        'text-sm leading-relaxed line-clamp-4',
        variant === 'primary' ? 'text-text-primary' : 'text-text-secondary',
      )}>
        {text}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Write ActivityFeed**

Create `apps/web/src/components/voice/ActivityFeed.tsx`:

```tsx
import { motion, AnimatePresence } from 'framer-motion';

interface ActivityFeedProps {
  currentActivity: string | null;
  recentActivities: string[];
}

export function ActivityFeed({ currentActivity, recentActivities }: ActivityFeedProps) {
  if (!currentActivity && recentActivities.length === 0) {
    return (
      <div className="rounded-radius-panel border border-border bg-surface-1/50 p-4">
        <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Session flow</span>
        <p className="text-sm text-text-secondary mt-2">
          Listen, think, speak. You can interrupt while the assistant is talking.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-radius-panel border border-border bg-surface-1/50 p-4">
      <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">What it's doing</span>
      <AnimatePresence mode="popLayout">
        {currentActivity && (
          <motion.p
            key={currentActivity}
            className="text-sm text-accent font-medium mt-2"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            {currentActivity}
          </motion.p>
        )}
      </AnimatePresence>
      {recentActivities.length > 1 && (
        <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-border/50">
          {recentActivities.slice(1, 4).map((activity, i) => (
            <span key={`${activity}-${i}`} className="text-xs text-text-tertiary">
              {activity}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write CommandPicker**

Create `apps/web/src/components/voice/CommandPicker.tsx`:

```tsx
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VoiceCommandOption } from '@/containers/voice-console/lib/types';

interface CommandPickerProps {
  title: string | null;
  prompt: string | null;
  options: VoiceCommandOption[];
  onApply: (option: VoiceCommandOption) => void;
  onDismiss: () => void;
}

export function CommandPicker({ title, prompt, options, onApply, onDismiss }: CommandPickerProps) {
  if (options.length === 0) return null;

  return (
    <motion.div
      className="rounded-radius-panel border border-accent-border/30 bg-surface-1 p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-xs text-text-tertiary uppercase tracking-wider">Voice command</span>
          <h3 className="text-sm font-semibold text-text-primary mt-1">{title ?? 'Choose an option'}</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDismiss}>
          <X size={14} />
        </Button>
      </div>
      {prompt && <p className="text-sm text-text-secondary mb-4">{prompt}</p>}
      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            className="flex flex-col items-start gap-0.5 p-3 rounded-radius-control border border-border hover:border-accent-border hover:bg-accent-muted/50 transition-colors text-left"
            onClick={() => onApply(opt)}
            type="button"
          >
            <span className="text-sm font-medium text-text-primary">{opt.label}</span>
            <span className="text-xs text-text-secondary">{opt.description}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/voice/
git commit -m "feat(web): build voice components — AgentOrb, VoiceControls, TranscriptCard, ActivityFeed, CommandPicker"
```

---

### Task 18: Build VoiceScreen

**Files:**
- Create: `apps/web/src/components/screens/VoiceScreen.tsx`

- [ ] **Step 1: Write VoiceScreen with centered orb layout**

Create `apps/web/src/components/screens/VoiceScreen.tsx`:

```tsx
import { AgentOrb } from '@/components/voice/AgentOrb';
import { VoiceControls } from '@/components/voice/VoiceControls';
import { TranscriptCard } from '@/components/voice/TranscriptCard';
import { ActivityFeed } from '@/components/voice/ActivityFeed';
import { CommandPicker } from '@/components/voice/CommandPicker';
import type {
  AudioState,
  VoiceCommandOption,
  VoiceNarrationMode,
  VoiceSessionState,
  VoiceState
} from '@/containers/voice-console/lib/types';
import { getVoiceHeadline, getVoiceSubline } from '@/containers/voice-console/lib/helpers';

interface VoiceScreenProps {
  audio: AudioState | null;
  busyLabel: string;
  spokenReplyPreview?: string;
  streamedTranscriptOverride?: string;
  voiceSession: VoiceSessionState | null;
  voiceState: VoiceState;
  voiceActivity: string | null;
  recentVoiceActivities: string[];
  narrationMode: VoiceNarrationMode;
  pendingCommandTitle: string | null;
  pendingCommandPrompt: string | null;
  pendingCommandOptions: VoiceCommandOption[];
  onApplyCommandOption: (option: VoiceCommandOption) => void;
  onDismissCommandOptions: () => void;
  onToggleMute: () => void;
  onStart: () => void;
  onStop: () => void;
}

const fallbackAudio: AudioState = {
  platform: 'browser',
  available: false,
  inputDeviceLabel: null,
  outputDeviceLabel: null,
  transcriptionEngine: 'Unavailable',
  speechEngine: 'Unavailable',
  lastCheckedAt: null,
  error: null
};

export function VoiceScreen({
  audio,
  busyLabel,
  spokenReplyPreview,
  streamedTranscriptOverride,
  voiceSession,
  voiceState,
  voiceActivity,
  recentVoiceActivities,
  narrationMode,
  pendingCommandTitle,
  pendingCommandPrompt,
  pendingCommandOptions,
  onApplyCommandOption,
  onDismissCommandOptions,
  onToggleMute,
  onStart,
  onStop,
}: VoiceScreenProps) {
  const currentTranscriptLabel =
    voiceSession?.phase === 'thinking' || voiceSession?.phase === 'speaking'
      ? 'AI response'
      : 'Your voice';
  const currentTranscript =
    (voiceSession?.phase === 'speaking' && spokenReplyPreview
      ? spokenReplyPreview
      : streamedTranscriptOverride || voiceSession?.liveTranscript) || 'Waiting for live speech...';
  const lastTranscript = voiceSession?.lastTranscript || 'No completed voice turn yet.';

  return (
    <div className="flex flex-col items-center gap-8 py-8 max-w-3xl mx-auto">
      {/* Headline */}
      <div className="text-center">
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
          Voice session
        </p>
        <h2 className="text-2xl font-semibold text-text-primary">
          {getVoiceHeadline(voiceState)}
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          {getVoiceSubline(audio ?? fallbackAudio, voiceState, streamedTranscriptOverride ?? voiceSession?.liveTranscript ?? '', voiceSession?.error)}
        </p>
      </div>

      {/* Agent Orb — center stage */}
      <AgentOrb voiceState={voiceState} size={200} />

      {/* Controls */}
      <VoiceControls
        voiceState={voiceState}
        voiceActive={Boolean(voiceSession?.active)}
        audioAvailable={audio?.available ?? false}
        narrationMode={narrationMode}
        onStart={onStart}
        onStop={onStop}
        onToggleMute={onToggleMute}
      />

      {/* Live transcript (full width) */}
      <div className="w-full">
        <TranscriptCard
          label={currentTranscriptLabel}
          text={currentTranscript}
          variant="primary"
          badge={voiceSession?.active ? 'Live' : 'Standby'}
          badgeActive={voiceSession?.active ?? false}
        />
      </div>

      {/* Activity + Last message (2 columns) */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActivityFeed
          currentActivity={voiceActivity}
          recentActivities={recentVoiceActivities}
        />
        <TranscriptCard label="Last message" text={lastTranscript} />
      </div>

      {/* Voice error */}
      {voiceSession?.error && (
        <div className="w-full rounded-radius-panel border border-danger/30 bg-danger-muted p-4">
          <span className="text-xs font-medium text-danger uppercase tracking-wider">Voice issue</span>
          <p className="text-sm text-text-primary font-medium mt-1">{voiceSession.error}</p>
        </div>
      )}

      {/* Command picker */}
      <div className="w-full">
        <CommandPicker
          title={pendingCommandTitle}
          prompt={pendingCommandPrompt}
          options={pendingCommandOptions}
          onApply={onApplyCommandOption}
          onDismiss={onDismissCommandOptions}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/screens/VoiceScreen.tsx
git commit -m "feat(web): build VoiceScreen with centered AgentOrb layout"
```

---

### Task 19: Build ReviewScreen with new components

**Files:**
- Create: `apps/web/src/components/review/DiffViewer.tsx`
- Create: `apps/web/src/components/review/ReviewHeader.tsx`
- Create: `apps/web/src/components/review/FileTreePanel.tsx`
- Create: `apps/web/src/components/review/ReviewFileCard.tsx`
- Create: `apps/web/src/components/review/ApprovalHistoryList.tsx`
- Create: `apps/web/src/components/screens/ReviewScreen.tsx`

This task reuses the existing diff parsing logic from `lib/diff.ts` unchanged. The components receive parsed data as props.

- [ ] **Step 1: Write all review sub-components**

Port the existing review logic from the old `ReviewScreen.tsx`, `ReviewFileCard.tsx`, `ReviewHeader.tsx`, `FileTree.tsx`, `DiffView.tsx`, and `ApprovalHistory.tsx` into the new component files listed above, replacing all CSS class names with Tailwind utilities. Keep all existing functionality:
- Split/unified diff toggle
- File tree with viewed/unviewed tracking
- Per-file collapse/expand
- Approve/reject buttons
- File stats (additions/deletions)
- Active file tracking via IntersectionObserver
- Approval history log

The existing TypeScript logic, interfaces, and diff parsing remain the same — only the JSX and class names change from vanilla CSS to Tailwind.

- [ ] **Step 2: Wire ReviewScreen to use new sub-components**

The new `ReviewScreen` composes: `ReviewHeader` + `FileTreePanel` (left column) + `ReviewFileCard` list (right column) in a responsive grid.

- [ ] **Step 3: Verify diff rendering with test data**

Run the dev server, navigate to the Review screen, and verify diffs render correctly with proper color coding.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/review/ apps/web/src/components/screens/ReviewScreen.tsx
git commit -m "feat(web): build ReviewScreen with DiffViewer, FileTree, and approval controls"
```

---

## Phase 3: Supporting Screens

### Task 20: Build WorkspaceScreen, ShellScreen, SettingsScreen, OnboardingScreen, MemoryScreen

**Files:**
- Create: `apps/web/src/components/screens/WorkspaceScreen.tsx`
- Create: `apps/web/src/components/screens/ShellScreen.tsx`
- Create: `apps/web/src/components/screens/SettingsScreen.tsx`
- Create: `apps/web/src/components/screens/OnboardingScreen.tsx`
- Create: `apps/web/src/components/screens/MemoryScreen.tsx`

- [ ] **Step 1: Build WorkspaceScreen**

Port from old `WorkspaceScreen.tsx`. Replace CSS classes with Tailwind. Use shadcn `Button`, `Badge`, `Input`. Keep all features: project picker, git status, write access toggle, secret policy display, file explanation viewer.

- [ ] **Step 2: Build ShellScreen**

Port from old `ShellScreen.tsx`. Keep xterm.js integration. Map terminal theme colors to new design tokens. Use clean container with rounded border.

- [ ] **Step 3: Build SettingsScreen (tab layout replaces drawer)**

Port from old `SettingsDrawer.tsx`. Convert to full-page layout using shadcn `Tabs`: General, Voice, Assistant, Display tabs. Use shadcn `Input`, `Select`, `Toggle`, `Label`, `Separator` for all form fields. Keep all settings: display name, theme, default screen, density, motion mode, voice settings (silence window, locale, transcription model/language, TTS voice, narration mode, quality, noise mode), codex settings (model, reasoning effort), claude settings (model, voice model mode), provider switching.

- [ ] **Step 4: Build OnboardingScreen**

Port from old `OnboardingScreen.tsx`. Add Framer Motion `AnimatePresence` step transitions. Use shadcn `Input` for name field, shadcn `Button` for navigation. Provider selection cards with `whileHover={{ y: -2 }}` lift effect.

- [ ] **Step 5: Build MemoryScreen**

Port from old `MemoryScreen.tsx`. Note cards in grid layout with shadcn `Dialog` for create/edit. Keep all features: note list, create, source badge, timestamps.

- [ ] **Step 6: Commit each screen individually**

```bash
git add apps/web/src/components/screens/WorkspaceScreen.tsx && git commit -m "feat(web): redesign WorkspaceScreen with Tailwind + shadcn"
git add apps/web/src/components/screens/ShellScreen.tsx && git commit -m "feat(web): redesign ShellScreen with themed xterm.js"
git add apps/web/src/components/screens/SettingsScreen.tsx && git commit -m "feat(web): redesign SettingsScreen as tabbed full-page layout"
git add apps/web/src/components/screens/OnboardingScreen.tsx && git commit -m "feat(web): redesign OnboardingScreen with animated step transitions"
git add apps/web/src/components/screens/MemoryScreen.tsx && git commit -m "feat(web): redesign MemoryScreen with grid layout"
```

---

### Task 21: Wire all screens into AppShell

**Files:**
- Modify: `apps/web/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Import and render all new screens in AppShell**

Update the `AppShell.tsx` to lazy-import all new screen components and render the active one based on `activeScreen` from NavigationProvider. Wire all props from the appropriate providers/hooks.

This is the key integration task — each screen receives its props from the corresponding provider context (useStatus, useApi, useToast, etc.) and the state/callbacks that were previously in VoiceConsoleContainer.

- [ ] **Step 2: Verify all screens render and navigate correctly**

Start dev server, click through every sidebar item, verify each screen loads and shows correct content.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/AppShell.tsx
git commit -m "feat(web): wire all redesigned screens into AppShell"
```

---

## Phase 4: Polish

### Task 22: Extract remaining god component logic into providers/hooks

**Files:**
- Create: `apps/web/src/hooks/use-chat-stream.ts`
- Create: `apps/web/src/hooks/use-voice-session.ts`
- Create: `apps/web/src/providers/ApprovalProvider.tsx`
- Create: `apps/web/src/hooks/use-approval.ts`

- [ ] **Step 1: Extract use-chat-stream from VoiceConsoleContainer**

Move the SSE chat streaming logic (lines ~800-1100 of VoiceConsoleContainer) into `use-chat-stream.ts`. This includes: EventSource setup, delta message merging, activity tracking, cancel streaming, typed message text animation.

- [ ] **Step 2: Extract use-voice-session from VoiceConsoleContainer**

Move the entire voice session lifecycle (lines ~600-2000+ of VoiceConsoleContainer) into `use-voice-session.ts`. This is the largest extraction and includes: browser speech recognition, desktop media capture, VAD/endpointing, silence timer, TTS playback, narration, barge-in detection, UI cues.

- [ ] **Step 3: Create ApprovalProvider + use-approval**

Move approval state and actions into a provider: pending approval from status, approve/reject API calls, approval history fetch.

- [ ] **Step 4: Verify the old VoiceConsoleContainer can be fully replaced**

Run all features end-to-end: voice session, text chat, review approval, workspace selection, settings changes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/ apps/web/src/providers/ApprovalProvider.tsx
git commit -m "feat(web): extract chat stream, voice session, and approval logic into hooks/providers"
```

---

### Task 23: Add keyboard shortcuts

**Files:**
- Create: `apps/web/src/hooks/use-keyboard-shortcuts.ts`

- [ ] **Step 1: Write use-keyboard-shortcuts**

Create `apps/web/src/hooks/use-keyboard-shortcuts.ts`:

```ts
import { useEffect } from 'react';
import type { ScreenId } from '@/containers/voice-console/lib/types';

const screenShortcuts: Record<string, ScreenId> = {
  '1': 'workspace',
  '2': 'voice',
  '3': 'terminal',
  '4': 'shell',
  '5': 'review',
  '6': 'settings',
};

export function useKeyboardShortcuts(onNavigate: (screen: ScreenId) => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) {
        const screen = screenShortcuts[e.key];
        if (screen) {
          e.preventDefault();
          onNavigate(screen);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNavigate]);
}
```

- [ ] **Step 2: Wire into AppShell**

In `AppShell.tsx`, call `useKeyboardShortcuts(setActiveScreen)`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-keyboard-shortcuts.ts
git commit -m "feat(web): add Cmd+1-6 keyboard shortcuts for screen navigation"
```

---

### Task 24: Add Rive agent orb animation

**Files:**
- Create: `apps/web/src/assets/rive/agent-orb.riv` (placeholder)
- Modify: `apps/web/src/components/voice/AgentOrb.tsx`

- [ ] **Step 1: Create Rive animation**

Design and export a `.riv` file from rive.app with a state machine containing 5 states: idle, listening, thinking, speaking, error. The animation should be a glowing orb with:
- Idle: gentle ambient breathing pulse
- Listening: audio-reactive ring expansion
- Thinking: orbiting particles or rotating gradient
- Speaking: outward waveform emanation
- Error: red tint pulse + brief shake

Save as `apps/web/src/assets/rive/agent-orb.riv`.

- [ ] **Step 2: Update AgentOrb to use Rive with CSS fallback**

```tsx
import { useRive, useStateMachineInput } from '@rive-app/react-canvas';

// Load Rive asset, fall back to CSS orb if it fails
const { rive, RiveComponent } = useRive({
  src: new URL('@/assets/rive/agent-orb.riv', import.meta.url).href,
  stateMachines: 'VoiceState',
  autoplay: true,
});

// Drive state machine from voiceState prop
const stateInput = useStateMachineInput(rive, 'VoiceState', 'state');
useEffect(() => {
  if (stateInput) {
    const stateMap = { idle: 0, listening: 1, thinking: 2, speaking: 3, error: 4 };
    stateInput.value = stateMap[voiceState];
  }
}, [voiceState, stateInput]);
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/assets/rive/ apps/web/src/components/voice/AgentOrb.tsx
git commit -m "feat(web): integrate Rive agent orb with voice state machine"
```

---

### Task 25: Delete old files, final cleanup

**Files:**
- Delete: `apps/web/src/styles.css`
- Delete: `apps/web/src/containers/voice-console/VoiceConsoleContainer.tsx`
- Delete: `apps/web/src/containers/voice-console/components/FaceOrb.tsx`
- Delete: `apps/web/src/containers/voice-console/components/BrandLogo.tsx`
- Delete: `apps/web/src/containers/voice-console/components/MobileDock.tsx`
- Delete: `apps/web/src/containers/voice-console/components/ToastViewport.tsx`
- Delete: `apps/web/src/containers/voice-console/components/ScreenSkeleton.tsx`

- [ ] **Step 1: Remove old files**

```bash
cd apps/web
rm src/styles.css
rm src/containers/voice-console/VoiceConsoleContainer.tsx
rm src/containers/voice-console/components/FaceOrb.tsx
rm src/containers/voice-console/components/BrandLogo.tsx
rm src/containers/voice-console/components/MobileDock.tsx
rm src/containers/voice-console/components/ToastViewport.tsx
rm src/containers/voice-console/components/ScreenSkeleton.tsx
```

- [ ] **Step 2: Remove old screen component files that were replaced**

```bash
rm src/containers/voice-console/components/SidebarNav.tsx
rm src/containers/voice-console/components/TopBar.tsx
rm src/containers/voice-console/components/VoiceScreen.tsx
rm src/containers/voice-console/components/TerminalScreen.tsx
rm src/containers/voice-console/components/ReviewScreen.tsx
rm src/containers/voice-console/components/WorkspaceScreen.tsx
rm src/containers/voice-console/components/ShellScreen.tsx
rm src/containers/voice-console/components/SettingsDrawer.tsx
rm src/containers/voice-console/components/OnboardingScreen.tsx
rm src/containers/voice-console/components/MemoryScreen.tsx
rm src/containers/voice-console/components/ComingSoonScreen.tsx
rm src/containers/voice-console/components/DiffView.tsx
rm src/containers/voice-console/components/ReviewFileCard.tsx
rm src/containers/voice-console/components/ReviewHeader.tsx
rm src/containers/voice-console/components/FileTree.tsx
rm src/containers/voice-console/components/FileExplanation.tsx
rm src/containers/voice-console/components/ApprovalHistory.tsx
```

Keep the `lib/` directory (types.ts, helpers.ts, diff.ts, constants.ts, etc.) — these are still imported by the new components.

- [ ] **Step 3: Verify build succeeds with no dead imports**

```bash
cd apps/web && npx vite build 2>&1
```

Fix any broken imports. Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src/
git commit -m "chore(web): delete old styles.css, VoiceConsoleContainer, and replaced components"
```

---

### Task 26: Final regression test

- [ ] **Step 1: Test every feature against the checklist**

Run through the complete feature preservation checklist from the spec (Section 8). For each item:
1. Navigate to the relevant screen
2. Trigger the feature
3. Verify it works as expected

- [ ] **Step 2: Test dark and light mode**

Toggle theme via topbar button. Verify all screens look correct in both modes.

- [ ] **Step 3: Test reduced motion**

Set `prefers-reduced-motion: reduce` in OS settings. Verify animations are disabled/simplified.

- [ ] **Step 4: Verify Electron desktop shell**

Launch via Electron (`npm run dev` from desktop workspace). Verify:
- Runtime status appears in topbar
- PTY terminal works in Shell screen
- Voice capture works through desktop path
- File picker dialog opens via Electron IPC

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(web): complete UI redesign — all features verified"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|-----------------|
| **1: Foundation** | Tasks 1-14 | Tailwind v4, shadcn/ui, Geist fonts, 5 providers, 2 hooks, AppShell with Arc sidebar + thin topbar |
| **2: Core Screens** | Tasks 15-19 | ChatScreen, VoiceScreen (with AgentOrb), ReviewScreen — all fully functional |
| **3: Supporting** | Tasks 20-21 | WorkspaceScreen, ShellScreen, SettingsScreen, OnboardingScreen, MemoryScreen |
| **4: Polish** | Tasks 22-26 | God component fully decomposed, Rive orb, keyboard shortcuts, old files deleted, regression tested |

**Total tasks:** 26
**Estimated commit count:** ~30+
