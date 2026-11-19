import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSync } from '@/context/SyncContext';
import { notificationService } from '@/services/notification.service';
import type { AppNotification } from '@/services/sync.service';
import { NoteEditorModal, NoteEditorTarget } from '@/components/notes/NoteEditorModal';
import { formatDate } from '@/utils/fileFormatters';

const ICONS: Record<string, string> = {
  'share.created': '🔗',
  'share.updated': '🔑',
  'share.revoked': '🚫',
  'file.created': '⬆️',
  'file.updated': '✏️',
  'file.deleted': '🗑️',
  'note.created': '📝',
  'note.deleted': '🗑️',
};

/** Alerts tab: notification history with read / unread state, delivered in real time. */
export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { unreadCount, setUnreadCount, subscribeNotifications, isOnline } = useSync();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<NoteEditorTarget | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const page = await notificationService.list({ unreadOnly });
      setItems(page.notifications);
      setHasMore(page.hasMore);
      setNextBefore(page.nextBefore);
      setUnreadCount(page.unreadCount);
    } catch (err: any) {
      setError(err?.network ? "You're offline. Notifications will load when you reconnect." : err?.message || 'Could not load notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [unreadOnly, setUnreadCount]);

  useEffect(() => {
    load();
  }, [load]);

  // New notifications arrive in real time
  useEffect(() => subscribeNotifications((n) => setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]))), [subscribeNotifications]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || !nextBefore) return;
    setLoadingMore(true);
    try {
      const page = await notificationService.list({ before: nextBefore, unreadOnly });
      setItems((prev) => [...prev, ...page.notifications]);
      setHasMore(page.hasMore);
      setNextBefore(page.nextBefore);
    } catch {}
    setLoadingMore(false);
  };

  const markRead = async (n: AppNotification, read = true) => {
    setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, read } : p)));
    try {
      setUnreadCount(await notificationService.markRead(n.id, read));
    } catch {
      load(true);
    }
  };

  const markAll = async () => {
    setItems((prev) => prev.map((p) => ({ ...p, read: true })));
    setUnreadCount(0);
    try {
      await notificationService.markAllRead();
    } catch {
      load(true);
    }
  };

  const open = (n: AppNotification) => {
    if (!n.read) markRead(n);
    if (n.type === 'share.revoked') return;
    if (n.resource_type === 'note' && n.resource_id && n.type !== 'note.deleted') {
      setEditor({ noteId: n.resource_id });
    } else if (n.type.startsWith('share.')) {
      router.push('/shared');
    } else if (n.resource_type === 'file' || n.resource_type === 'folder') {
      router.push('/explore');
    }
  };

  const remove = async (n: AppNotification) => {
    setItems((prev) => prev.filter((p) => p.id !== n.id));
    try {
      setUnreadCount(await notificationService.remove(n.id));
    } catch {
      load(true);
    }
  };

  const insetsStyle = Platform.select({
    android: { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.six },
    ios: { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.six },
    default: { paddingTop: Spacing.six + Spacing.four, paddingBottom: Spacing.six },
  });

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, insetsStyle]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#2563eb" />}
      >
        <View style={styles.inner}>
          <ThemedText type="subtitle" style={[styles.title, { color: theme.text }]}>Notifications</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}{!isOnline ? ' · offline' : ''}
          </ThemedText>

          <View style={styles.toolbar}>
            <View style={styles.filters}>
              {[false, true].map((u) => (
                <Pressable key={String(u)} onPress={() => setUnreadOnly(u)} style={[styles.chip, unreadOnly === u && styles.chipActive]}>
                  <ThemedText type="small" style={{ color: unreadOnly === u ? '#fff' : '#334155' }}>{u ? 'Unread' : 'All'}</ThemedText>
                </Pressable>
              ))}
            </View>
            {unreadCount > 0 && (
              <Pressable onPress={markAll}>
                <ThemedText type="smallBold" style={{ color: '#2563eb' }}>Mark all as read</ThemedText>
              </Pressable>
            )}
          </View>

          {error && <View style={styles.errorBox}><ThemedText type="small" style={{ color: '#991b1b' }}>{error}</ThemedText></View>}

          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2563eb" />
          ) : items.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText style={{ fontSize: 36 }}>🔔</ThemedText>
              <ThemedText type="smallBold" style={{ color: theme.text, marginTop: 8 }}>
                {unreadOnly ? 'No unread notifications' : 'No notifications yet'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: 4 }}>
                You'll be notified when someone shares with you, changes your access, or updates shared content.
              </ThemedText>
            </View>
          ) : (
            <View>
              {items.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => open(n)}
                  style={({ pressed }) => [styles.row, { backgroundColor: n.read ? 'transparent' : '#eff6ff' }, pressed && { opacity: 0.8 }]}
                >
                  <ThemedText style={{ fontSize: 20 }}>{ICONS[n.type] || '🔔'}</ThemedText>
                  <View style={{ flex: 1 }}>
                    <ThemedText type={n.read ? 'small' : 'smallBold'} style={{ color: theme.text }}>{n.title}</ThemedText>
                    {!!n.body && <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{n.body}</ThemedText>}
                    <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, marginTop: 2 }}>{formatDate(n.created_at)}</ThemedText>
                  </View>
                  <View style={styles.rowActions}>
                    {!n.read && <View style={styles.unreadDot} />}
                    <Pressable onPress={() => markRead(n, !n.read)} hitSlop={6}>
                      <ThemedText type="small" style={{ color: '#2563eb' }}>{n.read ? 'Unread' : 'Read'}</ThemedText>
                    </Pressable>
                    <Pressable onPress={() => remove(n)} hitSlop={6} accessibilityLabel="Delete notification">
                      <ThemedText type="small" style={{ color: '#94a3b8' }}>✕</ThemedText>
                    </Pressable>
                  </View>
                </Pressable>
              ))}
              {hasMore && (
                <Pressable onPress={loadMore} style={styles.more}>
                  {loadingMore ? <ActivityIndicator color="#2563eb" /> : <ThemedText type="smallBold" style={{ color: '#2563eb' }}>Load older</ThemedText>}
                </Pressable>
              )}
            </View>
          )}
        </View>
      </ScrollView>
      <NoteEditorModal target={editor} onClose={() => setEditor(null)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, flexGrow: 1 },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '700' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12, flexWrap: 'wrap', gap: 8 },
  filters: { flexDirection: 'row', gap: 6 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f8fafc' },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  errorBox: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginBottom: 8 },
  empty: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 20 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', borderRadius: 8, alignItems: 'flex-start' },
  rowActions: { alignItems: 'flex-end', gap: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563eb' },
  more: { alignItems: 'center', paddingVertical: 16 },
});
