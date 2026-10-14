import React from 'react';
import Link from 'next/link';
import { requireOnboardedUser } from '@/server/dal';
import { getUserNotifications } from '@/features/agreements/queries/notification.queries';
import { markNotificationsReadAction } from '@/features/agreements/actions/notification.actions';
import { Button } from '@/components/ui/button';
import {
  Bell,
  Check,
  Clock,
  ArrowLeft,
  ArrowRight,
  Handshake,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

export default async function NotificationsPage() {
  const { user } = await requireOnboardedUser();
  const notifications = await getUserNotifications(user.id, 100);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'trade_proposed':
      case 'proposal_received':
        return <Handshake className="h-5 w-5 text-pine-600" />;
      case 'trade_countered':
      case 'counter_received':
        return <RotateCcw className="h-5 w-5 text-pine-600" />;
      case 'trade_accepted':
      case 'agreement_accepted':
      case 'trade_completed':
      case 'agreement_completed':
        return <CheckCircle2 className="h-5 w-5 text-pine-600" />;
      case 'trade_disputed':
      case 'dispute_opened':
      case 'cancellation_requested':
        return <AlertTriangle className="h-5 w-5 text-amber-700" />;
      default:
        return <Bell className="h-5 w-5 text-pine-600" />;
    }
  };

  const getNotificationText = (type: string, payload: Record<string, unknown>) => {
    switch (type) {
      case 'trade_proposed':
      case 'proposal_received':
        return {
          title: 'New Trade Proposal Received',
          desc: 'A marketplace provider sent you a new barter trade proposal.',
        };
      case 'trade_countered':
      case 'counter_received':
        return {
          title: `Counter-Offer Received (Revision #${payload.revision_no || ''})`,
          desc: 'Your counterparty modified the barter terms and returned the turn to you.',
        };
      case 'trade_accepted':
      case 'agreement_accepted':
        return {
          title: 'Trade Agreement Accepted',
          desc: 'Trade contract terms are locked. Counterparty contact information is now revealed.',
        };
      case 'trade_delivered':
      case 'delivery_marked':
        return {
          title: 'Deliverables Marked Ready for Review',
          desc: 'Your trade partner has marked their services delivered.',
        };
      case 'trade_confirmed':
      case 'receipt_confirmed':
        return {
          title: 'Receipt of Deliverables Confirmed',
          desc: 'Your delivered services have been confirmed.',
        };
      case 'trade_completed':
      case 'agreement_completed':
        return {
          title: 'Trade Agreement Successfully Completed',
          desc: 'Both parties marked deliverables and confirmed receipt.',
        };
      case 'cancellation_requested':
        return {
          title: 'Mutual Cancellation Requested',
          desc: 'Your counterparty has requested to cancel this agreement.',
        };
      case 'trade_cancelled':
      case 'agreement_cancelled':
        return {
          title: 'Trade Agreement Cancelled',
          desc: 'Mutual cancellation has been confirmed.',
        };
      case 'trade_disputed':
      case 'dispute_opened':
        return {
          title: 'Dispute Logged on Trade',
          desc: 'A dispute statement was recorded in the immutable audit log.',
        };
      default:
        return {
          title: 'Trade Update',
          desc: 'Your barter agreement status has been updated.',
        };
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 text-start">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-pine-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        {unreadCount > 0 && (
          <form
            action={async () => {
              'use server';
              await markNotificationsReadAction();
            }}
          >
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 text-pine-700 hover:text-pine-900"
            >
              <Check className="h-3.5 w-3.5" />
              Mark all as read
            </Button>
          </form>
        )}
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
          <Bell className="h-6 w-6 text-pine-600" />
          Notifications
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Real-time trade room milestones, proposal counters, and milestone confirmations.
        </p>
      </div>

      {/* List */}
      <div className="rounded-card border border-border bg-surface shadow-elevation-1 divide-y divide-border overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Bell className="h-10 w-10 text-text-muted mx-auto" />
            <h3 className="text-base font-semibold text-ink">No notifications yet</h3>
            <p className="text-xs text-text-muted max-w-sm mx-auto">
              When other members propose trades, counter offers, or complete milestones, updates will appear here.
            </p>
          </div>
        ) : (
          notifications.map((n) => {
            const isUnread = !n.readAt;
            const text = getNotificationText(n.type, n.payload);
            const agreementId =
              (n.payload?.agreement_id as string) || (n.payload?.agreementId as string);

            return (
              <div
                key={n.id}
                className={`p-4 sm:p-5 flex items-start gap-4 transition-colors ${
                  isUnread ? 'bg-pine-50/20' : 'hover:bg-surface-sunken/40'
                }`}
              >
                <div className="p-2.5 rounded-chip bg-surface-sunken border border-border shrink-0 mt-0.5">
                  {getNotificationIcon(n.type)}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink flex items-center gap-2">
                      {isUnread && (
                        <span className="h-2 w-2 rounded-full bg-pine-600 shrink-0" />
                      )}
                      {text.title}
                    </span>
                    <span className="text-xs text-text-muted shrink-0 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(n.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">{text.desc}</p>
                </div>

                {agreementId && (
                  <Link
                    href={`/dashboard/trades/${agreementId}`}
                    className="shrink-0 p-2 text-text-muted hover:text-pine-600 transition-colors"
                    aria-label="View trade room"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
