import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useNavigation } from '@/providers/NavigationProvider';

interface ContentFrameProps {
  children: ReactNode;
  maxWidth?: 'narrow' | 'default' | 'wide' | 'full';
}

const maxWidthClasses = {
  narrow: 'max-w-2xl',
  default: 'max-w-4xl',
  wide: 'max-w-6xl',
  full: 'max-w-full'
} as const;

export function ContentFrame({ children, maxWidth = 'default' }: ContentFrameProps) {
  const { sidebarExpanded } = useNavigation();

  return (
    <div
      className={cn(
        'fixed top-[var(--topbar-height)] bottom-0 right-0 overflow-y-auto',
        'transition-[left] duration-300 ease-out'
      )}
      style={{ left: sidebarExpanded ? 240 : 56 }}
    >
      <div className={cn('mx-auto px-6 py-6', maxWidthClasses[maxWidth])}>{children}</div>
    </div>
  );
}
