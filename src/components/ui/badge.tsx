import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-pine-600 text-white hover:bg-pine-700',
        secondary:
          'border-transparent bg-pine-50 text-pine-800 hover:bg-pine-100',
        outline:
          'border-sand-300 text-ink hover:bg-sand-50',
        warning:
          'border-transparent bg-amber-100 text-amber-900 hover:bg-amber-200',
        verified:
          'border-pine-300 bg-pine-50 text-pine-900',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
