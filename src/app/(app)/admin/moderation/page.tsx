import React from 'react';
import { requireVerifierOrAdmin } from '@/server/dal';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldAlert, CheckCircle2, EyeOff } from 'lucide-react';
import { adminModerateReviewAction } from '@/features/verification/actions/admin.actions';

export default async function AdminModerationPage() {
  const { supabase } = await requireVerifierOrAdmin();

  // Fetch pending review reports
  const { data: reports } = await supabase
    .from('review_reports')
    .select(`
      id,
      review_id,
      reason,
      details,
      created_at,
      reporter:reporter_id (
        display_name,
        business_name
      ),
      reviews:review_id (
        id,
        overall_rating,
        review_text,
        status,
        created_at,
        reviewer:reviewer_id (
          display_name,
          business_name
        )
      )
    `)
    .order('created_at', { ascending: true });

  const reportsList = reports || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-700" />
            Review Moderation Queue
          </h2>
          <p className="text-xs text-text-muted">
            Reports submitted by reviewees for extortion, harassment, or policy violations.
          </p>
        </div>
        <Badge variant="outline" className="border-sand-300">
          {reportsList.length} Pending Reports
        </Badge>
      </div>

      {reportsList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sand-300 p-12 text-center bg-white">
          <CheckCircle2 className="w-10 h-10 text-pine-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-ink">Moderation Queue is Clear</h3>
          <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
            No disputed or reported trade reviews require attention at this time.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reportsList.map((item) => {
            const rev = Array.isArray(item.reviews) ? item.reviews[0] : item.reviews;
            const reporter = Array.isArray(item.reporter) ? item.reporter[0] : item.reporter;
            const reviewer = rev && (Array.isArray(rev.reviewer) ? rev.reviewer[0] : rev.reviewer);

            return (
              <Card key={item.id} className="border-sand-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="warning" className="uppercase font-mono text-[10px]">
                      Reason: {item.reason.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-xs text-text-muted">
                      Reported: {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <CardTitle className="text-sm font-semibold text-ink mt-2">
                    Reported by:{' '}
                    <span className="text-pine-800">
                      {reporter?.business_name || reporter?.display_name || 'Reviewee'}
                    </span>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4 text-xs">
                  {item.details && (
                    <div className="rounded bg-sand-50 p-3 border border-sand-200 text-text-secondary">
                      <span className="font-semibold text-ink block mb-1">Reporter Statement:</span>
                      {item.details}
                    </div>
                  )}

                  {rev && (
                    <div className="rounded border border-sand-200 p-3 space-y-2 bg-white">
                      <div className="flex items-center justify-between text-text-muted">
                        <span>
                          Author:{' '}
                          <span className="text-ink font-medium">
                            {reviewer?.business_name || reviewer?.display_name || 'Reviewer'}
                          </span>
                        </span>
                        <span>Rating: {rev.overall_rating}/5 ★</span>
                      </div>
                      <p className="text-ink italic">
                        &ldquo;{rev.review_text || '(No text body provided)'}&rdquo;
                      </p>
                      <div className="text-[11px] text-text-muted">
                        Current Status: <span className="font-mono">{rev.status}</span>
                      </div>
                    </div>
                  )}

                  {/* Moderation Actions Form */}
                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-sand-100">
                    <form
                      action={async (formData: FormData) => {
                        'use server';
                        await adminModerateReviewAction(formData);
                      }}
                    >
                      <input type="hidden" name="reviewId" value={item.review_id} />
                      <input type="hidden" name="action" value="restore" />
                      <input type="hidden" name="reason" value="Dismissed: Review is compliant" />
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1 border-sand-300"
                      >
                        Dismiss Report
                      </Button>
                    </form>

                    <form
                      action={async (formData: FormData) => {
                        'use server';
                        await adminModerateReviewAction(formData);
                      }}
                    >
                      <input type="hidden" name="reviewId" value={item.review_id} />
                      <input type="hidden" name="action" value="hide" />
                      <input type="hidden" name="reason" value={`Actioned: ${item.reason}`} />
                      <Button
                        type="submit"
                        size="sm"
                        className="text-xs gap-1 bg-amber-700 hover:bg-amber-800 text-white"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        Hide Review
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
