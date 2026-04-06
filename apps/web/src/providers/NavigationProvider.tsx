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
  const [activeScreen, setActiveScreenState] = useState<ScreenId>('workspace');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const setActiveScreen = useCallback((screen: ScreenId) => {
    setActiveScreenState(screen);
  }, []);

  return (
    <NavigationContext
      value={{
        activeScreen,
        setActiveScreen,
        sidebarExpanded,
        setSidebarExpanded
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
