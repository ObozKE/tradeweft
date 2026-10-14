import { logger } from '@/lib/logger';

export interface DarajaEnvironmentConfig {
  env: 'sandbox' | 'production';
  baseUrl: string;
  shortcode: string;
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  callbackSecret: string;
  callbackBaseUrl: string;
  useMock: boolean;
}

/**
 * Validates Daraja configuration and enforces strict environment isolation.
 * Fails fast at boot/runtime if production runs with sandbox settings.
 */
export function getDarajaConfig(): DarajaEnvironmentConfig {
  const nodeEnv = process.env.NODE_ENV;
  const darajaEnv = (process.env.DARAJA_ENV as 'sandbox' | 'production') || 'sandbox';
  const useMock = process.env.DARAJA_USE_MOCK === 'true' || nodeEnv === 'test';

  const shortcode = process.env.DARAJA_SHORTCODE || '174379';
  const consumerKey = process.env.DARAJA_CONSUMER_KEY || 'mock_consumer_key';
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET || 'mock_consumer_secret';
  const passkey =
    process.env.DARAJA_PASSKEY ||
    'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
  const callbackSecret = process.env.DARAJA_CALLBACK_SECRET || 'dev_callback_secret_token_12345';
  const callbackBaseUrl =
    process.env.DARAJA_CALLBACK_BASE_URL ||
    (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

  // Production Guard: Strict fail-fast check
  if (nodeEnv === 'production') {
    if (useMock) {
      throw new Error(
        'SECURITY_FAULT: DARAJA_USE_MOCK cannot be enabled in NODE_ENV=production'
      );
    }
    if (darajaEnv !== 'production') {
      throw new Error(
        'CONFIG_FAULT: Production deployments must set DARAJA_ENV=production'
      );
    }
    if (shortcode === '174379') {
      throw new Error(
        'CONFIG_FAULT: Cannot use Safaricom sandbox test shortcode (174379) in production'
      );
    }
    if (!process.env.DARAJA_CONSUMER_KEY || !process.env.DARAJA_CONSUMER_SECRET || !process.env.DARAJA_PASSKEY) {
      throw new Error(
        'CONFIG_FAULT: Missing required Safaricom production credentials in environment variables'
      );
    }
    if (!process.env.DARAJA_CALLBACK_SECRET || process.env.DARAJA_CALLBACK_SECRET === 'dev_callback_secret_token_12345') {
      throw new Error(
        'CONFIG_FAULT: A high-entropy DARAJA_CALLBACK_SECRET must be configured for production webhooks'
      );
    }
  }

  const baseUrl =
    darajaEnv === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

  return {
    env: darajaEnv,
    baseUrl,
    shortcode,
    consumerKey,
    consumerSecret,
    passkey,
    callbackSecret,
    callbackBaseUrl,
    useMock,
  };
}
