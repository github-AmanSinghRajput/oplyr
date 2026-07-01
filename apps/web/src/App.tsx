import { ThemeProvider } from '@/providers/ThemeProvider';
import { ApiProvider } from '@/providers/ApiProvider';
import { StatusProvider } from '@/providers/StatusProvider';
import { NavigationProvider } from '@/providers/NavigationProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { ApprovalProvider } from '@/providers/ApprovalProvider';
import { TourProvider } from '@/providers/TourProvider';
import { AppShell } from '@/components/layout/AppShell';
import { DesktopOnlyScreen } from '@/components/screens/DesktopOnlyScreen';

// Oplyr is desktop-only. The Electron preload injects `window.desktopShell`; in a plain browser it's
// undefined and several features (terminal, folder picker, runtime bridge) can't work. So unless we
// detect the shell, we refuse to mount — except in dev (`npm run dev`) or with an explicit `?web=1`
// override for debugging a production bundle in a browser.
function isDesktopShellAvailable() {
  if (window.desktopShell?.isDesktop) return true;
  if (import.meta.env.DEV) return true;
  return new URLSearchParams(window.location.search).has('web');
}

export default function App() {
  if (!isDesktopShellAvailable()) {
    return <DesktopOnlyScreen />;
  }

  return (
    <ThemeProvider>
      <ApiProvider>
        <StatusProvider>
          <NavigationProvider>
            <ToastProvider>
              <ApprovalProvider>
                <TourProvider>
                  <AppShell />
                </TourProvider>
              </ApprovalProvider>
            </ToastProvider>
          </NavigationProvider>
        </StatusProvider>
      </ApiProvider>
    </ThemeProvider>
  );
}
