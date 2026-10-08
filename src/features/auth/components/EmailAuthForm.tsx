'use client';

import React, { useActionState, useState } from 'react';
import { signInWithEmailAction, signUpWithEmailAction } from '../actions/auth.actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorAlert } from '@/components/shared/ErrorAlert';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';

export interface EmailAuthFormProps {
  mode: 'login' | 'signup';
  next?: string;
  submitButtonLabel: string;
  termsNotice?: string;
}

export function EmailAuthForm({
  mode,
  next = '/dashboard',
  submitButtonLabel,
  termsNotice,
}: EmailAuthFormProps) {
  const action = mode === 'login' ? signInWithEmailAction : signUpWithEmailAction;
  const [state, formAction, isPending] = useActionState(action, null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4 text-start">
      <input type="hidden" name="next" value={next} />

      {state?.error && (
        <ErrorAlert
          title={mode === 'login' ? 'Sign-in Notice' : 'Sign-up Notice'}
          message={state.error}
          className="mb-4"
        />
      )}

      {state?.info && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-button border border-primary/30 bg-pine-100/60 p-4 text-start text-pine-900 shadow-sm mb-4"
        >
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="flex-1 text-sm leading-relaxed">
            <p className="font-semibold text-primary mb-0.5">Verification Sent</p>
            <p>{state.info}</p>
          </div>
        </div>
      )}

      {/* Email Field */}
      <div className="space-y-1.5">
        <Label htmlFor={`${mode}-email`} requiredIndicator>
          Email Address
        </Label>
        <Input
          id={`${mode}-email`}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@business.co.ke"
          error={!!state?.fieldErrors?.email}
          required
        />
        {state?.fieldErrors?.email && (
          <p className="text-xs text-amber-800 font-medium">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      {/* Password Field */}
      <div className="space-y-1.5">
        <Label htmlFor={`${mode}-password`} requiredIndicator>
          Password
        </Label>
        <div className="relative">
          <Input
            id={`${mode}-password`}
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            className="pe-10"
            error={!!state?.fieldErrors?.password}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-ink focus-visible:outline-none"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Eye className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
        {state?.fieldErrors?.password && (
          <p className="text-xs text-amber-800 font-medium">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>

      {/* Confirm Password (Signup only) */}
      {mode === 'signup' && (
        <div className="space-y-1.5">
          <Label htmlFor="signup-confirm-password" requiredIndicator>
            Confirm Password
          </Label>
          <div className="relative">
            <Input
              id="signup-confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              className="pe-10"
              error={!!state?.fieldErrors?.confirmPassword}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-ink focus-visible:outline-none"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Eye className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
          {state?.fieldErrors?.confirmPassword && (
            <p className="text-xs text-amber-800 font-medium">
              {state.fieldErrors.confirmPassword[0]}
            </p>
          )}
        </div>
      )}

      {/* Terms Checkbox (Signup only) */}
      {mode === 'signup' && termsNotice && (
        <div className="space-y-1.5 pt-1">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              name="termsAccepted"
              value="true"
              required
              className="mt-1 h-4 w-4 rounded border-input-border text-primary focus:ring-pine-500 accent-primary"
            />
            <span className="text-xs text-text-muted leading-relaxed">
              {termsNotice}
            </span>
          </label>
          {state?.fieldErrors?.termsAccepted && (
            <p className="text-xs text-amber-800 font-medium">
              {state.fieldErrors.termsAccepted[0]}
            </p>
          )}
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={isPending}
        className="w-full h-12 text-sm mt-2"
        variant="primary"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Processing...</span>
          </>
        ) : (
          <span>{submitButtonLabel}</span>
        )}
      </Button>
    </form>
  );
}
