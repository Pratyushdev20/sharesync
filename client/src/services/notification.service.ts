import { apiRequest } from './api';
import type { AppNotification } from './sync.service';

export interface NotificationPage {
  notifications: AppNotification[];
  hasMore: boolean;
  nextBefore: string | null;
  unreadCount: number;
}

export const notificationService = {
  async list({ before, unreadOnly, limit = 30 }: { before?: string | null; unreadOnly?: boolean; limit?: number } = {}): Promise<NotificationPage> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (before) q.set('before', before);
    if (unreadOnly) q.set('unread', 'true');
    const res = await apiRequest<NotificationPage>(`/api/notifications?${q.toString()}`);
    return res.data as NotificationPage;
  },
  async unreadCount(): Promise<number> {
    const res = await apiRequest<{ unreadCount: number }>('/api/notifications/unread-count');
    return res.data?.unreadCount ?? 0;
  },
  async markRead(id: string, read = true): Promise<number> {
    const res = await apiRequest<{ unreadCount: number }>(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      body: JSON.stringify({ read }),
    });
    return res.data?.unreadCount ?? 0;
  },
  async markAllRead(): Promise<void> {
    await apiRequest('/api/notifications/read-all', { method: 'POST', body: '{}' });
  },
  async remove(id: string): Promise<number> {
    const res = await apiRequest<{ unreadCount: number }>(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return res.data?.unreadCount ?? 0;
  },
};
