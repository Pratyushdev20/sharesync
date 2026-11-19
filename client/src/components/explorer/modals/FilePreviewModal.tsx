import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File as FsFile } from 'expo-file-system';
import { WebView } from 'react-native-webview';
import { getApiBaseUrl, getAuthToken } from '@/services/api';
import { fileService, NativeDownloadResult } from '@/services/file.service';
import { FileItem } from '@/types/explorer';
import { formatDate, formatFileSize } from '@/utils/fileFormatters';

/**
 * In-app file preview.
 *
 * Supported: images (PNG, JPEG, GIF, WEBP, SVG), text (TXT, CSV, JSON, Markdown, logs),
 * PDF (web and iOS), audio & video (web). Everything else offers download / open-in-app.
 *
 * Safety: content is rendered with a type chosen from a fixed allow-list (never the raw
 * server-provided type), SVG is shown through an <img> (scripts never run), text is shown as
 * plain text, and HTML is never rendered.
 */

type Kind = 'image' | 'text' | 'pdf' | 'audio' | 'video' | 'none';

const MAX_PREVIEW_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;

const SAFE_IMAGE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
const SAFE_AUDIO = ['audio/mpeg', 'audio/wav', 'audio/ogg'];
const SAFE_VIDEO = ['video/mp4', 'video/webm'];
const TEXT_EXT = ['txt', 'csv', 'json', 'md', 'log', 'tsv', 'xml', 'yml', 'yaml'];

export function previewKind(file: FileItem): Kind {
  const mime = (file.mime_type || '').toLowerCase();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (SAFE_IMAGE.includes(mime === 'image/jpg' ? 'image/jpeg' : mime)) return 'image';
  if (mime === 'application/pdf') return Platform.OS === 'android' ? 'none' : 'pdf';
  if (mime.startsWith('text/') || mime === 'application/json' || TEXT_EXT.includes(ext)) return 'text';
  if (Platform.OS === 'web' && SAFE_AUDIO.includes(mime)) return 'audio';
  if (Platform.OS === 'web' && (SAFE_VIDEO.includes(mime) || mime === 'video/quicktime')) return 'video';
  return 'none';
}

function safeBlobType(kind: Kind, mime: string): string {
  const m = mime.toLowerCase();
  if (kind === 'image') return SAFE_IMAGE.includes(m) ? m : m === 'image/jpg' ? 'image/jpeg' : 'application/octet-stream';
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'audio') return SAFE_AUDIO.includes(m) ? m : 'application/octet-stream';
  if (kind === 'video') return SAFE_VIDEO.includes(m) ? m : 'video/mp4';
  return 'text/plain';
}

interface Props {
  file: FileItem | null;
  onClose: () => void;
  onDownload?: (file: FileItem) => void;
}

