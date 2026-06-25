/* eslint-disable react-refresh/only-export-components -- provider hooks / Radix re-exports are intentionally co-located; this rule is hot-reload DX only */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { ScreenId } from '@/containers/voice-console/lib/types';

const PIN_STORAGE_KEY = 'oplyr.sidebar.pinned';

interface NavigationContextValue {
  activeScreen: ScreenId;
  setActiveScreen: (screen: ScreenId) => void;
  sidebarExpanded: boolean;
  setSidebarExpanded: (expanded: boolean) => void;
  sidebarPinned: boolean;
  setSidebarPinned: (pinned: boolean) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeScreen, setActiveScreenState] = useState<ScreenId>('workspace');
  const [sidebarPinned, setSidebarPinnedState] = useState(() => {
    try {
      return localStorage.getItem(PIN_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [sidebarExpanded, setSidebarExpanded] = useState(sidebarPinned);

  const setActiveScreen = useCallback((screen: ScreenId) => {
    setActiveScreenState(screen);
  }, []);

  const setSidebarPinned = useCallback((pinned: boolean) => {
    setSidebarPinnedState(pinned);
    try {
      localStorage.setItem(PIN_STORAGE_KEY, String(pinned));
    } catch {
      /* localStorage unavailable */
    }
    if (pinned) setSidebarExpanded(true);
  }, []);

  return (
    <NavigationContext
      value={{
        activeScreen,
        setActiveScreen,
        sidebarExpanded,
        setSidebarExpanded,
        sidebarPinned,
        setSidebarPinned
      }}
    >
      {children}
    </NavigationContext>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}
