# VOCOD Desktop App — Full UI Redesign Spec

**Date:** 2026-04-06
**Goal:** Ground-up UI redesign of the VOCOD desktop app to achieve a polished, investor-ready aesthetic inspired by Codex Desktop + Claude Code Desktop. Break up the god component, add modern interactions, preserve every existing feature.

---

## 1. Design Direction

**Reference blend:** OpenAI Codex Desktop (structured panels, muted dark palette, developer-serious) + Anthropic Claude Code Desktop (clean conversation UI, generous whitespace, warm typography, minimal chrome).

**Core principles:**
- **Quiet confidence** — the UI recedes; the content speaks. No decorative noise.
- **Density where it matters** — the voice screen is spacious and cinematic; the terminal/review screens are information-dense.
- **Smooth and alive** — spring-based micro-interactions on every interactive element. Nothing snaps; everything eases.
- **Investor-ready in 3 seconds** — the first screen a user sees (Voice) must feel premium immediately.

---

## 2. Technology Stack

### New dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `tailwindcss` v4 | Utility-first styling, replaces monolithic `styles.css` | Build-time only |
| `@tailwindcss/vite` | Vite plugin for Tailwind v4 | Build-time only |
| `shadcn/ui` components (cherry-picked) | Radix-based primitives: Button, Tooltip, DropdownMenu, Select, ScrollArea, Tabs, Dialog, Sheet, Toggle, Separator, Badge, Skeleton | Tree-shaken |
| `framer-motion` | Spring animations, layout transitions, AnimatePresence | ~33KB gzipped |
| `@rive-app/react-canvas` | Agent character animation (voice orb) | ~60KB |
| `lucide-react` | Consistent icon system (replaces Unicode icons) | Tree-shaken |
| `next-themes` (adapted) or custom `ThemeProvider` | Dark/light mode context | ~2KB |
| `clsx` + `tailwind-merge` | Conditional class composition | ~1KB |

### Fonts

| Use | Font | Why |
|-----|------|-----|
| **UI / Headlines** | **Geist Sans** (Vercel, free, OFL license) | The premium sans-serif of 2025-2026. Used by Vercel, Linear, and v0. Cleaner than Space Grotesk at small sizes, more personality than Inter. |
| **Code / Monospace** | **Geist Mono** (Vercel, free) | Pairs perfectly with Geist Sans. Slightly warmer than JetBrains Mono. Excellent at 13-14px for terminal/diff. |

Both fonts self-hosted from `/assets/fonts/` (no Google Fonts dependency).

### Removed
- `styles.css` (4,081 lines) — replaced entirely by Tailwind utilities + component classes
- Unicode icon characters (`⌘`, `◉`, `💬`, `$`, `Δ`, `⚙`) — replaced by Lucide icons
- Google Fonts import — replaced by self-hosted Geist

---

## 3. Color System

