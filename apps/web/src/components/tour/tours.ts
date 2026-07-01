import type { ScreenId } from '@/containers/voice-console/lib/types';

// A single coach-mark step. `target` is a `data-tour` value on a real element to spotlight; omit it
// for a centered intro card. If a targeted element isn't on screen at runtime, the overlay falls
// back to a centered card so the tour never breaks.
export interface TourStep {
  target?: string;
  title: string;
  body: string;
}

// Per-screen tours, each shown once the first time that screen is opened. Keep them short — 1-3 steps.
// The bump `TOUR_VERSION` to re-show every tour after a meaningful change (acts as a cache-bust).
export const TOUR_VERSION = 1;

export const TOURS: Partial<Record<ScreenId, TourStep[]>> = {
  workspace: [
    {
      title: 'Welcome to Oplyr',
      body: 'Your desktop cockpit for AI coding agents — voice or text, every change reviewed before it lands. Here’s the 20-second tour.'
    },
    {
      target: 'sidebar',
      title: 'Everything lives here',
      body: 'Jump between Chat, Voice, Review, the Codebase Map, Markdown, and Settings from the sidebar.'
    },
    {
      target: 'topbar-provider',
      title: 'Your agents, on tap',
      body: 'Connect more than one agent and switch the active one anytime — it picks up where you left off.'
    }
  ],
  terminal: [
    {
      target: 'composer',
      title: 'Tell it what to change',
      body: 'Type your task here, or use voice. The active agent works inside the project you’ve opened.'
    },
    {
      title: 'You approve what lands',
      body: 'When the agent proposes edits, they show up as a diff to review — nothing is written without your yes.'
    }
  ],
  voice: [
    {
      target: 'voice-mic',
      title: 'Talk through it',
      body: 'Tap to speak. Your voice is transcribed on-device — the audio never leaves your Mac.'
    },
    {
      target: 'voice-autosend',
      title: 'Send, or review first',
      body: 'With auto-send off, your spoken words land in an editable box so you can tweak them before sending.'
    }
  ],
  review: [
    {
      target: 'review-actions',
      title: 'Read, then decide',
      body: 'Inspect the diff and Approve to apply or Reject to discard. The agent keeps responding after you decide.'
    }
  ],
  'codebase-map': [
    {
      title: 'See your codebase',
      body: 'Connect a repo and Oplyr maps it live. Switch between tree and force layouts, and click any file for detail.'
    }
  ],
  markdown: [
    {
      title: 'Docs, in place',
      body: 'Open any Markdown file — READMEs, design notes — and read it as clean formatted docs beside your code.'
    }
  ],
  settings: [
    {
      title: 'Make it yours',
      body: 'Tune agents, voice, and appearance here. You can replay this whole tour anytime from General settings.'
    }
  ]
};
