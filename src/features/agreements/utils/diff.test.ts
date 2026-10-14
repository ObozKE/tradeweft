import { describe, it, expect } from 'vitest';
import { diffRevisions } from './diff';
import type { AgreementRevisionItem, AgreementLineItem } from '../types/agreement.types';

function mockLine(
  side: 'proposer_gives' | 'recipient_gives',
  versionId: string,
  quantity: number,
  title: string
): AgreementLineItem {
  return {
    id: `line-${versionId}`,
    side,
    packageVersionId: versionId,
    quantity,
    title,
    summary: 'Summary',
    indicativeValueMinor: 100000,
    currencyCode: 'KES',
    categoryName: 'Design',
    deliveryMode: 'remote',
    turnaroundDays: 7,
    deliverables: ['Deliverable 1'],
  };
}

describe('Revision Diffing Utility', () => {
  it('detects no changes for identical revisions', () => {
    const rev1: AgreementRevisionItem = {
      id: 'rev-1',
      revisionNo: 1,
      authoredBy: 'user-a',
      note: 'Initial note',
      createdAt: '2026-10-13T10:00:00Z',
      lines: [
        mockLine('proposer_gives', 'v-1', 1, 'Logo Design'),
        mockLine('recipient_gives', 'v-2', 2, 'Copywriting'),
      ],
    };

    const rev2: AgreementRevisionItem = {
      ...rev1,
      id: 'rev-2',
      revisionNo: 2,
    };

    const diff = diffRevisions(rev1, rev2);
    expect(diff.hasChanges).toBe(false);
    expect(diff.proposerGives[0].change).toBe('unchanged');
    expect(diff.recipientGives[0].change).toBe('unchanged');
  });

  it('detects quantity modifications, line additions, and note changes', () => {
    const rev1: AgreementRevisionItem = {
      id: 'rev-1',
      revisionNo: 1,
      authoredBy: 'user-a',
      note: 'Initial note',
      createdAt: '2026-10-13T10:00:00Z',
      lines: [
        mockLine('proposer_gives', 'v-1', 1, 'Logo Design'),
        mockLine('recipient_gives', 'v-2', 1, 'Copywriting'),
      ],
    };

    const rev2: AgreementRevisionItem = {
      id: 'rev-2',
      revisionNo: 2,
      authoredBy: 'user-b',
      note: 'Counter: increased copywriting to 2 units, added SEO audit',
      createdAt: '2026-10-13T11:00:00Z',
      lines: [
        mockLine('proposer_gives', 'v-1', 1, 'Logo Design'), // unchanged
        mockLine('proposer_gives', 'v-3', 1, 'SEO Audit'),   // added to proposer side
        mockLine('recipient_gives', 'v-2', 2, 'Copywriting'), // modified quantity
      ],
    };

    const diff = diffRevisions(rev1, rev2);
    expect(diff.hasChanges).toBe(true);
    expect(diff.noteChanged).toBe(true);

    const proposerAdded = diff.proposerGives.find((l) => l.packageVersionId === 'v-3');
    expect(proposerAdded?.change).toBe('added');

    const recipientModified = diff.recipientGives.find((l) => l.packageVersionId === 'v-2');
    expect(recipientModified?.change).toBe('modified');
    expect(recipientModified?.oldQuantity).toBe(1);
    expect(recipientModified?.newQuantity).toBe(2);
  });

  it('detects removed lines', () => {
    const rev1: AgreementRevisionItem = {
      id: 'rev-1',
      revisionNo: 1,
      authoredBy: 'user-a',
      note: null,
      createdAt: '2026-10-13T10:00:00Z',
      lines: [
        mockLine('proposer_gives', 'v-1', 1, 'Package A'),
        mockLine('proposer_gives', 'v-2', 1, 'Package B'),
      ],
    };

    const rev2: AgreementRevisionItem = {
      id: 'rev-2',
      revisionNo: 2,
      authoredBy: 'user-b',
      note: null,
      createdAt: '2026-10-13T11:00:00Z',
      lines: [
        mockLine('proposer_gives', 'v-1', 1, 'Package A'), // kept
      ],
    };

    const diff = diffRevisions(rev1, rev2);
    expect(diff.hasChanges).toBe(true);
    const removedLine = diff.proposerGives.find((l) => l.packageVersionId === 'v-2');
    expect(removedLine?.change).toBe('removed');
  });
});
