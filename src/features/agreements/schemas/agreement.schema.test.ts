import { describe, it, expect } from 'vitest';
import {
  proposeTradeSchema,
  counterTradeSchema,
  acceptTradeSchema,
  disputeSchema,
  profileContactSchema,
} from './agreement.schema';

const sampleUuid = '01918a22-3000-7000-8000-000000000001';
const sampleUuid2 = '01918a22-3000-7000-8000-000000000002';

describe('Agreement Zod Validation Schemas', () => {
  it('validates a compliant trade proposal payload', () => {
    const payload = {
      recipientId: sampleUuid,
      proposerLines: [{ packageVersionId: sampleUuid, quantity: 1 }],
      recipientLines: [{ packageVersionId: sampleUuid2, quantity: 2 }],
      note: 'Hello, looking forward to trading.',
      consentedChannels: ['phone', 'email'],
      phone: '0712345678',
      whatsapp: true,
    };

    const res = proposeTradeSchema.safeParse(payload);
    expect(res.success).toBe(true);
  });

  it('rejects trade proposals with 0 lines on either side', () => {
    const payload = {
      recipientId: sampleUuid,
      proposerLines: [],
      recipientLines: [{ packageVersionId: sampleUuid2, quantity: 1 }],
      consentedChannels: ['email'],
    };

    const res = proposeTradeSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });

  it('rejects trade proposals exceeding 3 lines on a side', () => {
    const payload = {
      recipientId: sampleUuid,
      proposerLines: [
        { packageVersionId: sampleUuid, quantity: 1 },
        { packageVersionId: sampleUuid, quantity: 1 },
        { packageVersionId: sampleUuid, quantity: 1 },
        { packageVersionId: sampleUuid, quantity: 1 }, // 4th line
      ],
      recipientLines: [{ packageVersionId: sampleUuid2, quantity: 1 }],
      consentedChannels: ['email'],
    };

    const res = proposeTradeSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });

  it('sanitizes hostile control chars and excessive newlines in note', () => {
    const payload = {
      recipientId: sampleUuid,
      proposerLines: [{ packageVersionId: sampleUuid, quantity: 1 }],
      recipientLines: [{ packageVersionId: sampleUuid2, quantity: 1 }],
      note: 'Line 1\n\n\n\nLine 2\u0000\u202E',
      consentedChannels: ['email'],
    };

    const res = proposeTradeSchema.safeParse(payload);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.note).not.toContain('\u0000');
      expect(res.data.note).not.toContain('\u202E');
      expect(res.data.note).toBe('Line 1\n\nLine 2');
    }
  });

  it('validates counter-offer payload with expectedRevisionNo', () => {
    const payload = {
      agreementId: sampleUuid,
      expectedRevisionNo: 1,
      proposerLines: [{ packageVersionId: sampleUuid, quantity: 2 }],
      recipientLines: [{ packageVersionId: sampleUuid2, quantity: 1 }],
      note: 'Counter note',
    };

    const res = counterTradeSchema.safeParse(payload);
    expect(res.success).toBe(true);
  });

  it('validates dispute reason length (5 to 1000 chars)', () => {
    const shortDispute = { agreementId: sampleUuid, reason: 'Bad' };
    expect(disputeSchema.safeParse(shortDispute).success).toBe(false);

    const validDispute = { agreementId: sampleUuid, reason: 'The agreed deliverable was not provided within the agreed turnaround.' };
    expect(disputeSchema.safeParse(validDispute).success).toBe(true);
  });

  it('validates profile contact phone number', () => {
    expect(profileContactSchema.safeParse({ phone: '0712345678' }).success).toBe(true);
    expect(profileContactSchema.safeParse({ phone: '123' }).success).toBe(false);
  });
});