Keep the existing token values (they're well-chosen) but restructure for Tailwind.

### Dark mode (default)

```
--background:       #0e1015        (slightly deeper than current #111317)
--background-elevated: #14171d
--surface-1:        #181c23        (cards, panels)
--surface-2:        #1e222b        (elevated cards, hover states)
--surface-3:        #262b36        (active states, selected items)
--border:           rgba(110, 125, 143, 0.15)   (subtler than current 0.2)
--border-strong:    rgba(130, 146, 166, 0.28)

--text-primary:     #eaf0fa
--text-secondary:   #8a97ab
--text-tertiary:    #5a6578

--accent:           #00d4f5        (slightly softer cyan than #00e5ff)
--accent-muted:     rgba(0, 212, 245, 0.12)
--accent-border:    rgba(0, 212, 245, 0.24)

--success:          #6ffbbe
--success-muted:    rgba(111, 251, 190, 0.10)
--warning:          #f2d070
--warning-muted:    rgba(242, 208, 112, 0.10)
--danger:           #ff8e98
--danger-muted:     rgba(255, 142, 152, 0.10)
```

### Light mode

```
--background:       #f4f7fb
--background-elevated: #ffffff
--surface-1:        #ffffff
--surface-2:        #f0f4f9
--surface-3:        #e4ebf3
--border:           rgba(88, 103, 122, 0.18)
--border-strong:    rgba(79, 98, 121, 0.32)

--text-primary:     #0f1a28
--text-secondary:   #5a6a7e
--text-tertiary:    #8995a6

--accent:           #0891b2        (darker cyan for contrast on white)
--success:          #059669
--warning:          #b45309
--danger:           #dc2626
```

### Tailwind integration

Map all tokens into `tailwind.config.ts` via `theme.extend.colors` referencing CSS variables. This lets us write `bg-surface-1 text-secondary border-border` etc.

---

## 4. Layout Architecture

### Shell structure

```
+-----------------------------------------------------+
| Topbar (44px, full width)                            |
+--------+--------------------------------------------+
| Sidebar|  Content Area                               |
| 56px   |  (centered, max-w-4xl for chat screens,    |
| icons  |   max-w-7xl for review/workspace)           |
| only   |                                             |
|        |                                             |
| expands|                                             |
| to     |                                             |
| 240px  |                                             |
| on     |                                             |
| hover  |                                             |
+--------+--------------------------------------------+
```

### Sidebar — Arc-style collapse

**Collapsed state (default):** 56px wide. Shows only Lucide icons, vertically centered. Active item has a subtle accent background pill. Hover on an individual icon shows a tooltip.

**Expanded state (on hover):** Smoothly animates to 240px via `framer-motion` layout animation (spring, stiffness: 300, damping: 30). Shows icon + label + optional badge. A subtle backdrop blur overlay appears behind the sidebar. Mouse leaving the sidebar area triggers collapse after 150ms delay (prevents accidental close).

**Implementation:** `<motion.aside>` with `animate={{ width }}` driven by hover state. Content uses `AnimatePresence` to fade labels in/out.

### Topbar — thin and informative

**Height:** 44px (down from 72px).
**Layout:** `flex items-center justify-between px-4`

- **Left zone:** Workspace name (truncated, medium weight) + write-mode indicator chip
- **Center zone:** Empty (or breadcrumb for review screen)
- **Right zone:** Provider pill (compact dropdown on click) + status dot + settings icon button + theme toggle

All elements use shadcn `Badge`, `Button` (ghost variant), `DropdownMenu`, and `Tooltip`.

### Content area

- `margin-left` matches sidebar width (56px collapsed, 240px expanded — animated)
- `padding-top: 44px` for topbar
- Inner content container: `mx-auto` with screen-specific max-width
- Smooth `padding-left` transition when sidebar expands

---

## 5. Component Architecture — Breaking Up the God Component

### Current: 1 file, 4,094 lines
`VoiceConsoleContainer.tsx` holds ALL state and ALL logic.

### New: Providers + Hooks + Screen components

```
src/
  providers/
    ThemeProvider.tsx          — dark/light mode context, persists to localStorage
    ApiProvider.tsx            — ApiService instance, base URL, auth token
    StatusProvider.tsx         — polls /api/status, provides status/system via context
    VoiceSessionProvider.tsx   — voice state machine, mic capture, VAD, endpointing
    NavigationProvider.tsx     — active screen, sidebar state, screen history
    ToastProvider.tsx          — toast queue and display
    ApprovalProvider.tsx       — pending approval state, approve/reject actions

  hooks/
    use-voice-session.ts      — extracted voice session logic (start/stop/mute/transcribe)
    use-chat-stream.ts        — SSE event stream for chat, delta merging
    use-desktop-bridge.ts     — Electron IPC, runtime status, PTY management
    use-preferences.ts        — console preferences from localStorage
    use-approval.ts           — approval workflow (fetch diff, approve, reject, history)
    use-keyboard-shortcuts.ts — global keyboard bindings

  components/
    layout/
      AppShell.tsx            — sidebar + topbar + content frame (the layout root)
      Sidebar.tsx             — Arc-style collapsible sidebar
      Topbar.tsx              — thin 44px topbar
      ContentFrame.tsx        — centered scrollable content area
      MobileDock.tsx          — bottom nav for narrow viewports

    screens/
      VoiceScreen.tsx         — voice session UI + agent orb
      ChatScreen.tsx          — text chat (renamed from Terminal)
      ReviewScreen.tsx        — diff review + file tree + approval controls
      WorkspaceScreen.tsx     — project picker + workspace info
      ShellScreen.tsx         — embedded xterm.js terminal
      SettingsScreen.tsx      — full-page settings (not a drawer)
      OnboardingScreen.tsx    — setup wizard
      MemoryScreen.tsx        — notes/memory viewer

    voice/
      AgentOrb.tsx            — Rive-powered voice visualization
      VoiceControls.tsx       — start/stop/mute buttons
      TranscriptCard.tsx      — live transcript display
      ActivityFeed.tsx        — "what it's doing" log
      CommandPicker.tsx       — voice command option cards

    chat/
      MessageBubble.tsx       — single message (user or assistant)
      MessageList.tsx         — scrollable message feed
      ChatComposer.tsx        — input + attachments + mic button
      CodeBlock.tsx           — syntax-highlighted code with copy
      AttachmentChip.tsx      — file attachment preview

    review/
      DiffViewer.tsx          — split/unified diff display
      ReviewFileCard.tsx      — single file diff section
      ReviewHeader.tsx        — approval summary + stats
      FileTreePanel.tsx       — collapsible file navigation
      ApprovalHistory.tsx     — past approval log

    shared/
      (shadcn/ui components installed here via CLI)
      ui/button.tsx
      ui/badge.tsx
      ui/tooltip.tsx
      ui/dropdown-menu.tsx
      ui/select.tsx
      ui/scroll-area.tsx
      ui/tabs.tsx
      ui/dialog.tsx
      ui/sheet.tsx
      ui/separator.tsx
      ui/skeleton.tsx
      ui/toggle.tsx
      ui/input.tsx
      ui/label.tsx

  lib/
    (existing helpers, types, diff parsing — untouched)
    cn.ts                     — clsx + tailwind-merge utility

  services/
    api/
      (existing API services — untouched)
```

### App entry point

```tsx
// App.tsx
<ThemeProvider>
  <ApiProvider>
    <StatusProvider>
      <VoiceSessionProvider>
        <NavigationProvider>
          <ToastProvider>
            <ApprovalProvider>
              <AppShell />
            </ApprovalProvider>
          </ToastProvider>
        </NavigationProvider>
      </VoiceSessionProvider>
    </StatusProvider>
  </ApiProvider>
</ThemeProvider>
```

---

## 6. Animation System

### Layer 1: Framer Motion — UI transitions

| Element | Animation | Config |
|---------|-----------|--------|
| Sidebar expand/collapse | `animate={{ width }}` | spring, stiffness: 300, damping: 30 |
| Sidebar label fade | `AnimatePresence` + `motion.span` opacity | duration: 0.15s |
| Screen transitions | `AnimatePresence` + `motion.div` with fade + subtle Y-shift | spring, damping: 25 |
| Card hover | `whileHover={{ y: -2, boxShadow }}` | spring, stiffness: 400 |
| Button press | `whileTap={{ scale: 0.97 }}` | spring, stiffness: 500 |
| Toast enter/exit | slide in from right + fade | spring, damping: 20 |
| Settings panel open | `Sheet` component with spring slide | framer-motion `Sheet` |
| List items | `staggerChildren: 0.04` on parent | fade + Y-shift per child |
| Status badge changes | `layout` prop for smooth position/size | automatic |

### Layer 2: Rive — Agent Orb (voice visualization)

**Replaces:** Current `FaceOrb` component (CSS-only sine wave SVGs).

**Rive state machine with 5 states:**

| State | Visual | Trigger |
|-------|--------|---------|
| `idle` | Gentle breathing glow, slow ambient pulse | Default |
| `listening` | Ring expands, audio-reactive ripples, accent glow intensifies | `voiceSession.phase === 'listening'` |
| `thinking` | Orbiting particles, rotating gradient, loading feel | `voiceSession.phase === 'thinking'` |
| `speaking` | Waveform emanates outward, mouth-like amplitude modulation | `voiceSession.phase === 'speaking'` |
| `error` | Red tint pulse, brief shake | `voiceSession.phase === 'error'` |

**Audio reactivity:** Feed microphone RMS amplitude (already computed in `endpointing.ts`) as a Rive number input. The Rive animation uses this to modulate ripple intensity and wave height in real-time.

**Design approach:** Create the Rive asset in the Rive editor (free at rive.app). Export as `.riv` file. Load via `@rive-app/react-canvas`. The animation should feel like a premium AI assistant — think a glowing orb of light that breathes and reacts, not a cartoon character.

**Fallback:** If Rive fails to load, fall back to a CSS-only pulsing gradient orb (simpler version of current FaceOrb).

### Layer 3: Canvas + Web Audio — Real-time waveform

For the actual audio waveform visualization during listening/speaking, a lightweight `<canvas>` element draws a smooth frequency curve using the existing `AnalyserNode` data. This sits below/around the Rive orb as a secondary visual layer.

**Style:** Thin, smooth line with accent color, slight glow, opacity modulated by amplitude. Think: a heartbeat monitor for voice.

### Layer 4: CSS — Simple state transitions

Keep CSS transitions for:
- Color changes (hover, focus, active states)
- Border color transitions
- Opacity fades on status indicators
- Skeleton loading shimmer

---

## 7. Screen-by-Screen Redesign

### 7.1 Voice Screen (the hero screen)

**Current:** Stage card with FaceOrb + 3-column live grid + button row.

**New layout:**
```
+--------------------------------------------------+
|                                                    |
|              [Agent Orb — Rive]                   |
|              Large, centered, cinematic            |
|                                                    |
|         "Listening..." / status badge              |
|                                                    |
|  +----------------------------------------------+  |
|  | Live transcript (full width, elegant card)    |  |
|  | "Refactor the auth middleware to use JWT..."   |  |
|  +----------------------------------------------+  |
|                                                    |
|  +-------------------+  +----------------------+  |
|  | What it's doing   |  | Last message         |  |
|  | Analyzing code... |  | "Sure, I'll..."      |  |
|  +-------------------+  +----------------------+  |
|                                                    |
|     [Start voice]  [End]  [Mute]                  |
|                                                    |
+--------------------------------------------------+
```

- Agent orb takes center stage, large (200x200px+), with ambient glow bleeding into the background
- Transcript card below has a subtle typing animation for incoming text
- Activity feed and last-message cards are secondary, 2-column on desktop
- Voice controls are bottom-anchored, pill-shaped buttons with Lucide icons
- Command picker overlays as a modal card when voice commands trigger options

### 7.2 Chat Screen (renamed from Terminal)

**Inspired by:** Claude Code Desktop conversation UI.

- Messages in a centered column (`max-w-3xl`)
- User messages right-aligned, subtle surface background
- Assistant messages left-aligned, clean markdown rendering
- Code blocks with language label, copy button, syntax theme matching app theme
- Streaming indicator: subtle pulsing dot before assistant text
- Composer at bottom: clean input with rounded corners, mic icon button, attachment button, send button
- Attachment chips above input when files are attached
- Auto-scroll with "jump to bottom" button when scrolled up

### 7.3 Review Screen

**Inspired by:** GitHub PR review + Linear's clean panels.

- **Header card:** Task title, summary, file count, total +/- stats, approve/reject buttons
- **File tree sidebar:** collapsible left panel (inside the content area, not the app sidebar), shows file names with +/- badges, highlights active file
- **Diff viewer:** full-width, split or unified toggle. Clean line numbers, green/red backgrounds with low opacity. Monospace Geist Mono.
- **Approval history:** collapsible section below, shows past approvals as a compact table

### 7.4 Workspace Screen

- Project path display with folder icon
- Git status badge (repo / not repo)
- Write access toggle with clear explanation
- Secret policy summary (expandable)
- "Change project" button opens native file picker

### 7.5 Shell Screen

- Full-height xterm.js terminal
- Clean container with subtle border
- Terminal theme colors mapped to app design tokens

### 7.6 Settings Screen

**New: Full screen instead of drawer.**

- Organized into sections with shadcn `Tabs`: General, Voice, Assistant, Display
- Each section has labeled form fields using shadcn `Input`, `Select`, `Toggle`
- Theme toggle (dark/light) with system-preference detection
- Provider management: connect/disconnect/switch with status badges
- Voice settings: model, language, quality, noise mode dropdowns
- Clean, breathable spacing between form groups

### 7.7 Onboarding Screen

- Multi-step wizard with progress bar
- Step 1: Display name input (centered, spacious)
- Step 2: Provider selection (card grid, 2 columns, hover lift effect)
- Step 3: Sandbox terminal demo
- Smooth step transitions via Framer Motion `AnimatePresence`

### 7.8 Memory Screen

- Note cards in a grid/list layout
- Each card: title, body preview, date, source badge
- Create note button opens dialog (shadcn `Dialog`)

---

## 8. Feature Preservation Checklist

Every existing feature MUST be present in the new design:

### Voice features
- [x] Start/stop/retry voice session
- [x] Mute/unmute (3 narration modes: narrated, silent_progress, muted)
- [x] Live transcript display (user voice + AI response)
- [x] Last transcript display
- [x] Voice activity log ("What it's doing")
- [x] Voice error banner with platform-specific guidance
- [x] Voice command option picker (options_required flow)
- [x] Voice state visualization (idle/listening/thinking/speaking/error)
- [x] Status badge with phase indicator
- [x] Codex settings display (model, reasoning effort) on voice screen

### Chat features
- [x] Message history display with timestamps
- [x] Markdown rendering (GFM + syntax highlighting)
- [x] Code blocks with copy button and language label
- [x] User/assistant message distinction
- [x] Streaming responses with delta updates
- [x] Cancel streaming button
- [x] Text input with Shift+Enter for newlines
- [x] File attachments (drag & drop + button)
- [x] Draft attachment chips with remove button
- [x] Mic button to switch to voice
- [x] Auto-scroll to latest message
- [x] Message grouping by role + timestamp

### Review features
- [x] Pending approval header (title, summary, tasks, agents)
- [x] Split and unified diff modes with toggle
- [x] File tree navigation with viewed/unviewed tracking
- [x] File-level collapse/expand
- [x] Line-by-line diff display (add/remove/context)
- [x] File stats (additions/deletions per file and total)
- [x] Approve and reject buttons
- [x] Redacted files indicator
- [x] Approval history log
- [x] Active file tracking via IntersectionObserver

### Workspace features
- [x] Project folder picker (native dialog via Electron IPC)
- [x] Project name and root path display
- [x] Git repo detection indicator
- [x] Write access toggle (advisory → approval-gated)
- [x] Secret policy display
- [x] File explanation viewer

### Shell features
- [x] xterm.js terminal emulator
- [x] PTY session management (create/write/resize/kill via IPC)
- [x] Terminal fit on resize
- [x] Kill session button

### Settings features
- [x] Display name editing
- [x] Theme toggle (dark/light)
- [x] Default screen preference
- [x] Transcript density (comfortable/compact)
- [x] Motion mode (full/reduced)
- [x] Voice settings: silence window, locale, auto-resume, transcription model, transcription language, TTS voice, narration mode, quality profile, noise mode
- [x] Codex settings: model selection, reasoning effort
- [x] Claude settings: model selection, voice model mode
- [x] Provider switching and disconnect
- [x] System info display (environment, database, providers)

### Navigation features
- [x] Screen switching (workspace, voice, text chat, shell, review, settings)
- [x] Navigation badges (pending approval count, streaming indicator)
- [x] Navigation hints (contextual subtitle per screen)
- [x] Mobile dock (bottom nav for narrow viewports)

### System features
- [x] Desktop runtime status display (API phase, owner, reachable)
- [x] Provider auth status (active provider, auth mode, account label)
- [x] Provider switching dropdown
- [x] Refresh and disconnect buttons
- [x] Toast notifications (success/error/info)
- [x] Settings drawer open/close
- [x] Onboarding flow (name → provider → sandbox)
- [x] Welcome greeting with display name

---

## 9. Migration Strategy — Phase-by-Phase

### Phase 1: Foundation (no visible change yet)

**Goal:** Install tooling, set up design tokens, create providers, build AppShell layout.

1. Install Tailwind v4 + Vite plugin, configure with design tokens
2. Install shadcn/ui CLI, initialize with dark theme, install base components (Button, Badge, Tooltip, etc.)
3. Self-host Geist Sans + Geist Mono fonts
4. Install framer-motion, lucide-react, clsx, tailwind-merge
5. Create `cn()` utility
6. Create all 7 providers (Theme, Api, Status, VoiceSession, Navigation, Toast, Approval)
7. Extract hooks from VoiceConsoleContainer: `use-voice-session`, `use-chat-stream`, `use-desktop-bridge`, `use-preferences`, `use-approval`, `use-keyboard-shortcuts`
8. Build AppShell layout: Sidebar (Arc-style) + Topbar (44px) + ContentFrame
9. Wire AppShell to render existing screen components (temporary bridge — old screens inside new shell)
10. **Verify:** App works identically to before with new shell + old screen content

### Phase 2: Core Screens

**Goal:** Redesign the 3 most-used screens with new components.

1. Build shared chat components: MessageBubble, MessageList, ChatComposer, CodeBlock, AttachmentChip
2. Redesign ChatScreen (formerly TerminalScreen) — new message layout, composer, streaming
3. Build voice components: AgentOrb (Rive), VoiceControls, TranscriptCard, ActivityFeed, CommandPicker
4. Create Rive agent animation asset (idle/listening/thinking/speaking/error states)
5. Redesign VoiceScreen — centered orb, transcript cards, controls
6. Build review components: DiffViewer, ReviewFileCard, ReviewHeader, FileTreePanel, ApprovalHistory
7. Redesign ReviewScreen — clean diff, file tree panel, approval flow
8. **Verify:** All 3 screens fully functional with every feature preserved

### Phase 3: Supporting Screens

**Goal:** Redesign remaining screens.

1. Redesign WorkspaceScreen — project info, git status, write access, file explanation
2. Redesign ShellScreen — clean xterm container, theme-matched colors
3. Redesign SettingsScreen — tab layout, shadcn form components
4. Redesign OnboardingScreen — step wizard with animations
5. Redesign MemoryScreen — note cards grid/list
6. Redesign ComingSoonScreen (notes, vibemusic placeholders)
7. **Verify:** All screens functional, all features preserved

### Phase 4: Polish

**Goal:** Micro-interactions, transitions, edge cases, responsive design.

1. Add screen transition animations (AnimatePresence)
2. Add stagger animations on lists (messages, files, settings sections)
3. Add hover/press micro-interactions on all interactive elements
4. Implement keyboard shortcuts (Cmd+1-6 for screens, Cmd+K for command palette if desired)
5. Responsive breakpoints: tablet (sidebar always collapsed), mobile (bottom dock)
6. Reduced motion mode: respect `prefers-reduced-motion`, disable springs/animations
7. Performance audit: React.memo boundaries, lazy-loaded screens, canvas optimization
8. Delete old `styles.css` file entirely
9. Delete old `VoiceConsoleContainer.tsx` (ensure nothing references it)
10. **Final verify:** Full regression test of every feature on the checklist

---

## 10. File Size Targets

| File | Current | Target |
|------|---------|--------|
| VoiceConsoleContainer.tsx | 4,094 lines | **0** (deleted, split into providers + hooks) |
| styles.css | 4,081 lines | **0** (deleted, replaced by Tailwind) |
| Largest new provider | — | <300 lines |
| Largest new hook | — | <250 lines |
| Largest new screen | — | <200 lines |
| Largest new component | — | <150 lines |

---

## 11. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Feature regression | Exhaustive checklist in Section 8. Manual test after each phase. |
| God component extraction breaks state | Phase 1 bridges old screens into new shell first. Only then do we rewrite screens one at a time. |
| Rive animation delays | CSS-only fallback orb ships with Phase 2. Rive asset can be refined iteratively. |
| Tailwind learning curve | All styling decisions are made in this spec. Implementation follows patterns, not ad-hoc decisions. |
| Performance regression from framer-motion | Use `layout` prop sparingly. Lazy-load screens. Profile after Phase 4. |
