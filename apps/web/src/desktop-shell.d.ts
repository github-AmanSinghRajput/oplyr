export interface DesktopRuntimeStatus {
  isDesktop: true;
  isDevelopment: boolean;
  apiBaseUrl: string;
  apiOwner: 'electron' | 'external' | 'none';
  apiPhase: 'idle' | 'starting' | 'running' | 'failed' | 'stopped';
  apiReachable: boolean;
  apiPid: number | null;
  apiError: string | null;
}

export type DesktopUpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'none' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string; notes?: string }
  | { state: 'error'; message: string };

declare global {
  interface Window {
    desktopShell?: {
      platform: string;
      isDesktop: true;
      apiBaseUrl: string;
      apiAuthToken: string | null;
      getRuntimeStatus: () => Promise<DesktopRuntimeStatus>;
      pickProjectFolder: () => Promise<string | null>;
      subscribeRuntimeStatus: (callback: (status: DesktopRuntimeStatus) => void) => () => void;
      createPtySession: (config: { cwd?: string; cols?: number; rows?: number }) => Promise<string>;
      writePty: (id: string, data: string) => void;
      resizePty: (id: string, cols: number, rows: number) => void;
      killPty: (id: string) => Promise<boolean>;
      subscribePtyData: (callback: (payload: { id: string; data: string }) => void) => () => void;
      subscribePtyExit: (
        callback: (payload: { id: string; exitCode: number }) => void
      ) => () => void;
      getAppVersion: () => Promise<string>;
      getUpdateStatus: () => Promise<DesktopUpdateStatus>;
      checkForUpdate: () => Promise<DesktopUpdateStatus>;
      installUpdate: () => Promise<boolean>;
      subscribeUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
    };
  }
}

export {};
