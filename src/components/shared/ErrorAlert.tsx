import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ErrorAlertProps {
  title?: string;
  message: string;
  className?: string;
}

export function ErrorAlert({ title, message, className }: ErrorAlertProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-start gap-3 rounded-button border border-amber-700/30 bg-amber-50 p-4 text-start text-amber-800 shadow-sm',
        className
      )}
    >
      <AlertCircle
        className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
        aria-hidden="true"
      />
      <div className="flex-1 text-sm leading-relaxed">
        {title && <p className="font-semibold text-amber-900 mb-0.5">{title}</p>}
        <p>{message}</p>
      </div>
    </div>
  );
}
