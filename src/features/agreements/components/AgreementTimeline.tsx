import React from 'react';
import type { AgreementRevisionItem } from '../types/agreement.types';
import { diffRevisions } from '../utils/diff';
import { formatIndicativeValue } from '@/features/packages/utils/currency';
import {
  GitCommit,
  Plus,
  Minus,
  Edit2,
  Calendar,
  MessageSquare,
  FileCheck,
} from 'lucide-react';

interface AgreementTimelineProps {
  revisions: AgreementRevisionItem[];
  currentUserId: string;
}

export function AgreementTimeline({ revisions, currentUserId }: AgreementTimelineProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <GitCommit className="h-4 w-4 text-pine-700" />
        <h3 className="text-base font-bold text-ink">Negotiation Revisions & Scope Timeline</h3>
      </div>

      <div className="relative border-s-2 border-pine-200 ms-3 space-y-6">
        {revisions.map((rev, idx) => {
          const prevRev = idx > 0 ? revisions[idx - 1] : null;
          const diff = diffRevisions(prevRev, rev);
          const isMe = rev.authoredBy === currentUserId;
          const isLatest = idx === revisions.length - 1;

          return (
            <div key={rev.id} className="relative ms-6 space-y-3">
              {/* Timeline Bullet */}
              <div
                className={`absolute -start-[31px] top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white text-[11px] font-bold ${
                  isLatest
                    ? 'border-pine-600 text-pine-800'
                    : 'border-border text-text-muted'
                }`}
              >
                #{rev.revisionNo}
              </div>

              {/* Revision Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink text-sm">
                    Revision {rev.revisionNo}
                  </span>
                  <span
                    className={`rounded-chip px-2 py-0.5 text-[11px] font-semibold border ${
                      isMe
                        ? 'bg-pine-100 text-pine-800 border-pine-200'
                        : 'bg-surface-sunken text-text-secondary border-border'
                    }`}
                  >
                    {isMe ? 'Authored by You' : 'Authored by Partner'}
                  </span>
                  {isLatest && (
                    <span className="rounded-chip bg-pine-600 text-white px-2 py-0.5 text-[11px] font-bold">
                      Current Terms
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-text-muted text-[11px]">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {new Date(rev.createdAt).toLocaleString('en-KE', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              </div>

              {/* Revision Note */}
              {rev.note && (
                <div className="rounded-button bg-surface-sunken/60 border border-border p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-text-secondary font-semibold">
                    <MessageSquare className="h-3.5 w-3.5 text-pine-600" />
                    <span>Author Note:</span>
                  </div>
                  <p className="text-ink leading-relaxed italic ps-5">
                    "{rev.note}"
                  </p>
                </div>
              )}

              {/* Diffed Lines Grid */}
              <div className="rounded-card border border-border bg-white p-4 space-y-4 shadow-2xs">
                {/* Proposer Gives */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-[0.04em] text-text-secondary">
                    Proposer Delivers:
                  </h4>
                  <div className="space-y-1.5">
                    {diff.proposerGives.map((line, lIdx) => (
                      <div
                        key={lIdx}
                        className={`flex items-center justify-between p-2.5 rounded-button text-xs border ${
                          line.change === 'added'
                            ? 'bg-pine-50 border-pine-200 text-pine-950'
                            : line.change === 'removed'
                            ? 'bg-amber-50 border-amber-200 text-amber-900 line-through'
                            : line.change === 'modified'
                            ? 'bg-surface-sunken border-pine-200 text-ink'
                            : 'bg-white border-border text-ink'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {line.change === 'added' && (
                            <span className="inline-flex items-center text-pine-700 font-bold" title="Added in this revision">
                              <Plus className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {line.change === 'removed' && (
                            <span className="inline-flex items-center text-amber-700 font-bold" title="Removed in this revision">
                              <Minus className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {line.change === 'modified' && (
                            <span className="inline-flex items-center text-pine-700 font-bold" title="Quantity adjusted">
                              <Edit2 className="h-3 w-3" />
                            </span>
                          )}
                          <span className="font-semibold">{line.title}</span>
                        </div>

                        <div className="flex items-center gap-3 text-text-muted">
                          {line.change === 'modified' ? (
                            <span className="font-semibold text-pine-800">
                              Qty: {line.newQuantity} (was {line.oldQuantity})
                            </span>
                          ) : (
                            <span>Qty: {line.quantity}</span>
                          )}
                          {line.indicativeValueMinor !== null && (
                            <span>
                              {formatIndicativeValue(line.indicativeValueMinor * line.quantity, line.currencyCode)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recipient Gives */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <h4 className="text-xs font-bold uppercase tracking-[0.04em] text-text-secondary">
                    Recipient Delivers:
                  </h4>
                  <div className="space-y-1.5">
                    {diff.recipientGives.map((line, lIdx) => (
                      <div
                        key={lIdx}
                        className={`flex items-center justify-between p-2.5 rounded-button text-xs border ${
                          line.change === 'added'
                            ? 'bg-pine-50 border-pine-200 text-pine-950'
                            : line.change === 'removed'
                            ? 'bg-amber-50 border-amber-200 text-amber-900 line-through'
                            : line.change === 'modified'
                            ? 'bg-surface-sunken border-pine-200 text-ink'
                            : 'bg-white border-border text-ink'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {line.change === 'added' && (
                            <span className="inline-flex items-center text-pine-700 font-bold">
                              <Plus className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {line.change === 'removed' && (
                            <span className="inline-flex items-center text-amber-700 font-bold">
                              <Minus className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {line.change === 'modified' && (
                            <span className="inline-flex items-center text-pine-700 font-bold">
                              <Edit2 className="h-3 w-3" />
                            </span>
                          )}
                          <span className="font-semibold">{line.title}</span>
                        </div>

                        <div className="flex items-center gap-3 text-text-muted">
                          {line.change === 'modified' ? (
                            <span className="font-semibold text-pine-800">
                              Qty: {line.newQuantity} (was {line.oldQuantity})
                            </span>
                          ) : (
                            <span>Qty: {line.quantity}</span>
                          )}
                          {line.indicativeValueMinor !== null && (
                            <span>
                              {formatIndicativeValue(line.indicativeValueMinor * line.quantity, line.currencyCode)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
