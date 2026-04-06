import { ThemeProvider } from '@/providers/ThemeProvider';
import { ApiProvider } from '@/providers/ApiProvider';
import { StatusProvider } from '@/providers/StatusProvider';
import { NavigationProvider } from '@/providers/NavigationProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { ApprovalProvider } from '@/providers/ApprovalProvider';
import { AppShell } from '@/components/layout/AppShell';

export default function App() {
  return (
    <ThemeProvider>
      <ApiProvider>
        <StatusProvider>
          <NavigationProvider>
            <ToastProvider>
              <ApprovalProvider>
                <AppShell />
              </ApprovalProvider>
            </ToastProvider>
          </NavigationProvider>
        </StatusProvider>
      </ApiProvider>
    </ThemeProvider>
  );
}
