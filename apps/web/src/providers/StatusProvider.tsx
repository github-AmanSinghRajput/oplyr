/* eslint-disable react-refresh/only-export-components -- provider hooks / Radix re-exports are intentionally co-located; this rule is hot-reload DX only */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useApi } from './ApiProvider';
import { useDesktopBridge } from '@/hooks/use-desktop-bridge';
import type { StatusResponse, SystemResponse } from '@/containers/voice-console/lib/types';
import type { DesktopRuntimeStatus } from '@/desktop-shell';

type StatusUpdater =
  | StatusResponse
  | null
  | ((prev: StatusResponse | null) => StatusResponse | null);

interface StatusContextValue {
  status: StatusResponse | null;
  system: SystemResponse | null;
  desktopRuntime: DesktopRuntimeStatus | null;
  isDesktopShell: boolean;
  assistantReady: boolean;
  refreshStatus: () => Promise<void>;
  setStatus: (updater: StatusUpdater) => void;
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount-time status load
    void refreshStatus();
  }, [refreshStatus]);

  const assistantReady = Boolean(status?.assistantProviders.activeProvider?.appConnected);

  return (
    <StatusContext
      value={{
        status,
        system,
        desktopRuntime,
        isDesktopShell,
        assistantReady,
        refreshStatus,
        // React's state setter already accepts both a value and an updater function.
        setStatus
      }}
    >
      {children}
    </StatusContext>
  );
}

export function useStatus() {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error('useStatus must be used within StatusProvider');
  return ctx;
}
