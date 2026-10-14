import type {
  DarajaStkProcessRequest,
  DarajaStkProcessResponse,
  DarajaStkQueryResponse,
  DarajaTokenResponse,
} from './types';
import type { DarajaCallbackPayload } from '../schemas/payment.schema';

export type MockOutcome =
  | 'pending'
  | 'success'
  | 'cancelled'
  | 'timeout'
  | 'insufficient_funds'
  | 'wrong_pin';

export interface MockTransactionRecord {
  checkoutRequestId: string;
  merchantRequestId: string;
  amount: number;
  phoneNumber: string;
  outcome: MockOutcome;
  receiptNumber: string;
  callbackUrl: string;
  createdAt: number;
}

const mockTransactions = new Map<string, MockTransactionRecord>();

let defaultNextOutcome: MockOutcome = 'success';

/**
 * Configure default outcome for subsequent STK Push requests in mock mode.
 */
export function setNextMockOutcome(outcome: MockOutcome) {
  defaultNextOutcome = outcome;
}

/**
 * Configure outcome for a specific existing transaction in mock mode.
 */
export function setMockTransactionOutcome(checkoutRequestId: string, outcome: MockOutcome) {
  const existing = mockTransactions.get(checkoutRequestId);
  if (existing) {
    existing.outcome = outcome;
    mockTransactions.set(checkoutRequestId, existing);
  }
}

/**
 * Clears mock transactions state between test runs.
 */
export function resetMockDaraja() {
  mockTransactions.clear();
  defaultNextOutcome = 'success';
}

export function mockGenerateToken(): DarajaTokenResponse {
  return {
    access_token: `mock_daraja_token_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    expires_in: '3599',
  };
}

export function mockStkPush(request: DarajaStkProcessRequest): DarajaStkProcessResponse {
  const timestamp = Date.now();
  const checkoutRequestId = `ws_CO_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;
  const merchantRequestId = `mock_mr_${timestamp}`;
  const receiptNumber = `NLJ${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const record: MockTransactionRecord = {
    checkoutRequestId,
    merchantRequestId,
    amount: Number(request.Amount),
    phoneNumber: request.PhoneNumber,
    outcome: defaultNextOutcome,
    receiptNumber,
    callbackUrl: request.CallBackURL,
    createdAt: timestamp,
  };

  mockTransactions.set(checkoutRequestId, record);

  return {
    MerchantRequestID: merchantRequestId,
    CheckoutRequestID: checkoutRequestId,
    ResponseCode: '0',
    ResponseDescription: 'Success. Request accepted for processing',
    CustomerMessage: 'Success. Request accepted for processing',
  };
}

export function mockStkQuery(checkoutRequestId: string): DarajaStkQueryResponse {
  const tx = mockTransactions.get(checkoutRequestId);

  if (!tx) {
    return {
      ResponseCode: '1',
      ResponseDesc: 'The transaction does not exist',
      MerchantRequestID: 'unknown',
      CheckoutRequestID: checkoutRequestId,
      ResultCode: 1037,
      ResultDesc: 'Transaction not found',
    };
  }

  switch (tx.outcome) {
    case 'success':
      return {
        ResponseCode: '0',
        ResponseDesc: 'The service request is processed successfully',
        MerchantRequestID: tx.merchantRequestId,
        CheckoutRequestID: tx.checkoutRequestId,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        MpesaReceiptNumber: tx.receiptNumber,
      };

    case 'cancelled':
      return {
        ResponseCode: '0',
        ResponseDesc: 'Request cancelled by user',
        MerchantRequestID: tx.merchantRequestId,
        CheckoutRequestID: tx.checkoutRequestId,
        ResultCode: 1032,
        ResultDesc: 'Request cancelled by user',
      };

    case 'timeout':
      return {
        ResponseCode: '0',
        ResponseDesc: 'DS timeout user cannot be reached',
        MerchantRequestID: tx.merchantRequestId,
        CheckoutRequestID: tx.checkoutRequestId,
        ResultCode: 1037,
        ResultDesc: 'DS timeout user cannot be reached',
      };

    case 'insufficient_funds':
      return {
        ResponseCode: '0',
        ResponseDesc: 'The balance is insufficient for the transaction',
        MerchantRequestID: tx.merchantRequestId,
        CheckoutRequestID: tx.checkoutRequestId,
        ResultCode: 1,
        ResultDesc: 'The balance is insufficient for the transaction',
      };

    case 'wrong_pin':
      return {
        ResponseCode: '0',
        ResponseDesc: 'Wrong PIN entered',
        MerchantRequestID: tx.merchantRequestId,
        CheckoutRequestID: tx.checkoutRequestId,
        ResultCode: 2001,
        ResultDesc: 'Wrong PIN entered',
      };

    case 'pending':
    default:
      return {
        ResponseCode: '0',
        ResponseDesc: 'The transaction is being processed',
        MerchantRequestID: tx.merchantRequestId,
        CheckoutRequestID: tx.checkoutRequestId,
        ResultCode: 1001,
        ResultDesc: 'The transaction is being processed',
      };
  }
}

/**
 * Generates an authentic Safaricom Daraja callback payload for a mock transaction.
 */
export function buildMockCallbackPayload(checkoutRequestId: string): DarajaCallbackPayload {
  const queryRes = mockStkQuery(checkoutRequestId);
  const tx = mockTransactions.get(checkoutRequestId);

  const resultCode = Number(queryRes.ResultCode);
  const isSuccess = resultCode === 0;

  return {
    Body: {
      stkCallback: {
        MerchantRequestID: queryRes.MerchantRequestID,
        CheckoutRequestID: checkoutRequestId,
        ResultCode: resultCode,
        ResultDesc: queryRes.ResultDesc,
        ...(isSuccess && tx
          ? {
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount', Value: tx.amount },
                  { Name: 'MpesaReceiptNumber', Value: tx.receiptNumber },
                  { Name: 'TransactionDate', Value: Number(new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)) },
                  { Name: 'PhoneNumber', Value: tx.phoneNumber },
                ],
              },
            }
          : {}),
      },
    },
  };
}
