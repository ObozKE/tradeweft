import { describe, it, expect, beforeEach } from 'vitest';
import {
  getFormattedTimestamp,
  generatePassword,
  initiateDarajaStkPush,
  queryDarajaStkStatus,
  normalizeDarajaResult,
} from '../daraja/adapter';
import {
  resetMockDaraja,
  setNextMockOutcome,
  setMockTransactionOutcome,
  buildMockCallbackPayload,
} from '../daraja/mock';

describe('Daraja Utilities', () => {
  it('formats timestamp as YYYYMMDDHHmmss exactly 14 digits', () => {
    const fixedDate = new Date('2026-10-15T14:30:45Z');
    const ts = getFormattedTimestamp(fixedDate);
    expect(ts).toBe('20261015143045');
    expect(ts.length).toBe(14);
  });

  it('generates base64 encoded password matching Safaricom specification', () => {
    const shortcode = '174379';
    const passkey = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
    const timestamp = '20261015143045';

    const password = generatePassword(shortcode, passkey, timestamp);
    const decoded = Buffer.from(password, 'base64').toString('utf8');

    expect(decoded).toBe(`${shortcode}${passkey}${timestamp}`);
  });
});

describe('Daraja Mock & STK Push Adapter', () => {
  beforeEach(() => {
    resetMockDaraja();
  });

  it('successfully initiates STK push with whole KES amount', async () => {
    const res = await initiateDarajaStkPush({
      phoneNumber: '254712345678',
      amountMinor: 50000, // 500.00 KES
      accountReference: 'TradeWeft',
      transactionDesc: 'Top Ad Promo',
    });

    expect(res.ResponseCode).toBe('0');
    expect(res.CheckoutRequestID).toMatch(/^ws_CO_/);
    expect(res.MerchantRequestID).toBeDefined();
  });

  it('rejects amounts with fractional cents (not whole KES)', async () => {
    await expect(
      initiateDarajaStkPush({
        phoneNumber: '254712345678',
        amountMinor: 50050, // 500.50 KES
        accountReference: 'TradeWeft',
        transactionDesc: 'Top Ad Promo',
      })
    ).rejects.toThrow('INVALID_AMOUNT');
  });

  it('queries transaction status and returns success outcome', async () => {
    setNextMockOutcome('success');
    const push = await initiateDarajaStkPush({
      phoneNumber: '254712345678',
      amountMinor: 100000, // 1000 KES
      accountReference: 'BoostBasic',
      transactionDesc: 'Boost Plan',
    });

    const status = await queryDarajaStkStatus(push.CheckoutRequestID);

    expect(status.isFinal).toBe(true);
    expect(status.isSuccess).toBe(true);
    expect(status.resultCode).toBe(0);
    expect(status.receiptNumber).toBeDefined();
  });

  it('queries transaction status for cancelled transaction', async () => {
    const push = await initiateDarajaStkPush({
      phoneNumber: '254712345678',
      amountMinor: 100000,
      accountReference: 'BoostBasic',
      transactionDesc: 'Boost Plan',
    });

    setMockTransactionOutcome(push.CheckoutRequestID, 'cancelled');

    const status = await queryDarajaStkStatus(push.CheckoutRequestID);

    expect(status.isFinal).toBe(true);
    expect(status.isSuccess).toBe(false);
    expect(status.resultCode).toBe(1032);
    expect(status.userMessage).toContain('cancelled');
  });

  it('queries transaction status for timeout transaction', async () => {
    const push = await initiateDarajaStkPush({
      phoneNumber: '254712345678',
      amountMinor: 100000,
      accountReference: 'BoostBasic',
      transactionDesc: 'Boost Plan',
    });

    setMockTransactionOutcome(push.CheckoutRequestID, 'timeout');

    const status = await queryDarajaStkStatus(push.CheckoutRequestID);

    expect(status.isFinal).toBe(true);
    expect(status.isSuccess).toBe(false);
    expect(status.resultCode).toBe(1037);
    expect(status.userMessage).toContain('timed out');
  });

  it('builds authentic Safaricom callback payload structure', async () => {
    setNextMockOutcome('success');
    const push = await initiateDarajaStkPush({
      phoneNumber: '254712345678',
      amountMinor: 50000,
      accountReference: 'TradeWeft',
      transactionDesc: 'Top Ad',
    });

    const payload = buildMockCallbackPayload(push.CheckoutRequestID);

    expect(payload.Body.stkCallback.CheckoutRequestID).toBe(push.CheckoutRequestID);
    expect(payload.Body.stkCallback.ResultCode).toBe(0);
    expect(payload.Body.stkCallback.CallbackMetadata?.Item).toBeDefined();
    expect(
      payload.Body.stkCallback.CallbackMetadata?.Item.find((i) => i.Name === 'MpesaReceiptNumber')?.Value
    ).toBeDefined();
  });
});

describe('normalizeDarajaResult', () => {
  it('correctly maps known result codes', () => {
    expect(normalizeDarajaResult(0, 'Success', 'NLJ123').isSuccess).toBe(true);
    expect(normalizeDarajaResult(1032, 'Cancelled').resultCode).toBe(1032);
    expect(normalizeDarajaResult(1037, 'Timeout').resultCode).toBe(1037);
    expect(normalizeDarajaResult(1, 'Insufficient').resultCode).toBe(1);
    expect(normalizeDarajaResult(2001, 'Wrong PIN').resultCode).toBe(2001);
    expect(normalizeDarajaResult(1001, 'In progress').isFinal).toBe(false);
  });
});
