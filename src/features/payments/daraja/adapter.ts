import { logger } from '@/lib/logger';
import { getDarajaConfig } from './config';
import {
  mockGenerateToken,
  mockStkPush,
  mockStkQuery,
} from './mock';
import type {
  DarajaStkProcessRequest,
  DarajaStkProcessResponse,
  DarajaStkQueryResponse,
  DarajaTokenResponse,
  NormalizedDarajaQueryResult,
} from './types';

// In-memory token cache for process lifetime
let cachedToken: { token: string; expiresAt: number } | null = null;

export function getFormattedTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `${y}${m}${d}${h}${min}${s}`;
}

export function generatePassword(
  shortcode: string,
  passkey: string,
  timestamp: string
): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

/**
 * Retrieves valid Daraja OAuth Bearer access token with shared/local TTL cache.
 */
export async function getDarajaAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 300_000) {
    return cachedToken.token;
  }

  const config = getDarajaConfig();

  if (config.useMock) {
    const mockRes = mockGenerateToken();
    cachedToken = {
      token: mockRes.access_token,
      expiresAt: now + Number(mockRes.expires_in) * 1000,
    };
    return cachedToken.token;
  }

  const credentials = Buffer.from(
    `${config.consumerKey}:${config.consumerSecret}`
  ).toString('base64');

  const tokenUrl = `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;

  try {
    const res = await fetch(tokenUrl, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${credentials}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(
        { status: res.status, error: errText, event: 'daraja.token_fetch_failed' },
        'Failed to obtain Daraja OAuth access token'
      );
      throw new Error(`DARAJA_TOKEN_ERROR: HTTP ${res.status}`);
    }

    const data: DarajaTokenResponse = await res.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: now + Number(data.expires_in) * 1000,
    };
    return cachedToken.token;
  } catch (error: any) {
    logger.error({ error: error?.message, event: 'daraja.token_exception' });
    throw error;
  }
}

export interface InitiateStkPushParams {
  phoneNumber: string; // 2547XXXXXXXX
  amountMinor: number;
  accountReference: string;
  transactionDesc: string;
  customCallbackUrl?: string;
}

/**
 * Dispatches Lipa Na M-Pesa Online (STK Push) request.
 */
export async function initiateDarajaStkPush(
  params: InitiateStkPushParams
): Promise<DarajaStkProcessResponse> {
  // Enforce whole KES constraint (amountMinor must be multiple of 100)
  if (params.amountMinor % 100 !== 0) {
    throw new Error(
      `INVALID_AMOUNT: M-Pesa STK Push accepts whole Kenya Shillings only (${params.amountMinor} minor units is not whole KES)`
    );
  }

  const wholeKes = Math.floor(params.amountMinor / 100);
  if (wholeKes <= 0) {
    throw new Error('INVALID_AMOUNT: Payment amount must be greater than zero');
  }

  const config = getDarajaConfig();
  const timestamp = getFormattedTimestamp();
  const password = generatePassword(config.shortcode, config.passkey, timestamp);

  const callbackUrl =
    params.customCallbackUrl ||
    `${config.callbackBaseUrl}/api/payments/daraja/callback/${config.callbackSecret}`;

  // Truncate to Daraja parameter limits: AccountRef <= 12 chars, Desc <= 13 chars
  const cleanRef = params.accountReference.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'TradeWeft';
  const cleanDesc = params.transactionDesc.replace(/[^a-zA-Z0-9\s]/g, '').slice(0, 13) || 'Payment';

  const payload: DarajaStkProcessRequest = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: wholeKes,
    PartyA: params.phoneNumber,
    PartyB: config.shortcode,
    PhoneNumber: params.phoneNumber,
    CallBackURL: callbackUrl,
    AccountReference: cleanRef,
    TransactionDesc: cleanDesc,
  };

  if (config.useMock) {
    logger.info(
      { phoneNumber: `***${params.phoneNumber.slice(-4)}`, amount: wholeKes, event: 'daraja.mock_stk_dispatched' },
      'Dispatched mock Daraja STK Push'
    );
    return mockStkPush(payload);
  }

  const token = await getDarajaAccessToken();
  const pushUrl = `${config.baseUrl}/mpesa/stkpush/v1/processrequest`;

  const response = await fetch(pushUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const body = await response.json();

  if (!response.ok || body.ResponseCode !== '0') {
    logger.error(
      { status: response.status, body, event: 'daraja.stk_push_failed' },
      'Daraja STK Push request rejected'
    );
    throw new Error(
      `DARAJA_PUSH_FAILED: ${body.CustomerMessage || body.ResponseDescription || 'STK Push failed'}`
    );
  }

  logger.info(
    {
      checkoutRequestId: body.CheckoutRequestID,
      merchantRequestId: body.MerchantRequestID,
      event: 'daraja.stk_push_accepted',
    },
    'Daraja STK Push successfully accepted for processing'
  );

  return body as DarajaStkProcessResponse;
}

/**
 * Queries Safaricom Daraja STK Push status endpoint to verify or reconcile a payment.
 */
export async function queryDarajaStkStatus(
  checkoutRequestId: string
): Promise<NormalizedDarajaQueryResult> {
  const config = getDarajaConfig();

  let data: DarajaStkQueryResponse;

  if (config.useMock) {
    data = mockStkQuery(checkoutRequestId);
  } else {
    const token = await getDarajaAccessToken();
    const timestamp = getFormattedTimestamp();
    const password = generatePassword(config.shortcode, config.passkey, timestamp);

    const queryUrl = `${config.baseUrl}/mpesa/stkpushquery/v1/query`;

    const res = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: config.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
      cache: 'no-store',
    });

    data = await res.json();
  }

  const resultCode = Number(data.ResultCode);

  return normalizeDarajaResult(resultCode, data.ResultDesc, data.MpesaReceiptNumber);
}

/**
 * Maps Daraja result codes to friendly user messages and terminal state flags.
 */
export function normalizeDarajaResult(
  resultCode: number,
  rawDesc: string,
  receiptNumber?: string
): NormalizedDarajaQueryResult {
  if (resultCode === 0) {
    return {
      isFinal: true,
      isSuccess: true,
      resultCode: 0,
      resultDesc: rawDesc,
      receiptNumber,
      userMessage: 'Payment completed successfully.',
    };
  }

  if (resultCode === 1032) {
    return {
      isFinal: true,
      isSuccess: false,
      resultCode: 1032,
      resultDesc: rawDesc,
      userMessage: 'The payment prompt was cancelled on your phone.',
    };
  }

  if (resultCode === 1037) {
    return {
      isFinal: true,
      isSuccess: false,
      resultCode: 1037,
      resultDesc: rawDesc,
      userMessage: 'The payment prompt timed out. Please check your phone connection and try again.',
    };
  }

  if (resultCode === 1) {
    return {
      isFinal: true,
      isSuccess: false,
      resultCode: 1,
      resultDesc: rawDesc,
      userMessage: 'Insufficient M-Pesa balance for this transaction.',
    };
  }

  if (resultCode === 2001) {
    return {
      isFinal: true,
      isSuccess: false,
      resultCode: 2001,
      resultDesc: rawDesc,
      userMessage: 'Incorrect M-Pesa PIN entered.',
    };
  }

  if (resultCode === 1001) {
    // Transaction in progress or phone busy
    return {
      isFinal: false,
      isSuccess: false,
      resultCode: 1001,
      resultDesc: rawDesc,
      userMessage: 'Payment is still being processed on your handset.',
    };
  }

  // Any other failure code is treated as final failure
  return {
    isFinal: true,
    isSuccess: false,
    resultCode,
    resultDesc: rawDesc,
    userMessage: 'Payment could not be completed. Please try again.',
  };
}
