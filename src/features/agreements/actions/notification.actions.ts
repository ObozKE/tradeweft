'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface NotificationActionResult {
  success?: boolean;
  error?: string;
}

/**
 * Marks notifications as read. If no IDs are provided, marks ALL unread notifications for user.
 */
export async function markNotificationsReadAction(
  notificationIds?: string[]
): Promise<NotificationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { error } = await supabase.rpc('mark_notifications_read', {
    p_notification_ids: notificationIds && notificationIds.length > 0 ? notificationIds : null,
  });

  if (error) {
    return { error: 'Failed to mark notifications as read.' };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/trades');
  revalidatePath('/dashboard/notifications');
  return { success: true };
}
