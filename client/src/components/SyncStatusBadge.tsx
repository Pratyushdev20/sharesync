import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useSync } from '@/context/SyncContext';

const LABELS: Record<string, { text: string; color: string }> = {
  synced: { text: 'Synced', color: '#16a34a' },
  syncing: { text: 'Syncing…', color: '#2563eb' },
  connecting: { text: 'Connecting…', color: '#d97706' },
  offline: { text: 'Offline', color: '#64748b' },
  error: { text: 'Sync problem', color: '#dc2626' },
};

function timeAgo(date: Date | null): string {
  if (!date) return '';
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

/** Small "● Synced · just now" indicator. Tap to sync now. */
export function SyncStatusBadge({ compact = false }: { compact?: boolean }) {
  const { status, lastSyncedAt, pendingChanges, syncNow, lastError } = useSync();
  const info = LABELS[status] || LABELS.connecting;
  const pending = pendingChanges > 0 ? ` · ${pendingChanges} waiting to sync` : '';

  return (
    <Pressable
      onPress={() => syncNow().catch(() => {})}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${info.text}${pending}. Tap to sync now.`}
    >
      <View style={[styles.dot, { backgroundColor: info.color }]} />
      <ThemedText type="small" style={{ color: info.color, fontSize: 12 }}>
        {info.text}
        {!compact && status === 'synced' && lastSyncedAt ? ` · ${timeAgo(lastSyncedAt)}` : ''}
        {pending}
        {!compact && status === 'error' && lastError ? ` · ${lastError}` : ''}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
