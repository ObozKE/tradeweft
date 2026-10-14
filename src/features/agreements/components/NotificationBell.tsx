'use client';

import React, { useState, useTransition, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Check, Clock, ExternalLink } from 'lucide-react';
import { markNotificationsReadAction } from '../actions/notification.actions';
import type { NotificationItem } from '../types/agreement.types';

interface NotificationBellProps {
  initialUnreadCount: number;
  recentNotifications: NotificationItem[];
}

export function NotificationBell({
  initialUnreadCount,
  recentNotifications,
}: NotificationBellProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markNotificationsReadAction();
      setUnreadCount(0);
      router.refresh();
    });
  };

  const formatNotificationMessage = (n: NotificationItem): { title: string; subtitle: string; link?: string } => {
    const p = n.payload || {};
    const agreementId = (p.agreement_id as string) || (p.agreementId as string);
    const link = agreementId ? `/dashboard/trades/${agreementId}` : '/dashboard/trades';

    switch (n.type) {
      case 'trade_proposed':
      case 'proposal_received':
        return {
          title: 'New Trade Proposal',
          subtitle: 'A provider proposed a barter trade agreement with you.',
          link,
        };
      case 'trade_countered':
      case 'counter_received':
        return {
          title: 'Counter-Offer Received',
          subtitle: `A new revision (#${p.revision_no || ''}) was proposed for your review.`,
          link,
        };
      case 'trade_accepted':
      case 'agreement_accepted':
        return {
          title: 'Trade Agreement Accepted!',
          subtitle: 'Terms are locked and contact details have been revealed.',
          link,
        };
      case 'trade_delivered':
      case 'delivery_marked':
        return {
          title: 'Deliverables Marked Ready',
          subtitle: 'Counterparty marked their services delivered. Please review.',
          link,
        };
      case 'trade_confirmed':
      case 'receipt_confirmed':
        return {
          title: 'Receipt Confirmed',
          subtitle: 'Receipt was confirmed for delivered services.',
          link,
        };
      case 'trade_completed':
      case 'agreement_completed':
        return {
          title: 'Trade Completed! 🎉',
          subtitle: 'All milestones confirmed on both sides.',
          link,
        };
      case 'cancellation_requested':
        return {
          title: 'Mutual Cancellation Requested',
          subtitle: 'Your counterparty requested to mutually cancel the trade.',
          link,
        };
      case 'trade_cancelled':
      case 'agreement_cancelled':
        return {
          title: 'Trade Cancelled',
          subtitle: 'Mutual cancellation was accepted.',
          link,
        };
      case 'trade_disputed':
      case 'dispute_opened':
        return {
          title: 'Dispute Filed',
          subtitle: 'The agreement status was paused for mediation.',
          link,
        };
      default:
        return {
          title: 'Trade Update',
          subtitle: 'Your barter agreement status has changed.',
          link,
        };
    }
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-button text-text-secondary hover:text-ink hover:bg-surface-sunken transition-colors focus:outline-none focus:ring-2 focus:ring-pine-500"
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 end-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-pine-600 px-1 text-[10px] font-bold text-white leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute end-0 mt-2 w-80 sm:w-96 rounded-card border border-border bg-surface shadow-elevation-3 z-50 overflow-hidden text-start animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-surface-sunken/40">
            <span className="text-sm font-bold text-ink">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="text-xs text-pine-600 hover:text-pine-800 font-medium transition-colors flex items-center gap-1"
              >
                <Check className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {recentNotifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-text-muted">
                No notifications yet.
              </div>
            ) : (
              recentNotifications.map((n) => {
                const info = formatNotificationMessage(n);
                const isUnread = !n.readAt;

                return (
                  <Link
                    key={n.id}
                    href={info.link || '/dashboard/trades'}
                    onClick={() => setIsOpen(false)}
                    className={`block p-3.5 hover:bg-surface-sunken transition-colors ${
                      isUnread ? 'bg-pine-50/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                        {isUnread && (
                          <span className="h-1.5 w-1.5 rounded-full bg-pine-600 shrink-0" />
                        )}
                        {info.title}
                      </span>
                      <span className="text-[10px] text-text-muted shrink-0 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(n.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                      {info.subtitle}
                    </p>
                  </Link>
                );
              })
            )}
          </div>

          <div className="border-t border-border p-2.5 text-center bg-surface-sunken/20">
            <Link
              href="/dashboard/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-pine-700 hover:text-pine-900 transition-colors inline-flex items-center gap-1"
            >
              <span>View all notifications</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
