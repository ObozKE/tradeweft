import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={cn(
            'flex h-12 w-full appearance-none rounded-button border bg-surface px-4 py-2 pe-10 text-base text-ink placeholder:text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-50',
            error
              ? 'border-amber-700 focus-visible:ring-amber-700'
              : 'border-input-border hover:border-[#6B6B6B] focus-visible:ring-pine-500',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute end-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
      </div>
    );
  }
);
Select.displayName = 'Select';
