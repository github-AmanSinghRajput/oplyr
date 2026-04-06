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
