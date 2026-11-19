import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSyncEvents } from '@/context/SyncContext';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { Note, NoteKind, notesService } from '@/services/notes.service';
import { NoteEditorModal, NoteEditorTarget } from '@/components/notes/NoteEditorModal';
import { formatDate } from '@/utils/fileFormatters';
import { folderService } from '@/services/folder.service';

type Filter = 'all' | NoteKind;

/** Notes & documents tab: all of your notes, searchable, synced across devices. */
export default function NotesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folderNames, setFolderNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editor, setEditor] = useState<NoteEditorTarget | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const res = await notesService.list({ q: query.trim() || undefined, kind: filter === 'all' ? undefined : filter });
      setNotes(res.notes);
      setFromCache(res.fromCache);
      if (!res.fromCache) {
        folderService.getAllFolders()
          .then((all) => setFolderNames(Object.fromEntries(all.map((f) => [String(f.id), f.name]))))
          .catch(() => {});
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load notes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, filter]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(), query ? 300 : 0);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [load, query]);

  // Refresh when notes change on any device (or after a full resync)
  useSyncEvents((event) => {
    if (event.type === 'reset' || ('resourceType' in event && event.resourceType === 'note')) load(true);
  });

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
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <ThemedText type="subtitle" style={[styles.title, { color: theme.text }]}>Notes & documents</ThemedText>
              <SyncStatusBadge />
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.primaryBtn} onPress={() => setEditor({ folderId: null, kind: 'note' })}>
              <ThemedText type="smallBold" style={{ color: '#fff' }}>+ New note</ThemedText>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => setEditor({ folderId: null, kind: 'document' })}>
              <ThemedText type="smallBold" style={{ color: '#1d4ed8' }}>+ New document</ThemedText>
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes…"
            placeholderTextColor="#94a3b8"
            style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            autoCapitalize="none"
          />
          <View style={styles.filters}>
            {(['all', 'note', 'document'] as Filter[]).map((f) => (
              <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipActive]}>
                <ThemedText type="small" style={{ color: filter === f ? '#fff' : '#334155' }}>
                  {f === 'all' ? 'All' : f === 'note' ? 'Notes' : 'Documents'}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          {fromCache && (
            <View style={styles.offline}><ThemedText type="small" style={{ color: '#334155' }}>You're offline — showing notes saved on this device.</ThemedText></View>
          )}
          {error && (
            <View style={styles.errorBox}>
              <ThemedText type="small" style={{ color: '#991b1b', flex: 1 }}>{error}</ThemedText>
              <Pressable onPress={() => load(true)}><ThemedText type="smallBold" style={{ color: '#b91c1c' }}>Retry</ThemedText></Pressable>
            </View>
          )}

          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2563eb" />
          ) : notes.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText style={{ fontSize: 36 }}>📝</ThemedText>
              <ThemedText type="smallBold" style={{ color: theme.text, marginTop: 8 }}>
                {query ? 'No notes match your search' : 'No notes yet'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: 4 }}>
                {query ? 'Try a different word.' : 'Create a note or a document. Notes inside folders appear in the Files tab too.'}
              </ThemedText>
            </View>
          ) : (
            <View style={styles.grid}>
              {notes.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => setEditor({ noteId: n.id })}
                  style={({ pressed }) => [styles.card, { backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.8 }]}
                >
                  <View style={styles.cardTop}>
                    <ThemedText style={{ fontSize: 18 }}>{n.kind === 'document' ? '📄' : '📝'}</ThemedText>
                    <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.text, flex: 1 }}>{n.title}</ThemedText>
                    {n.pending && <ThemedText type="small" style={styles.pending}>Waiting to sync</ThemedText>}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={3} style={{ marginTop: 6 }}>
                    {n.preview || 'Empty'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 8, fontSize: 11 }}>
                    {n.folder_id ? `📁 ${folderNames[n.folder_id] || 'Folder'} • ` : ''}{formatDate(n.updated_at)}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <NoteEditorModal
        target={editor}
        onClose={(changed) => {
          setEditor(null);
          if (changed) load(true);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, flexGrow: 1 },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginVertical: 8 },
  primaryBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryBtn: { borderWidth: 1, borderColor: '#93c5fd', backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  search: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginTop: 4 },
  filters: { flexDirection: 'row', gap: 6, marginVertical: 10 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f8fafc' },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  offline: { backgroundColor: '#f1f5f9', borderRadius: 8, padding: 10, marginBottom: 8 },
  errorBox: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginBottom: 8, flexDirection: 'row', gap: 8, alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexGrow: 1, flexBasis: 260, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pending: { fontSize: 10, color: '#92400e', backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
