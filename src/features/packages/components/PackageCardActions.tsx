'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  publishServicePackageAction,
  setPackageStatusAction,
  deleteDraftPackageAction,
} from '../actions/package.actions';
import { CheckCircle2, PauseCircle, Archive, Trash2, Edit3, Loader2, Play, Sparkles, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { ErrorAlert } from '@/components/shared/ErrorAlert';

interface PackageCardActionsProps {
  packageId: string;
  status: 'draft' | 'published' | 'paused' | 'archived' | 'removed';
}

export function PackageCardActions({ packageId, status }: PackageCardActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const handlePublish = () => {
    setActionError(null);
    startTransition(async () => {
      const res = await publishServicePackageAction(packageId);
      if (res.error) {
        setActionError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handlePause = () => {
    setActionError(null);
    startTransition(async () => {
      const res = await setPackageStatusAction(packageId, 'paused');
      if (res.error) {
        setActionError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleArchive = () => {
    if (!confirm('Are you sure you want to archive this package? Archived packages cannot be directly re-published.')) {
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const res = await setPackageStatusAction(packageId, 'archived');
      if (res.error) {
        setActionError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleDeleteDraft = () => {
    if (!confirm('Are you sure you want to delete this draft package?')) {
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const res = await deleteDraftPackageAction(packageId);
      if (res.error) {
        setActionError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-2">
      {actionError && (
        <ErrorAlert
          title="Action Notice"
          message={actionError}
          className="text-xs py-2"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {status !== 'archived' && (
          <Link href={`/dashboard/packages/${packageId}/edit`}>
            <Button variant="outline" size="sm" className="text-xs h-8">
              <Edit3 className="me-1 h-3.5 w-3.5" />
              Edit
            </Button>
          </Link>
        )}

        {status === 'draft' && (
          <>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isPending}
              onClick={handlePublish}
              className="text-xs h-8"
            >
              {isPending ? (
                <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="me-1 h-3.5 w-3.5" />
              )}
              Publish
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={handleDeleteDraft}
              className="text-xs h-8 text-amber-800 hover:bg-amber-50"
            >
              <Trash2 className="me-1 h-3.5 w-3.5" />
              Delete Draft
            </Button>
          </>
        )}

        {status === 'published' && (
          <>
            <Link href={`/dashboard/promote/${packageId}`}>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8 text-amber-800 border-amber-300 hover:bg-amber-50"
              >
                <Sparkles className="me-1 h-3.5 w-3.5 text-amber-600" />
                Promote
              </Button>
            </Link>
            <Link href={`/dashboard/packages/${packageId}/analytics`}>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8 text-pine-800 border-pine-200 hover:bg-pine-50"
              >
                <BarChart3 className="me-1 h-3.5 w-3.5 text-pine-600" />
                Analytics
              </Button>
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handlePause}
              className="text-xs h-8 text-amber-800 border-amber-300 hover:bg-amber-50"
            >
              <PauseCircle className="me-1 h-3.5 w-3.5" />
              Pause
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={handleArchive}
              className="text-xs h-8 text-text-muted"
            >
              <Archive className="me-1 h-3.5 w-3.5" />
              Archive
            </Button>
          </>
        )}

        {status === 'paused' && (
          <>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isPending}
              onClick={handlePublish}
              className="text-xs h-8"
            >
              <Play className="me-1 h-3.5 w-3.5" />
              Resume (Publish)
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={handleArchive}
              className="text-xs h-8 text-text-muted"
            >
              <Archive className="me-1 h-3.5 w-3.5" />
              Archive
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
