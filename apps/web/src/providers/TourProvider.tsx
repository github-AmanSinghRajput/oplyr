/* eslint-disable react-refresh/only-export-components -- provider + its hook are intentionally co-located */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { useNavigation } from '@/providers/NavigationProvider';
import type { ScreenId } from '@/containers/voice-console/lib/types';
import { TOURS, TOUR_VERSION, type TourStep } from '@/components/tour/tours';

// Versioned so bumping TOUR_VERSION re-shows every tour after a meaningful change.
const STORAGE_KEY = `oplyr.tours.seen.v${TOUR_VERSION}`;

function loadSeen(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function persistSeen(seen: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    /* localStorage unavailable */
  }
}

interface ActiveTour {
  screen: ScreenId;
  index: number;
}

interface TourContextValue {
  active: { screen: ScreenId; step: TourStep; index: number; total: number } | null;
  /** Start the given screen's tour if it exists and hasn't been seen (and none is running). */
  startIfUnseen: (screen: ScreenId) => void;
  next: () => void;
  skip: () => void;
  /** Clear all seen tours and replay the current screen's tour immediately. */
  resetTours: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const { activeScreen } = useNavigation();
  const [seen, setSeen] = useState<string[]>(loadSeen);
  const [active, setActive] = useState<ActiveTour | null>(null);

  // Refs let startIfUnseen stay identity-stable (safe as an effect dep) while reading latest state.
  // Synced in effects (not during render) so the ref write doesn't violate the rules of hooks.
  const seenRef = useRef(seen);
  const activeRef = useRef(active);
  useEffect(() => {
    seenRef.current = seen;
  }, [seen]);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const markSeen = useCallback((screen: ScreenId) => {
    setSeen((prev) => {
      if (prev.includes(screen)) return prev;
      const nextSeen = [...prev, screen];
      persistSeen(nextSeen);
      return nextSeen;
    });
  }, []);

  const startIfUnseen = useCallback((screen: ScreenId) => {
    const steps = TOURS[screen];
    if (!steps || steps.length === 0) return;
    if (activeRef.current) return;
    if (seenRef.current.includes(screen)) return;
    setActive({ screen, index: 0 });
  }, []);

  const next = useCallback(() => {
    setActive((cur) => {
      if (!cur) return null;
      const steps = TOURS[cur.screen] ?? [];
      if (cur.index < steps.length - 1) return { ...cur, index: cur.index + 1 };
      markSeen(cur.screen);
      return null;
    });
  }, [markSeen]);

  const skip = useCallback(() => {
    setActive((cur) => {
      if (cur) markSeen(cur.screen);
      return null;
    });
  }, [markSeen]);

  const resetTours = useCallback(() => {
    persistSeen([]);
    setSeen([]);
    const steps = TOURS[activeScreen];
    setActive(steps && steps.length > 0 ? { screen: activeScreen, index: 0 } : null);
  }, [activeScreen]);

  const value = useMemo<TourContextValue>(() => {
    const steps = active ? (TOURS[active.screen] ?? []) : [];
    const step = active ? steps[active.index] : undefined;
    return {
      active:
        active && step
          ? { screen: active.screen, step, index: active.index, total: steps.length }
          : null,
      startIfUnseen,
      next,
      skip,
      resetTours
    };
  }, [active, startIfUnseen, next, skip, resetTours]);

  return <TourContext value={value}>{children}</TourContext>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}
