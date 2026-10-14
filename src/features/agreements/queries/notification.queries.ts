import { createClient } from '@/lib/supabase/server';
import type { NotificationItem } from '../types/agreement.types';

/**
 * Returns the unread notification count for the authenticated user.
 */
export async function getUnreadNotificationsCount(userId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error || typeof count !== 'number') {
    return 0;
  }

  return count;
}

/**
 * Returns a list of notifications for the user ordered by creation time descending.
 */
export async function getUserNotifications(
  userId: string,
  limit: number = 50
): Promise<NotificationItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, payload, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return (data as any[]).map((n) => ({
    id: n.id,
    type: n.type,
    payload: (n.payload as Record<string, unknown>) || {},
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
}
