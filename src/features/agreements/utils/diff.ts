import type { AgreementLineItem, AgreementRevisionItem } from '../types/agreement.types';

export type LineDiffChange = 'added' | 'removed' | 'modified' | 'unchanged';

export interface DiffedLine {
  packageVersionId: string;
  title: string;
  change: LineDiffChange;
  oldQuantity?: number;
  newQuantity?: number;
  quantity: number;
  indicativeValueMinor: number | null;
  currencyCode: string;
}

export interface RevisionDiff {
  hasChanges: boolean;
  proposerGives: DiffedLine[];
  recipientGives: DiffedLine[];
  noteChanged: boolean;
  oldNote: string | null;
  newNote: string | null;
}

/**
 * Computes visual diffs between two contract revisions to highlight additions,
 * removals, and quantity modifications.
 */
export function diffRevisions(
  oldRev: AgreementRevisionItem | null | undefined,
  newRev: AgreementRevisionItem
): RevisionDiff {
  if (!oldRev) {
    // First revision: all lines are considered 'added' or base
    return {
      hasChanges: false,
      proposerGives: newRev.lines
        .filter((l) => l.side === 'proposer_gives')
        .map((l) => ({
          packageVersionId: l.packageVersionId,
          title: l.title,
          change: 'unchanged',
          quantity: l.quantity,
          indicativeValueMinor: l.indicativeValueMinor,
          currencyCode: l.currencyCode,
        })),
      recipientGives: newRev.lines
        .filter((l) => l.side === 'recipient_gives')
        .map((l) => ({
          packageVersionId: l.packageVersionId,
          title: l.title,
          change: 'unchanged',
          quantity: l.quantity,
          indicativeValueMinor: l.indicativeValueMinor,
          currencyCode: l.currencyCode,
        })),
      noteChanged: false,
      oldNote: null,
      newNote: newRev.note,
    };
  }

  function compareSide(
    oldLines: AgreementLineItem[],
    newLines: AgreementLineItem[]
  ): { diffs: DiffedLine[]; sideChanged: boolean } {
    const diffs: DiffedLine[] = [];
    let sideChanged = false;

    const oldMap = new Map(oldLines.map((l) => [l.packageVersionId, l]));
    const newMap = new Map(newLines.map((l) => [l.packageVersionId, l]));

    // Check lines in new revision (added or modified or unchanged)
    for (const newLine of newLines) {
      const oldLine = oldMap.get(newLine.packageVersionId);
      if (!oldLine) {
        sideChanged = true;
        diffs.push({
          packageVersionId: newLine.packageVersionId,
          title: newLine.title,
          change: 'added',
          newQuantity: newLine.quantity,
          quantity: newLine.quantity,
          indicativeValueMinor: newLine.indicativeValueMinor,
          currencyCode: newLine.currencyCode,
        });
      } else if (oldLine.quantity !== newLine.quantity) {
        sideChanged = true;
        diffs.push({
          packageVersionId: newLine.packageVersionId,
          title: newLine.title,
          change: 'modified',
          oldQuantity: oldLine.quantity,
          newQuantity: newLine.quantity,
          quantity: newLine.quantity,
          indicativeValueMinor: newLine.indicativeValueMinor,
          currencyCode: newLine.currencyCode,
        });
      } else {
        diffs.push({
          packageVersionId: newLine.packageVersionId,
          title: newLine.title,
          change: 'unchanged',
          quantity: newLine.quantity,
          indicativeValueMinor: newLine.indicativeValueMinor,
          currencyCode: newLine.currencyCode,
        });
      }
    }

    // Check lines removed from old revision
    for (const oldLine of oldLines) {
      if (!newMap.has(oldLine.packageVersionId)) {
        sideChanged = true;
        diffs.push({
          packageVersionId: oldLine.packageVersionId,
          title: oldLine.title,
          change: 'removed',
          oldQuantity: oldLine.quantity,
          quantity: oldLine.quantity,
          indicativeValueMinor: oldLine.indicativeValueMinor,
          currencyCode: oldLine.currencyCode,
        });
      }
    }

    return { diffs, sideChanged };
  }

  const oldProposer = oldRev.lines.filter((l) => l.side === 'proposer_gives');
  const newProposer = newRev.lines.filter((l) => l.side === 'proposer_gives');
  const proposerDiff = compareSide(oldProposer, newProposer);

  const oldRecipient = oldRev.lines.filter((l) => l.side === 'recipient_gives');
  const newRecipient = newRev.lines.filter((l) => l.side === 'recipient_gives');
  const recipientDiff = compareSide(oldRecipient, newRecipient);

  const noteChanged = (oldRev.note || null) !== (newRev.note || null);
  const hasChanges = proposerDiff.sideChanged || recipientDiff.sideChanged || noteChanged;

  return {
    hasChanges,
    proposerGives: proposerDiff.diffs,
    recipientGives: recipientDiff.diffs,
    noteChanged,
    oldNote: oldRev.note,
    newNote: newRev.note,
  };
}
