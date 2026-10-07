import pino from 'pino';

/**
 * Mask sensitive personal email addresses: j***e@example.com
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

const redactPaths = [
  'token',
  'accessToken',
  'refreshToken',
  'code',
  'password',
  'secret',
  'authorization',
  'cookie',
  'headers.cookie',
  'headers.authorization',
  '*.token',
  '*.code',
];

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  base: {
    env: process.env.NODE_ENV,
    service: 'tradeweft-auth',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export interface LogContext {
  requestId?: string;
  userId?: string;
  ip?: string;
  path?: string;
  country?: string;
  [key: string]: unknown;
}

export function createRequestLogger(context: LogContext) {
  return logger.child(context);
}
