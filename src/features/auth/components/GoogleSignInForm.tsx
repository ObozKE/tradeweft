'use client';

import React, { useActionState } from 'react';
import { initiateGoogleAuthAction } from '../actions/auth.actions';
import { GoogleButton } from '@/components/shared/GoogleButton';
import { ErrorAlert } from '@/components/shared/ErrorAlert';

export interface GoogleSignInFormProps {
  next?: string;
  buttonLabel?: string;
}

export function GoogleSignInForm({
  next = '/dashboard',
  buttonLabel = 'Continue with Google',
}: GoogleSignInFormProps) {
  const [state, formAction, isPending] = useActionState(
    initiateGoogleAuthAction,
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      {state?.error && (
        <ErrorAlert
          title="Sign-in Notice"
          message={state.error}
          className="mb-4"
        />
      )}

      <GoogleButton
        isLoading={isPending}
        label={buttonLabel}
      />
    </form>
  );
}
