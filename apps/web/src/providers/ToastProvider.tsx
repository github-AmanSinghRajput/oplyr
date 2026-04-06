import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface ToastItem {
  id: string;
  tone: 'success' | 'error' | 'info';
  title: string;
  detail: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  pushToast: (tone: ToastItem['tone'], title: string, detail: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((tone: ToastItem['tone'], title: string, detail: string) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    setToasts((prev) => [...prev, { id, tone, title, detail }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timeout = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 3200);
    return () => window.clearTimeout(timeout);
  }, [toasts]);

  return (
    <ToastContext value={{ toasts, pushToast, dismissToast }}>
      {children}
    </ToastContext>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
