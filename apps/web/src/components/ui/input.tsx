import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-radius-control border border-border bg-surface-1 px-3 py-1 text-sm',
        'text-text-primary placeholder:text-text-tertiary',
        'transition-colors focus-visible:outline-none focus-visible:border-accent-border focus-visible:ring-1 focus-visible:ring-accent-border',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';