export function FilePreviewModal({ file, onClose, onDownload }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const nativeResult = useRef<NativeDownloadResult | null>(null);
  const objectUrl = useRef<string | null>(null);

  const kind: Kind = file ? previewKind(file) : 'none';
  const size = Number(file?.size) || 0;

  useEffect(() => {
    let cancelled = false;
    setUri(null);
    setText(null);
    setError(null);
    setTruncated(false);
    if (!file || kind === 'none') return;
    if (size > MAX_PREVIEW_BYTES) {
      setError(`This file is too large to preview (${formatFileSize(size)}). Download it instead.`);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const url = `${getApiBaseUrl()}/api/files/${encodeURIComponent(file.id)}/download`;
        const headers = { Authorization: `Bearer ${await getAuthToken()}` };

        if (Platform.OS === 'web') {
          const res = await fetch(url, { headers });
          if (!res.ok) throw new Error(res.status === 403 ? 'You no longer have access to this file.' : `Could not load preview (${res.status}).`);
          const buf = await res.arrayBuffer();
          if (cancelled) return;
          if (kind === 'text') {
            const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buf);
            setTruncated(decoded.length > MAX_TEXT_CHARS);
            setText(decoded.slice(0, MAX_TEXT_CHARS));
          } else {
            const blob = new Blob([buf], { type: safeBlobType(kind, file.mime_type || '') });
            objectUrl.current = URL.createObjectURL(blob);
            setUri(objectUrl.current);
          }
        } else {
          const result = await fileService.downloadFromUrl(url, headers, `preview_${file.id}_v${file.version ?? 0}`, file.name);
          if (cancelled || !result) return;
          nativeResult.current = result;
          if (kind === 'text') {
            const content = await new FsFile(result.uri).text();
            setTruncated(content.length > MAX_TEXT_CHARS);
            setText(content.slice(0, MAX_TEXT_CHARS));
          } else {
            setUri(result.uri);
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not load the preview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = null;
      }
      // Remove the temporary preview copy from the device cache
      if (nativeResult.current) {
        try {
          const f = new FsFile(nativeResult.current.uri);
          if (f.exists) f.delete();
        } catch {}
        nativeResult.current = null;
      }
    };
  }, [file?.id, file?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!file) return null;

  const openExternally = async () => {
    try {
      const result =
        nativeResult.current ||
        (await fileService.downloadFile(file.id, file.name));
      if (result) await fileService.shareDownloadedFile(result);
    } catch (err: any) {
      setError(err?.message || 'Could not open the file.');
    }
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : undefined}>
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close preview">
            <Text style={styles.close}>✕</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{file.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {formatFileSize(file.size)}{file.updated_at ? ` • ${formatDate(file.updated_at)}` : ''}{file.version ? ` • v${file.version}` : ''}
            </Text>
          </View>
          {onDownload && (
            <Pressable onPress={() => onDownload(file)} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>⬇ Download</Text>
            </Pressable>
          )}
          {Platform.OS !== 'web' && (
            <Pressable onPress={openExternally} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>Open in…</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator size="large" color="#93c5fd" />
          ) : error ? (
            <Text style={styles.info}>{error}</Text>
          ) : kind === 'none' ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 48 }}>📄</Text>
              <Text style={styles.info}>
                {(file.mime_type || '').toLowerCase() === 'application/pdf'
                  ? 'PDF preview is not available on Android. Use "Open in…" to view it in another app.'
                  : 'No preview is available for this type of file.'}
              </Text>
            </View>
          ) : kind === 'text' && text !== null ? (
            <ScrollView style={styles.textBox} contentContainerStyle={{ padding: 14 }}>
              {truncated && <Text style={styles.truncated}>Showing the first {MAX_TEXT_CHARS.toLocaleString()} characters.</Text>}
              <Text selectable style={styles.text}>{text || '(empty file)'}</Text>
            </ScrollView>
          ) : kind === 'image' && uri ? (
            <Image source={{ uri }} style={styles.image} resizeMode="contain" accessibilityLabel={file.name} />
          ) : kind === 'pdf' && uri ? (
            Platform.OS === 'web' ? (
              <iframe src={uri} title={file.name} style={{ border: 0, width: '100%', height: '100%', background: '#fff' } as any} />
            ) : (
              <WebView
                source={{ uri }}
                style={styles.webview}
                originWhitelist={['file://*']}
                allowingReadAccessToURL={uri}
                javaScriptEnabled={false}
                allowFileAccess
              />
            )
          ) : kind === 'video' && uri && Platform.OS === 'web' ? (
            <video src={uri} controls style={{ maxWidth: '100%', maxHeight: '100%' } as any} />
          ) : kind === 'audio' && uri && Platform.OS === 'web' ? (
            <audio src={uri} controls />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#111827' },
  close: { color: '#e5e7eb', fontSize: 20, paddingHorizontal: 4 },
  title: { color: '#f9fafb', fontWeight: '600', fontSize: 15 },
  meta: { color: '#9ca3af', fontSize: 11, marginTop: 2 },
  headerBtn: { borderWidth: 1, borderColor: '#374151', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  headerBtnText: { color: '#e5e7eb', fontSize: 13 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  info: { color: '#d1d5db', textAlign: 'center', maxWidth: 420, marginTop: 8 },
  image: { width: '100%', height: '100%' },
  webview: { width: '100%', flex: 1, alignSelf: 'stretch' },
  textBox: { alignSelf: 'stretch', backgroundColor: '#ffffff', borderRadius: 8, width: '100%', maxWidth: 1000 },
  text: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: '#111827' },
  truncated: { color: '#92400e', backgroundColor: '#fef3c7', padding: 6, borderRadius: 4, marginBottom: 8, fontSize: 12 },
});
