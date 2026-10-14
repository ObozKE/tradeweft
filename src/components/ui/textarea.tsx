import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-button border bg-surface px-4 py-3 text-base text-ink placeholder:text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-50',
          error
            ? 'border-amber-700 focus-visible:ring-amber-700'
            : 'border-input-border hover:border-[#6B6B6B] focus-visible:ring-pine-500',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';
