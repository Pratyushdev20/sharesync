import { auth } from '@/config/firebase';
import { apiRequest, ApiError, isNetworkError } from './api';
import { readJson, writeJson } from './device';

export type NoteKind = 'note' | 'document';

export interface Note {
  id: string;
  folder_id: string | null;
  kind: NoteKind;
  title: string;
  content?: string;
  preview?: string;
  size?: number;
  version: number;
  access?: 'owner' | 'editor' | 'viewer';
  created_at: string;
  updated_at: string;
  /** Local-only: saved on this device but not yet on the server */
  pending?: boolean;
}

export interface NoteConflict {
  noteId: string;
  local: { title: string; content: string; kind: NoteKind };
  server: Note;
  detectedAt: string;
}

/**
 * Notes API with offline support.
 *
 * - Lists and opened notes are cached on the device, so they can be read offline.
 * - Edits made while offline go to an outbox and are sent automatically when the
 *   connection returns (flushOutbox is registered as a sync task).
 * - Every save sends the version it was based on; if the note changed elsewhere the server
 *   answers 409 and the conflict is kept (never silently overwritten) for the user to resolve.
 */

type OutboxItem =
  | { kind: 'create'; tempId: string; body: { title: string; content: string; kind: NoteKind; folder_id: string | null }; queuedAt: string }
  | { kind: 'update'; id: string; baseVersion: number; body: { title?: string; content?: string; kind?: NoteKind }; queuedAt: string }
  | { kind: 'delete'; id: string; baseVersion: number; queuedAt: string };

const uid = () => auth.currentUser?.uid || 'anon';
const listKey = (key: string) => `sharesync.notes.list.${uid()}.${key}`;
const noteKey = (id: string) => `sharesync.notes.item.${uid()}.${id}`;
const outboxKey = () => `sharesync.notes.outbox.${uid()}`;
const conflictsKey = () => `sharesync.notes.conflicts.${uid()}`;

export const getOutbox = () => readJson<OutboxItem[]>(outboxKey(), []);
const setOutbox = (items: OutboxItem[]) => writeJson(outboxKey(), items);
export const getConflicts = () => readJson<NoteConflict[]>(conflictsKey(), []);
const setConflicts = (items: NoteConflict[]) => writeJson(conflictsKey(), items);

function queryKey(params: { folderId?: string | null; q?: string; kind?: NoteKind }) {
  return `${params.folderId ?? 'all'}|${params.q ?? ''}|${params.kind ?? ''}`;
}

async function enqueue(item: OutboxItem) {
  const box = await getOutbox();
  // Collapse repeated offline edits of the same note into one update
  if (item.kind === 'update') {
    const existing = box.find((b) => b.kind === 'update' && b.id === item.id) as Extract<OutboxItem, { kind: 'update' }> | undefined;
    if (existing) {
      existing.body = { ...existing.body, ...item.body };
      await setOutbox(box);
      return;
    }
    const pendingCreate = box.find((b) => b.kind === 'create' && b.tempId === item.id) as Extract<OutboxItem, { kind: 'create' }> | undefined;
    if (pendingCreate) {
      pendingCreate.body = { ...pendingCreate.body, ...item.body } as any;
      await setOutbox(box);
      return;
    }
  }
  box.push(item);
  await setOutbox(box);
}

