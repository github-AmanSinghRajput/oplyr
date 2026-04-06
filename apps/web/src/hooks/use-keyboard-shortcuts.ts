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
