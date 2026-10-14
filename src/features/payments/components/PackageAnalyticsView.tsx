'use client';

import React from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  Eye,
  MousePointerClick,
  FileText,
  Download,
  Lock,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DailyStatItem {
  date: string;
  impressions: number;
  views: number;
  proposal_starts: number;
}

interface PackageAnalyticsViewProps {
  packageId: string;
  packageTitle: string;
  analyticsLevel: 'basic' | 'pro' | 'enterprise';
  stats: DailyStatItem[];
  canExportCsv: boolean;
}

export function PackageAnalyticsView({
  packageId,
  packageTitle,
  analyticsLevel,
  stats,
  canExportCsv,
}: PackageAnalyticsViewProps) {
  // Aggregate totals
  const totalImpressions = stats.reduce((acc, s) => acc + s.impressions, 0);
  const totalViews = stats.reduce((acc, s) => acc + s.views, 0);
  const totalProposals = stats.reduce((acc, s) => acc + s.proposal_starts, 0);
  const avgCtr =
    totalImpressions > 0
      ? ((totalViews / totalImpressions) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-8">
      {/* Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between text-text-muted text-xs mb-2">
            <span>Impressions</span>
            <Eye className="h-4 w-4 text-pine-600" />
          </div>
          <div className="text-2xl font-extrabold text-ink">{totalImpressions}</div>
          <div className="text-[11px] text-text-muted mt-1">Search &amp; browse appearances</div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between text-text-muted text-xs mb-2">
            <span>Page Views</span>
            <MousePointerClick className="h-4 w-4 text-pine-600" />
          </div>
          <div className="text-2xl font-extrabold text-ink">{totalViews}</div>
          <div className="text-[11px] text-text-muted mt-1">Unique listing opens</div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between text-text-muted text-xs mb-2">
            <span>Click Rate (CTR)</span>
            <TrendingUp className="h-4 w-4 text-pine-600" />
          </div>
          <div className="text-2xl font-extrabold text-ink">{avgCtr}%</div>
          <div className="text-[11px] text-text-muted mt-1">View conversion rate</div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between text-text-muted text-xs mb-2">
            <span>Proposals Started</span>
            <FileText className="h-4 w-4 text-pine-600" />
          </div>
          <div className="text-2xl font-extrabold text-ink">{totalProposals}</div>
          <div className="text-[11px] text-text-muted mt-1">Trade initiation clicks</div>
        </div>
      </div>

      {/* Tiered Data Presentation */}
      {analyticsLevel === 'basic' ? (
        /* Basic Plan Tier: 30-Day Totals Only */
        <div className="rounded-2xl border border-border bg-surface p-8 text-center space-y-4 shadow-xs">
          <div className="mx-auto h-12 w-12 rounded-full bg-sand-100 flex items-center justify-center text-ink">
            <Lock className="h-5 w-5 text-pine-700" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-base font-bold text-ink">
              Daily Trend Breakdown Locked
            </h3>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              You are currently viewing 30-day aggregate totals on Boost Basic. Upgrade to Boost
              Pro or Enterprise to unlock 90-day daily trend tables, funnel metrics, and CSV exports.
            </p>
          </div>
          <div className="pt-2">
            <Link href="/dashboard/billing">
              <Button size="sm" className="bg-pine-600 hover:bg-pine-700 text-white text-xs gap-1.5 shadow-xs">
                <Sparkles className="h-3.5 w-3.5" />
                Upgrade to Boost Pro
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        /* Pro & Enterprise Tier: Daily Breakdown Table */
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-base font-bold text-ink">Daily Performance Trends</h3>
              <p className="text-xs text-text-secondary">
                Daily breakdown of searches, page views, and trade conversions.
              </p>
            </div>

            {canExportCsv && (
              <a
                href={`/api/analytics/export/${packageId}`}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface text-xs font-semibold text-ink hover:bg-sand-50 transition-colors shadow-xs"
              >
                <Download className="h-3.5 w-3.5 text-pine-600" />
                Export CSV
              </a>
            )}
          </div>

          {stats.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">
              No activity recorded for this period yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-border text-text-muted text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 text-start font-semibold">Date</th>
                    <th className="py-2.5 text-start font-semibold">Impressions</th>
                    <th className="py-2.5 text-start font-semibold">Views</th>
                    <th className="py-2.5 text-start font-semibold">Proposal Starts</th>
                    <th className="py-2.5 text-end font-semibold">Conversion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.map((row) => {
                    const ctr =
                      row.impressions > 0
                        ? ((row.views / row.impressions) * 100).toFixed(1)
                        : '0.0';
                    return (
                      <tr key={row.date} className="hover:bg-surface-raised/50 transition-colors">
                        <td className="py-3 text-ink font-medium">
                          {new Date(row.date).toLocaleDateString('en-KE', {
                            dateStyle: 'medium',
                          })}
                        </td>
                        <td className="py-3 text-text-secondary">{row.impressions}</td>
                        <td className="py-3 text-text-secondary font-semibold">{row.views}</td>
                        <td className="py-3 text-text-secondary">{row.proposal_starts}</td>
                        <td className="py-3 text-end font-mono text-pine-800 font-bold">
                          {ctr}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
