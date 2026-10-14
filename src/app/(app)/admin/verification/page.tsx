import React from 'react';
import { requireVerifierOrAdmin } from '@/server/dal';
import { AdminReviewCard } from '@/features/verification/components/AdminReviewCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CheckCircle2, ShieldCheck, Clock, History } from 'lucide-react';

export default async function AdminVerificationPage() {
  const { supabase } = await requireVerifierOrAdmin();

  // 1. Fetch pending links in FIFO order (oldest first)
  const { data: pendingLinks, error: linksError } = await supabase
    .from('portfolio_links')
    .select(`
      id,
      user_id,
      provider_key,
      url,
      canonical_url,
      handle,
      challenge_code,
      created_at,
      evidence_asset_id,
      profiles:user_id (
        id,
        display_name,
        business_name,
        avatar_url
      ),
      media_assets:evidence_asset_id (
        id,
        bucket,
        path,
        blur_data_url
      )
    `)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true });

  // 2. Fetch recent verification audit log entries
  const { data: auditLog } = await supabase
    .from('verification_audit_log')
    .select(`
      id,
      action,
      from_status,
      to_status,
      reason,
      note,
      created_at,
      actor:actor_id (
        display_name,
        business_name
      )
    `)
    .order('created_at', { ascending: false })
    .limit(15);

  // Generate signed URLs for private evidence screenshots
  const linksWithSignedUrls = await Promise.all(
    (pendingLinks || []).map(async (link) => {
      let evidenceSignedUrl: string | null = null;
      // Handle array or object from Supabase join
      const asset = Array.isArray(link.media_assets)
        ? link.media_assets[0]
        : link.media_assets;

      if (asset?.bucket && asset?.path) {
        const { data: signedData } = await supabase.storage
          .from(asset.bucket)
          .createSignedUrl(asset.path, 3600); // 1 hour access
        evidenceSignedUrl = signedData?.signedUrl || null;
      }

      const profile = Array.isArray(link.profiles) ? link.profiles[0] : link.profiles;

      return {
        ...link,
        profiles: profile,
        evidence_asset: asset,
        evidenceSignedUrl,
      };
    })
  );

  // SLA stats
  const now = Date.now();
  let withinSla = 0;
  let approachingSla = 0;
  let overdueSla = 0;

  linksWithSignedUrls.forEach((item) => {
    const ageHours = (now - new Date(item.created_at).getTime()) / (1000 * 60 * 60);
    if (ageHours > 48) overdueSla++;
    else if (ageHours > 24) approachingSla++;
    else withinSla++;
  });

  return (
    <div className="space-y-8">
      {/* SLA Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-sand-200">
          <CardContent className="pt-6">
            <div className="text-xs font-semibold text-text-muted uppercase">Pending in Queue</div>
            <div className="text-2xl font-bold text-ink mt-1">
              {linksWithSignedUrls.length}
            </div>
          </CardContent>
        </Card>

        <Card className="border-pine-200 bg-pine-50/40">
          <CardContent className="pt-6">
            <div className="text-xs font-semibold text-pine-800 uppercase flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Within SLA (&lt; 24h)
            </div>
            <div className="text-2xl font-bold text-pine-900 mt-1">{withinSla}</div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="pt-6">
            <div className="text-xs font-semibold text-amber-900 uppercase flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Approaching SLA (24-48h)
            </div>
            <div className="text-2xl font-bold text-amber-950 mt-1">{approachingSla}</div>
          </CardContent>
        </Card>

        <Card className="border-amber-300 bg-amber-100/50">
          <CardContent className="pt-6">
            <div className="text-xs font-semibold text-amber-950 uppercase flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Overdue SLA (&gt; 48h)
            </div>
            <div className="text-2xl font-bold text-amber-950 mt-1">{overdueSla}</div>
          </CardContent>
        </Card>
      </div>

      {/* Review Queue */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-pine-700" />
            Verification Review Queue
          </h2>
          <span className="text-xs text-text-muted">FIFO Ordering (Oldest submissions first)</span>
        </div>

        {linksWithSignedUrls.length === 0 ? (
          <div className="rounded-xl border border-dashed border-sand-300 p-12 text-center bg-white">
            <CheckCircle2 className="w-10 h-10 text-pine-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-ink">Queue is Clear</h3>
            <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
              All external portfolio link submissions have been processed. Service Level Agreement is
              100% up to date.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {linksWithSignedUrls.map((link) => (
              <AdminReviewCard key={link.id} link={link} />
            ))}
          </div>
        )}
      </div>

      {/* Recent Verification Audit Trail */}
      <div className="space-y-4 pt-4 border-t border-sand-200">
        <h2 className="text-base font-bold text-ink flex items-center gap-2">
          <History className="w-4 h-4 text-pine-700" />
          Recent Verification Audit Trail (Append-Only)
        </h2>

        <div className="overflow-x-auto rounded-lg border border-sand-200 bg-white">
          <table className="min-w-full divide-y divide-sand-200 text-xs">
            <thead className="bg-sand-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Timestamp</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Action</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Transition</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Reason / Note</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Reviewed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {auditLog && auditLog.length > 0 ? (
                auditLog.map((log) => {
                  const actor = Array.isArray(log.actor) ? log.actor[0] : log.actor;
                  return (
                    <tr key={log.id} className="hover:bg-sand-50/50">
                      <td className="px-4 py-2.5 text-text-muted whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 font-semibold capitalize text-ink">
                        {log.action}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11px]">
                        <span className="text-text-muted">{log.from_status || 'none'}</span>
                        <span className="mx-1 text-text-muted">→</span>
                        <span className="text-pine-800 font-bold">{log.to_status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary max-w-xs truncate">
                        {log.reason ? `${log.reason}: ` : ''}
                        {log.note || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-ink whitespace-nowrap">
                        {actor?.business_name || actor?.display_name || 'System'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-text-muted italic">
                    No verification audit actions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
