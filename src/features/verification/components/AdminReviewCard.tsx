'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ExternalLink, CheckCircle2, XCircle, ShieldAlert, Clock, Image as ImageIcon } from 'lucide-react';
import { adminReviewLinkAction } from '../actions/admin.actions';
import { PLATFORM_REGISTRY } from '../providers/registry';
import type { PlatformKey } from '../types/verification.types';

export interface AdminReviewCardProps {
  link: {
    id: string;
    user_id: string;
    provider_key: string;
    url: string;
    canonical_url: string;
    handle: string | null;
    challenge_code: string | null;
    created_at: string;
    profiles?: {
      id: string;
      display_name: string | null;
      business_name: string | null;
      avatar_url: string | null;
    } | null;
    evidence_asset?: {
      id: string;
      bucket: string;
      path: string;
      blur_data_url: string | null;
    } | null;
    evidenceSignedUrl?: string | null;
  };
}

export function AdminReviewCard({ link }: AdminReviewCardProps) {
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState<string>('code_not_found');
  const [rejectNote, setRejectNote] = useState<string>('');
  const [isPending, setIsPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const platform = PLATFORM_REGISTRY[link.provider_key as PlatformKey] || {
    label: link.provider_key,
    method: 'manual',
  };

  // SLA calculation
  const createdDate = new Date(link.created_at);
  const ageHours = Math.max(0, Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60)));

  let slaBadge = (
    <Badge variant="secondary" className="gap-1 border-pine-200 text-pine-800">
      <Clock className="w-3 h-3" /> Within SLA ({ageHours}h)
    </Badge>
  );

  if (ageHours > 48) {
    slaBadge = (
      <Badge variant="warning" className="gap-1 bg-amber-200 text-amber-950 font-bold border-amber-300">
        <ShieldAlert className="w-3 h-3" /> Overdue SLA ({ageHours}h)
      </Badge>
    );
  } else if (ageHours > 24) {
    slaBadge = (
      <Badge variant="warning" className="gap-1 border-amber-200">
        <Clock className="w-3 h-3" /> Approaching SLA ({ageHours}h)
      </Badge>
    );
  }

  const handleApprove = async () => {
    setIsPending(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.set('linkId', link.id);
      formData.set('action', 'approve');
      const res = await adminReviewLinkAction(null, formData);
      if (res?.error) setErrorMsg(res.error);
    } catch {
      setErrorMsg('Failed to approve link.');
    } finally {
      setIsPending(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.set('linkId', link.id);
      formData.set('action', 'reject');
      formData.set('rejectReason', rejectReason);
      formData.set('rejectNote', rejectNote);
      const res = await adminReviewLinkAction(null, formData);
      if (res?.error) setErrorMsg(res.error);
      else setIsRejecting(false);
    } catch {
      setErrorMsg('Failed to reject link.');
    } finally {
      setIsPending(false);
    }
  };

  const providerName =
    link.profiles?.business_name || link.profiles?.display_name || 'Anonymous Provider';

  return (
    <Card className="border border-sand-200 shadow-sm transition hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-pine-700">
              {platform.label}
            </span>
            {slaBadge}
          </div>
          <CardTitle className="text-base font-bold text-ink">
            <Link
              href={`/providers/${link.user_id}/profile`}
              className="hover:underline hover:text-pine-800"
            >
              {providerName}
            </Link>
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        <div className="rounded-md bg-sand-50 p-3 space-y-2 border border-sand-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Target URL:</span>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-pine-700 hover:underline"
            >
              {link.url}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {link.handle && (
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-text-muted">Expected Handle:</span>
              <span className="font-mono text-ink">@{link.handle}</span>
            </div>
          )}

          {link.challenge_code && (
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-text-muted">Challenge Code:</span>
              <span className="font-mono font-bold text-pine-900 bg-pine-100 px-2 py-0.5 rounded">
                {link.challenge_code}
              </span>
            </div>
          )}
        </div>

        {/* Sandboxed Evidence Viewer */}
        {link.evidenceSignedUrl ? (
          <div className="space-y-2">
            <span className="text-xs font-medium text-text-muted flex items-center gap-1">
              <ImageIcon className="w-3 h-3" /> Screenshot Evidence:
            </span>
            <div className="relative rounded border border-sand-200 bg-sand-100 p-2 overflow-hidden max-h-80 flex items-center justify-center">
              <img
                src={link.evidenceSignedUrl}
                alt="Verification Screenshot Evidence"
                className="max-h-72 w-auto object-contain rounded"
              />
            </div>
          </div>
        ) : (
          <div className="rounded bg-sand-50 p-3 text-xs text-text-muted italic border border-sand-100">
            No screenshot attached. Verifier should inspect the public bio/post directly via the URL.
          </div>
        )}

        {errorMsg && (
          <div className="rounded bg-amber-50 p-2 text-xs text-amber-900 border border-amber-200">
            {errorMsg}
          </div>
        )}

        {/* Action Controls */}
        {!isRejecting ? (
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setIsRejecting(true)}
              className="gap-1.5 text-amber-800 border-amber-300 hover:bg-amber-50"
            >
              <XCircle className="w-4 h-4" /> Reject
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={handleApprove}
              className="gap-1.5 bg-pine-600 hover:bg-pine-700 text-white"
            >
              <CheckCircle2 className="w-4 h-4" /> Approve
            </Button>
          </div>
        ) : (
          <form onSubmit={handleReject} className="space-y-3 pt-2 border-t border-sand-200">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">
                Rejection Reason (Required)
              </label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded border border-sand-300 bg-white px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-pine-500"
              >
                <option value="code_not_found">Challenge code not found in bio or post</option>
                <option value="handle_mismatch">Handle does not match profile</option>
                <option value="unclear_screenshot">Screenshot is unreadable or incomplete</option>
                <option value="suspicious_account">Account appears dormant, newly created, or suspicious</option>
                <option value="other">Other issue (specified in note)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">
                Feedback Note for Provider (Max 300 chars)
              </label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Explain what the provider should update..."
                className="w-full rounded border border-sand-300 bg-white p-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-pine-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => setIsRejecting(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                className="bg-amber-700 hover:bg-amber-800 text-white text-xs"
              >
                Confirm Rejection
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
