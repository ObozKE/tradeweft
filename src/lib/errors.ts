/**
 * Trade Weft Standardized Error & Result Pattern
 * Never leak internal stack traces or database errors to the client.
 */

export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'OAUTH_FAILED'
  | 'ONBOARDING_REQUIRED'
  | 'ALREADY_ONBOARDED'
  | 'STALE_REVISION'
  | 'NOT_YOUR_TURN'
  | 'EXPIRED'
  | 'LIMIT_EXCEEDED'
  | 'INVALID_TRANSITION'
  | 'SELF_PROPOSAL_FORBIDDEN'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REQUIRED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export interface AppError {
  code: ErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type Result<T, E = AppError> =
  | { success: true; data: T; error?: never }
  | { success: false; error: E; data?: never };

export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

export function err<T = never>(
  code: ErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>
): Result<T> {
  return {
    success: false,
    error: {
      code,
      message,
      ...(fieldErrors ? { fieldErrors } : {}),
    },
  };
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value
  );
}
