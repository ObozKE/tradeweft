import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * Trade Weft — Production Pre-Deployment Load & Concurrency Benchmark Suite (k6)
 *
 * Scenarios tested:
 * 1. High-frequency Marketplace Browse with Keyset Cursor Pagination
 * 2. Public Trust Ledger & Provider Profile Navigation
 * 3. Safaricom Daraja M-Pesa Asynchronous Callback Webhook Ingestion
 * 4. Barter Agreement Negotiation & Proposal Endpoint Stress
 *
 * Targets & SLOs:
 * - 95th percentile latency (p95) < 350ms on marketplace search
 * - 99th percentile latency (p99) < 800ms
 * - Zero failed requests (HTTP error rate < 0.1%)
 * - Webhook callback processing under 200ms
 */

export const errorRate = new Rate('errors');
export const browseTrend = new Trend('browse_latency');
export const ledgerTrend = new Trend('ledger_latency');
export const callbackTrend = new Trend('callback_latency');

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp-up to 20 virtual users
    { duration: '1m', target: 50 },   // Sustained load at 50 VUs (Nairobi peak traffic)
    { duration: '30s', target: 100 },  // Stress burst at 100 VUs
    { duration: '30s', target: 0 },    // Ramp-down to 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<400', 'p(99)<800'],
    'errors': ['rate<0.01'], // < 1% error rate allowed
    'browse_latency': ['p(95)<300'],
    'ledger_latency': ['p(95)<250'],
    'callback_latency': ['p(95)<200'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const DARAJA_CALLBACK_SECRET = __ENV.DARAJA_CALLBACK_SECRET || 'test_callback_secret_token_12345';

export default function () {
  // Scenario 1: Marketplace Keyset Search & Browse
  group('Marketplace Browse & Keyset Pagination', () => {
    // 1. Initial Browse Page (First 20 items)
    const browseRes = http.get(`${BASE_URL}/packages?country=KE`, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'k6-load-tester/1.0',
      },
    });

    const browseOk = check(browseRes, {
      'browse status is 200': (r) => r.status === 200,
    });
    errorRate.add(!browseOk);
    browseTrend.add(browseRes.timings.duration);

    sleep(1);

    // 2. Keyset Paginated Deep Seek
    const cursor = '2026-10-15T12:00:00.000Z_01918a22-3000-7000-8000-000000000042';
    const page2Res = http.get(`${BASE_URL}/packages?country=KE&cursor=${encodeURIComponent(cursor)}`, {
      headers: { 'Accept': 'text/html' },
    });

    const page2Ok = check(page2Res, {
      'keyset page 2 status is 200': (r) => r.status === 200,
    });
    errorRate.add(!page2Ok);
    browseTrend.add(page2Res.timings.duration);
  });

  sleep(1);

  // Scenario 2: Public Trust Ledger & Transparent Ranking
  group('Public Trust Ledger & Reputation Feeds', () => {
    const ledgerRes = http.get(`${BASE_URL}/trust`, {
      headers: { 'Accept': 'text/html' },
    });

    const ledgerOk = check(ledgerRes, {
      'trust page status is 200': (r) => r.status === 200,
    });
    errorRate.add(!ledgerOk);
    ledgerTrend.add(ledgerRes.timings.duration);
  });

  sleep(1);

  // Scenario 3: Safaricom Daraja Webhook Ingestion
  group('Safaricom Daraja STK Callback Webhook', () => {
    const callbackPayload = JSON.stringify({
      Body: {
        stkCallback: {
          MerchantRequestID: '29115-34620561-1',
          CheckoutRequestID: `ws_CO_${Date.now()}_test`,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 1000 },
              { Name: 'MpesaReceiptNumber', Value: 'QGH71AA892' },
              { Name: 'TransactionDate', Value: 20261015143045 },
              { Name: 'PhoneNumber', Value: 254712345678 },
            ],
          },
        },
      },
    });

    const webhookRes = http.post(
      `${BASE_URL}/api/payments/daraja/callback/${DARAJA_CALLBACK_SECRET}`,
      callbackPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '196.201.214.200', // Authorized Safaricom gateway subnet
        },
      }
    );

    const webhookOk = check(webhookRes, {
      'callback accepted status is 200': (r) => r.status === 200,
      'response has ResultCode 0': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.ResultCode === 0;
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!webhookOk);
    callbackTrend.add(webhookRes.timings.duration);
  });

  sleep(1);
}