export const notesService = {
  /** Lists notes; falls back to the cached copy when offline (`fromCache: true`). */
  async list(params: { folderId?: string | null; q?: string; kind?: NoteKind } = {}): Promise<{ notes: Note[]; fromCache: boolean }> {
    const q = new URLSearchParams();
    if (params.folderId === null) q.set('folder_id', 'root');
    else if (params.folderId) q.set('folder_id', params.folderId);
    if (params.q) q.set('q', params.q);
    if (params.kind) q.set('kind', params.kind);
    const key = listKey(queryKey(params));
    try {
      const res = await apiRequest<Note[]>(`/api/notes${q.toString() ? `?${q}` : ''}`);
      const notes = res.data || [];
      await writeJson(key, notes);
      return { notes: await withPendingCreates(notes, params.folderId), fromCache: false };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const cached = await readJson<Note[]>(key, []);
      return { notes: await withPendingCreates(cached, params.folderId), fromCache: true };
    }
  },

  async get(id: string): Promise<{ note: Note; fromCache: boolean }> {
    if (id.startsWith('local-')) {
      const box = await getOutbox();
      const c = box.find((b) => b.kind === 'create' && b.tempId === id) as Extract<OutboxItem, { kind: 'create' }> | undefined;
      if (!c) throw new Error('This note is no longer available.');
      return { note: localNote(id, c.body, c.queuedAt), fromCache: true };
    }
    try {
      const res = await apiRequest<Note>(`/api/notes/${encodeURIComponent(id)}`);
      await writeJson(noteKey(id), res.data);
      return { note: res.data as Note, fromCache: false };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const cached = await readJson<Note | null>(noteKey(id), null);
      if (!cached) throw new Error('This note is not available offline yet. Open it once while online.');
      const pending = (await getOutbox()).find((b) => b.kind === 'update' && b.id === id) as Extract<OutboxItem, { kind: 'update' }> | undefined;
      return { note: pending ? { ...cached, ...pending.body, pending: true } : cached, fromCache: true };
    }
  },

  /** Creates a note; offline it is queued and shown with a temporary id. */
  async create(body: { title: string; content?: string; kind?: NoteKind; folder_id?: string | null }): Promise<Note> {
    const payload = { title: body.title, content: body.content ?? '', kind: body.kind ?? 'note', folder_id: body.folder_id ?? null };
    try {
      const res = await apiRequest<Note>('/api/notes', { method: 'POST', body: JSON.stringify(payload) });
      await writeJson(noteKey(res.data!.id), res.data);
      return res.data as Note;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const queuedAt = new Date().toISOString();
      await enqueue({ kind: 'create', tempId, body: payload, queuedAt });
      return localNote(tempId, payload, queuedAt);
    }
  },

  /**
   * Saves changes based on `baseVersion`.
   * Throws ApiError with code CONFLICT (details.current = server copy) when it changed elsewhere.
   * Offline: queued, returns the note marked `pending`.
   */
  async save(note: Note, changes: { title?: string; content?: string; kind?: NoteKind; folder_id?: string | null }): Promise<Note> {
    if (note.id.startsWith('local-')) {
      await enqueue({ kind: 'update', id: note.id, baseVersion: 0, body: changes as any, queuedAt: new Date().toISOString() });
      return { ...note, ...changes, pending: true } as Note;
    }
    try {
      const res = await apiRequest<Note>(`/api/notes/${encodeURIComponent(note.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...changes, expected_version: note.version }),
      });
      await writeJson(noteKey(note.id), res.data);
      return res.data as Note;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      if (changes.folder_id !== undefined) throw new Error('Moving a note needs a connection.');
      await enqueue({ kind: 'update', id: note.id, baseVersion: note.version, body: changes as any, queuedAt: new Date().toISOString() });
      const local = { ...note, ...changes, pending: true } as Note;
      await writeJson(noteKey(note.id), { ...note, ...changes });
      return local;
    }
  },

  async remove(note: Note): Promise<void> {
    if (note.id.startsWith('local-')) {
      await setOutbox((await getOutbox()).filter((b) => !(b.kind === 'create' && b.tempId === note.id) && !(b.kind === 'update' && b.id === note.id)));
      return;
    }
    try {
      await apiRequest(`/api/notes/${encodeURIComponent(note.id)}?expected_version=${note.version}`, { method: 'DELETE' });
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      await enqueue({ kind: 'delete', id: note.id, baseVersion: note.version, queuedAt: new Date().toISOString() });
    }
  },

  async pendingCount(): Promise<number> {
    return (await getOutbox()).length;
  },

  /**
   * Sends queued offline changes in order. Conflicts are moved to the conflict list
   * (both versions kept); network errors stop the flush so it is retried later.
   */
  async flushOutbox(): Promise<{ sent: number; conflicts: number; remaining: number }> {
    let box = await getOutbox();
    let sent = 0;
    let conflicts = 0;
    while (box.length > 0) {
      const item = box[0];
      try {
        if (item.kind === 'create') {
          await apiRequest('/api/notes', { method: 'POST', body: JSON.stringify(item.body) });
        } else if (item.kind === 'update') {
          await apiRequest(`/api/notes/${encodeURIComponent(item.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ ...item.body, expected_version: item.baseVersion }),
          });
        } else {
          await apiRequest(`/api/notes/${encodeURIComponent(item.id)}?expected_version=${item.baseVersion}`, { method: 'DELETE' });
        }
        sent++;
      } catch (err) {
        const e = err as ApiError;
        if (isNetworkError(e)) break; // still offline: keep queue, retry on next sync
        if (e.code === 'CONFLICT' && item.kind === 'update' && e.details?.current) {
          const cached = await readJson<Note | null>(noteKey(item.id), null);
          const list = await getConflicts();
          list.push({
            noteId: item.id,
            local: {
              title: item.body.title ?? cached?.title ?? e.details.current.title,
              content: item.body.content ?? cached?.content ?? '',
              kind: item.body.kind ?? cached?.kind ?? 'note',
            },
            server: e.details.current,
            detectedAt: new Date().toISOString(),
          });
          await setConflicts(list);
          conflicts++;
        } else {
          console.warn('Dropping queued note change that the server rejected:', e.message);
        }
      }
      box = (await getOutbox()).slice(1);
      await setOutbox(box);
    }
    return { sent, conflicts, remaining: box.length };
  },

  async resolveConflict(noteId: string): Promise<void> {
    await setConflicts((await getConflicts()).filter((c) => c.noteId !== noteId));
  },
};

function localNote(id: string, body: { title: string; content: string; kind: NoteKind; folder_id: string | null }, queuedAt: string): Note {
  return {
    id,
    folder_id: body.folder_id,
    kind: body.kind,
    title: body.title,
    content: body.content,
    preview: body.content.slice(0, 200),
    version: 0,
    access: 'owner',
    created_at: queuedAt,
    updated_at: queuedAt,
    pending: true,
  };
}

async function withPendingCreates(notes: Note[], folderId?: string | null): Promise<Note[]> {
  const box = await getOutbox();
  const creates = box
    .filter((b): b is Extract<OutboxItem, { kind: 'create' }> => b.kind === 'create')
    .filter((b) => folderId === undefined || (b.body.folder_id ?? null) === (folderId ?? null))
    .map((b) => localNote(b.tempId, b.body, b.queuedAt));
  const updates = new Map(
    box.filter((b): b is Extract<OutboxItem, { kind: 'update' }> => b.kind === 'update').map((b) => [b.id, b])
  );
  const deletes = new Set(box.filter((b) => b.kind === 'delete').map((b) => (b as any).id));
  return [
    ...creates,
    ...notes
      .filter((n) => !deletes.has(n.id))
      .map((n) => (updates.has(n.id) ? { ...n, ...updates.get(n.id)!.body, pending: true } : n)),
  ];
}
