import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useSync, useSyncEvents } from '@/context/SyncContext';
import { getConflicts, Note, NoteKind, notesService } from '@/services/notes.service';
import { ApiError } from '@/services/api';
import { formatDate } from '@/utils/fileFormatters';

export interface NoteEditorTarget {
  /** Existing note id; omit to create a new note */
  noteId?: string;
  /** Folder for a new note (null = workspace root) */
  folderId?: string | null;
  kind?: NoteKind;
}

interface Props {
  target: NoteEditorTarget | null;
  onClose: (changed: boolean) => void;
}

/**
 * Full-screen note / document editor with:
 * - read-only mode for viewers
 * - offline saving (queued) and "waiting to sync" state
 * - conflict resolution when the note changed on another device
 * - live updates from other devices
 */
export function NoteEditorModal({ target, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { setPendingChanges } = useSync();

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<NoteKind>('note');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [changed, setChanged] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [conflict, setConflict] = useState<Note | null>(null);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [deletedRemotely, setDeletedRemotely] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fromCache, setFromCache] = useState(false);

  const isNew = !note;
  const canEdit = !note || note.access !== 'viewer';

  const applyNote = (n: Note) => {
    setNote(n);
    setTitle(n.title);
    setContent(n.content ?? '');
    setKind(n.kind);
    setDirty(false);
  };

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await notesService.get(id);
      applyNote(res.note);
      setFromCache(res.fromCache);
      // A conflict detected while syncing offline edits?
      const stored = (await getConflicts()).find((c) => c.noteId === id);
      if (stored) {
        setTitle(stored.local.title);
        setContent(stored.local.content);
        setNote(stored.server);
        setConflict(stored.server);
        setDirty(true);
      }
    } catch (err: any) {
      setMessage({ type: 'err', text: err?.message || 'Could not open the note.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!target) return;
    setNote(null);
    setConflict(null);
    setRemoteChanged(false);
    setDeletedRemotely(false);
    setConfirmDelete(false);
    setChanged(false);
    setMessage(null);
    setFromCache(false);
    if (target.noteId) {
      load(target.noteId);
    } else {
      setTitle('');
      setContent('');
      setKind(target.kind || 'note');
      setDirty(false);
    }
  }, [target, load]);

  // Live updates from other devices
  useSyncEvents((event) => {
    if (!note || !('resourceType' in event) || event.resourceType !== 'note' || event.resourceId !== note.id) return;
    if (event.type === 'note.deleted') {
      setDeletedRemotely(true);
      return;
    }
    if (event.type === 'note.updated' && Number(event.payload?.version) > note.version) {
      if (!dirty) load(note.id);
      else setRemoteChanged(true);
    }
  });

  if (!target) return null;

  const close = () => onClose(changed);

  const save = async (base?: Note) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setMessage({ type: 'err', text: 'Please give it a title.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      let saved: Note;
      if (isNew) {
        saved = await notesService.create({ title: cleanTitle, content, kind, folder_id: target.folderId ?? null });
      } else {
        saved = await notesService.save(base || note!, { title: cleanTitle, content, kind });
      }
      if (conflict && note) await notesService.resolveConflict(note.id);
      applyNote({ ...saved, content: saved.content ?? content });
      setConflict(null);
      setRemoteChanged(false);
      setChanged(true);
      setMessage(saved.pending
        ? { type: 'info', text: 'Saved on this device. It will sync when you are back online.' }
        : { type: 'ok', text: 'Saved.' });
      notesService.pendingCount().then(setPendingChanges).catch(() => {});
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'CONFLICT' && e.details?.current) {
        setConflict(e.details.current as Note);
      } else {
        setMessage({ type: 'err', text: e.message || 'Could not save.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const keepMine = () => conflict && save(conflict);

  const useTheirs = async () => {
    if (!conflict) return;
    if (note) await notesService.resolveConflict(note.id);
    applyNote(conflict);
    setConflict(null);
    setRemoteChanged(false);
    setMessage({ type: 'info', text: 'Showing the latest version from the other device.' });
  };

  const saveMineAsCopy = async () => {
    if (!conflict) return;
    setSaving(true);
    try {
      await notesService.create({ title: `${title.trim() || 'Untitled'} (my copy)`, content, kind, folder_id: conflict.folder_id });
      if (note) await notesService.resolveConflict(note.id);
      applyNote(conflict);
      setConflict(null);
      setChanged(true);
      setMessage({ type: 'ok', text: 'Your version was saved as a separate copy.' });
    } catch (err: any) {
      setMessage({ type: 'err', text: err?.message || 'Could not save the copy.' });
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!note) return;
    setSaving(true);
    try {
      await notesService.remove(note);
      setChanged(true);
      onClose(true);
    } catch (err: any) {
      setConfirmDelete(false);
      setMessage({ type: 'err', text: err?.message || 'Could not delete.' });
    } finally {
      setSaving(false);
    }
  };

  const border = '#e2e8f0';

  return (
    <Modal visible animationType="slide" onRequestClose={close} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.flex, { backgroundColor: theme.background, paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: border }]}>
          <Pressable onPress={close} hitSlop={10} accessibilityLabel="Close editor">
            <ThemedText style={styles.headerBtn}>‹ Back</ThemedText>
          </Pressable>
          <ThemedText type="smallBold" style={{ color: theme.text }} numberOfLines={1}>
            {isNew ? (kind === 'document' ? 'New document' : 'New note') : canEdit ? (dirty ? 'Unsaved changes' : 'Saved') : 'View only'}
          </ThemedText>
          {canEdit && !deletedRemotely ? (
            <Pressable onPress={() => save()} disabled={saving || (!dirty && !isNew)} style={[styles.saveBtn, (saving || (!dirty && !isNew)) && { opacity: 0.5 }]}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <ThemedText type="smallBold" style={{ color: '#fff' }}>Save</ThemedText>}
            </Pressable>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
        ) : (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {fromCache && (
              <Banner color="#f1f5f9" text="#334155">You're offline — showing the copy saved on this device.</Banner>
            )}
            {note?.pending && (
              <Banner color="#fef3c7" text="#92400e">Waiting to sync — saved on this device only.</Banner>
            )}
            {deletedRemotely && (
              <Banner color="#fee2e2" text="#991b1b">This note was deleted on another device.</Banner>
            )}
            {remoteChanged && !conflict && (
              <Banner color="#e0f2fe" text="#075985">
                This note was changed on another device.{' '}
                <ThemedText type="smallBold" style={{ color: '#075985' }} onPress={() => note && load(note.id)}>Load latest</ThemedText>
                {'  ·  You will be asked before overwriting.'}
              </Banner>
            )}
            {message && (
              <Banner
                color={message.type === 'ok' ? '#dcfce7' : message.type === 'err' ? '#fee2e2' : '#e0f2fe'}
                text={message.type === 'ok' ? '#166534' : message.type === 'err' ? '#991b1b' : '#075985'}
              >
                {message.text}
              </Banner>
            )}

            {conflict && (
              <View style={styles.conflict}>
                <ThemedText type="smallBold" style={{ color: '#9a3412' }}>Changed on another device</ThemedText>
                <ThemedText type="small" style={{ color: '#9a3412', marginTop: 4 }}>
                  Someone saved a newer version ({formatDate(conflict.updated_at)}). Choose what to keep:
                </ThemedText>
                <View style={styles.conflictPreview}>
                  <ThemedText type="smallBold" style={{ color: '#334155' }}>Their version: {conflict.title}</ThemedText>
                  <ThemedText type="small" numberOfLines={4} style={{ color: '#475569', marginTop: 2 }}>
                    {(conflict.content || '').slice(0, 400) || '(empty)'}
                  </ThemedText>
                </View>
                <View style={styles.conflictButtons}>
                  <Choice onPress={keepMine} label="Keep mine" primary />
                  <Choice onPress={useTheirs} label="Use theirs" />
                  <Choice onPress={saveMineAsCopy} label="Save mine as a copy" />
                </View>
              </View>
            )}

            {canEdit && (
              <View style={styles.kindRow}>
                {(['note', 'document'] as NoteKind[]).map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => { setKind(k); setDirty(true); }}
                    style={[styles.kindChip, kind === k && styles.kindChipActive]}
                  >
                    <ThemedText type="small" style={{ color: kind === k ? '#fff' : '#334155' }}>
                      {k === 'note' ? '📝 Note' : '📄 Document'}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            )}

            <TextInput
              value={title}
              onChangeText={(t) => { setTitle(t); setDirty(true); }}
              editable={canEdit && !deletedRemotely}
              placeholder="Title"
              placeholderTextColor="#94a3b8"
              maxLength={255}
              style={[styles.title, { color: theme.text }]}
            />
            {note && (
              <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: 8, fontSize: 11 }}>
                {note.access === 'viewer' ? 'You can view this note • ' : ''}Last updated {formatDate(note.updated_at)} • Version {note.version || 'new'}
              </ThemedText>
            )}
            <TextInput
              value={content}
              onChangeText={(t) => { setContent(t); setDirty(true); }}
              editable={canEdit && !deletedRemotely}
              placeholder={kind === 'document' ? 'Write your document…' : 'Write a note…'}
              placeholderTextColor="#94a3b8"
              multiline
              textAlignVertical="top"
              style={[styles.content, { color: theme.text, borderColor: border }]}
            />

            {!isNew && canEdit && !deletedRemotely && (
              confirmDelete ? (
                <View style={styles.deleteRow}>
                  <ThemedText type="small" style={{ color: '#991b1b', flex: 1 }}>Delete this {kind}? This can't be undone.</ThemedText>
                  <Choice onPress={doDelete} label="Delete" danger />
                  <Choice onPress={() => setConfirmDelete(false)} label="Cancel" />
                </View>
              ) : (
                <Pressable onPress={() => setConfirmDelete(true)} style={styles.deleteLink}>
                  <ThemedText type="small" style={{ color: '#b91c1c' }}>🗑 Delete {kind}</ThemedText>
                </Pressable>
              )
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Banner({ color, text, children }: { color: string; text: string; children: React.ReactNode }) {
  return (
    <View style={[styles.banner, { backgroundColor: color }]}>
      <ThemedText type="small" style={{ color: text }}>{children}</ThemedText>
    </View>
  );
}

function Choice({ label, onPress, primary, danger }: { label: string; onPress: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choice, primary && { backgroundColor: '#ea580c', borderColor: '#ea580c' }, danger && { backgroundColor: '#dc2626', borderColor: '#dc2626' }]}
    >
      <ThemedText type="small" style={{ color: primary || danger ? '#fff' : '#334155' }}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerBtn: { color: '#2563eb', fontSize: 16 },
  saveBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, minWidth: 60, alignItems: 'center' },
  body: { padding: 16, width: '100%', maxWidth: 800, alignSelf: 'center', flexGrow: 1 },
  banner: { borderRadius: 8, padding: 10, marginBottom: 10 },
  conflict: { borderWidth: 1, borderColor: '#fdba74', backgroundColor: '#fff7ed', borderRadius: 10, padding: 12, marginBottom: 12 },
  conflictPreview: { backgroundColor: '#ffffff', borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#fed7aa' },
  conflictButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  choice: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  kindRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  kindChip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f8fafc' },
  kindChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  title: { fontSize: 22, fontWeight: '700', paddingVertical: 8 },
  content: { minHeight: 320, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, lineHeight: 22 },
  deleteLink: { marginTop: 16, alignSelf: 'flex-start' },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' },
});
