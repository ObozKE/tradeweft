import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-[#D9D9D9] disabled:text-[#6B6B6B]',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-pine-700 active:bg-pine-800 shadow-sm',
        ink: 'bg-ink text-white hover:bg-ink-2 active:bg-black shadow-sm',
        outline: 'border border-border bg-transparent text-ink hover:bg-surface-sunken',
        ghost: 'text-ink hover:bg-surface-sunken hover:underline',
        soft: 'bg-orchid-200 text-ink hover:bg-orchid-50',
      },
      size: {
        sm: 'h-9 px-4 rounded-button text-xs',
        md: 'h-11 px-5 rounded-button text-sm min-h-[44px]',
        lg: 'h-[52px] px-7 rounded-button text-base',
        icon: 'h-11 w-11 rounded-chip',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
