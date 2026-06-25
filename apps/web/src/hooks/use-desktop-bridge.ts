import { useEffect, useState } from 'react';
import type { DesktopRuntimeStatus } from '@/desktop-shell';

export function useDesktopBridge() {
  const isDesktopShell = Boolean(window.desktopShell?.isDesktop);
  const [desktopRuntime, setDesktopRuntime] = useState<DesktopRuntimeStatus | null>(null);

  useEffect(() => {
    if (!window.desktopShell) return;

    let active = true;
    void window.desktopShell.getRuntimeStatus().then((status) => {
      if (active) setDesktopRuntime(status);
    });

    const unsubscribe = window.desktopShell.subscribeRuntimeStatus((status) => {
      setDesktopRuntime(status);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { isDesktopShell, desktopRuntime };
}
