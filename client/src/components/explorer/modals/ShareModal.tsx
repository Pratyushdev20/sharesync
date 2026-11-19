import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { shareService } from '@/services/share.service';
import {
  CreatedShareLink,
  FileItem,
  FolderItem,
  ResourceAccess,
  ResourceType,
  SharePermission,
} from '@/types/explorer';
import {
  buildShareMessage,
  buildShareUrl,
  copyText,
  sendFileCopy,
  shareViaSystemSheet,
  shareViaWhatsApp,
} from '@/utils/shareTargets';
import { formatDate } from '@/utils/fileFormatters';

export interface ShareTarget {
  type: ResourceType;
  item: FileItem | FolderItem;
}

interface ShareModalProps {
  target: ShareTarget | null;
  onClose: () => void;
}

const EXPIRY_OPTIONS: { label: string; hours: number | null }[] = [
  { label: '1 day', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
  { label: 'Never', hours: null },
];

type Status = { type: 'success' | 'error'; text: string } | null;

export function ShareModal({ target, onClose }: ShareModalProps) {
  const theme = useTheme();

  const [access, setAccess] = useState<ResourceAccess | null>(null);
  const [loadingAccess, setLoadingAccess] = useState(false);

  // Send to a ShareSync user
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<SharePermission>('viewer');
  const [sending, setSending] = useState(false);

  // Link options
  const [expiryHours, setExpiryHours] = useState<number | null>(24 * 7);
  const [linkPassword, setLinkPassword] = useState('');
  const [requireSignIn, setRequireSignIn] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [newLink, setNewLink] = useState<CreatedShareLink | null>(null);

  const [sendingCopy, setSendingCopy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const loadAccess = useCallback(async () => {
    if (!target) return;
    setLoadingAccess(true);
    try {
      setAccess(await shareService.getResourceAccess(target.type, target.item.id));
    } catch (err: any) {
      setStatus({ type: 'error', text: err?.message || 'Could not load sharing details.' });
    } finally {
      setLoadingAccess(false);
    }
  }, [target]);

  useEffect(() => {
    if (target) {
      setEmail('');
      setPermission('viewer');
      setExpiryHours(24 * 7);
      setLinkPassword('');
      setRequireSignIn(false);
      setNewLink(null);
      setStatus(null);
      setAccess(null);
      loadAccess();
    }
  }, [target, loadAccess]);

  if (!target) return null;
  const name = target.item.name;
  const kind = target.type === 'file' ? 'file' : 'folder';

  const handleSendToUser = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus({ type: 'error', text: 'Enter a valid email address.' });
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      await shareService.shareWithUser(target.type, target.item.id, email, permission);
      setStatus({
        type: 'success',
        text: `Sent! "${name}" now appears in their ShareSync app under "Shared".`,
      });
      setEmail('');
      await loadAccess();
    } catch (err: any) {
      setStatus({ type: 'error', text: err?.message || 'Could not share.' });
    } finally {
      setSending(false);
    }
  };

  const handleChangePermission = async (shareId: string, next: SharePermission) => {
    setBusyId(shareId);
    try {
      await shareService.updatePermission(target.type, shareId, next);
      await loadAccess();
    } catch (err: any) {
      setStatus({ type: 'error', text: err?.message || 'Could not change permission.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleRemovePerson = async (shareId: string) => {
    setBusyId(shareId);
    try {
      await shareService.revokeShare(target.type, shareId);
      setStatus({ type: 'success', text: 'Access removed.' });
      await loadAccess();
    } catch (err: any) {
      setStatus({ type: 'error', text: err?.message || 'Could not remove access.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateLink = async () => {
    if (linkPassword && linkPassword.length < 4) {
      setStatus({ type: 'error', text: 'Link password must be at least 4 characters.' });
      return;
    }
    setCreatingLink(true);
    setStatus(null);
    try {
      const link = await shareService.createLink(target.type, target.item.id, {
        expiresInHours: expiryHours,
        password: linkPassword || undefined,
        requireSignIn,
      });
      setNewLink(link);
      setLinkPassword('');
      await loadAccess();
    } catch (err: any) {
      setStatus({ type: 'error', text: err?.message || 'Could not create link.' });
    } finally {
      setCreatingLink(false);
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    setBusyId(linkId);
    try {
      await shareService.revokeLink(linkId);
      if (newLink && String(newLink.id) === String(linkId)) setNewLink(null);
      setStatus({ type: 'success', text: 'Link turned off. Nobody can open it anymore.' });
      await loadAccess();
    } catch (err: any) {
      setStatus({ type: 'error', text: err?.message || 'Could not revoke link.' });
    } finally {
      setBusyId(null);
    }
  };

  const linkUrl = newLink ? buildShareUrl(newLink.token) : '';
  const linkMessage = newLink ? buildShareMessage(name, linkUrl, newLink.hasPassword) : '';

  const runShareAction = async (action: () => Promise<unknown>, successText?: string) => {
    try {
      await action();
      if (successText) setStatus({ type: 'success', text: successText });
    } catch (err: any) {
      setStatus({ type: 'error', text: err?.message || 'Could not open that app.' });
    }
  };

  const handleMoreApps = () =>
    runShareAction(async () => {
      const opened = await shareViaSystemSheet(linkMessage, `Share "${name}"`);
      if (!opened) {
        await copyText(linkMessage);
        setStatus({ type: 'success', text: 'Link copied. Paste it into any app.' });
      }
    });

  const handleSendCopy = async () => {
    setSendingCopy(true);
    setStatus(null);
    try {
      const result = await sendFileCopy(target.item as FileItem);
      if (result === 'downloaded') {
        setStatus({ type: 'success', text: 'File downloaded. Attach it in WhatsApp or any other app.' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', text: err?.message || 'Could not send the file.' });
    } finally {
      setSendingCopy(false);
    }
  };

  const inputStyle = [styles.input, { color: theme.text, borderColor: '#cbd5e1', backgroundColor: theme.backgroundElement }];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.background }]}>
          <View style={styles.headerRow}>
            <ThemedText type="subtitle" numberOfLines={1} style={[styles.title, { color: theme.text }]}>
              Share "{name}"
            </ThemedText>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <ThemedText style={{ fontSize: 18, color: '#64748b' }}>✕</ThemedText>
            </Pressable>
          </View>

          {status && (
            <View style={[styles.status, status.type === 'success' ? styles.statusOk : styles.statusErr]}>
              <ThemedText style={{ fontSize: 13, color: status.type === 'success' ? '#166534' : '#991b1b' }}>
                {status.text}
              </ThemedText>
            </View>
          )}

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8 }}>
            {/* ---------------- Send to a ShareSync user ---------------- */}
            <ThemedText type="smallBold" style={[styles.sectionTitle, { color: theme.text }]}>
              Send to a ShareSync user
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.help}>
              It shows up in their app under "Shared". They need a ShareSync account with this email.
            </ThemedText>
            <TextInput
              style={inputStyle}
              placeholder="Their email, e.g. brother@gmail.com"
              placeholderTextColor="#94a3b8"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!sending}
            />
            <View style={styles.row}>
              <Segmented
                value={permission}
                onChange={(v) => setPermission(v as SharePermission)}
                options={[
                  { value: 'viewer', label: 'Can view' },
                  { value: 'editor', label: 'Can edit' },
                ]}
              />
              <Pressable
                onPress={handleSendToUser}
                disabled={sending}
                style={[styles.primaryBtn, sending && { opacity: 0.6 }]}
              >
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <ThemedText type="smallBold" style={{ color: '#fff' }}>Send</ThemedText>}
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.help}>
              {permission === 'viewer'
                ? 'Viewers can open and download.'
                : `Editors can also upload, rename and delete inside this ${kind}.`}
            </ThemedText>

            {/* People with access */}
            {loadingAccess && !access ? (
              <ActivityIndicator style={{ marginVertical: 12 }} color="#2563eb" />
            ) : (
              access && access.people.length > 0 && (
                <View style={styles.list}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.listTitle}>
                    PEOPLE WITH ACCESS
                  </ThemedText>
                  {access.people.map((p) => (
                    <View key={p.share_id} style={styles.listRow}>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.text }}>{p.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ fontSize: 11 }}>{p.email}</ThemedText>
                      </View>
                      {busyId === p.share_id ? (
                        <ActivityIndicator size="small" color="#2563eb" />
                      ) : (
                        <>
                          <Pressable
                            onPress={() => handleChangePermission(p.share_id, p.permission === 'viewer' ? 'editor' : 'viewer')}
                            style={styles.chip}
                            accessibilityLabel="Change permission"
                          >
                            <ThemedText type="small" style={{ color: '#1d4ed8' }}>
                              {p.permission === 'viewer' ? 'Viewer ▾' : 'Editor ▾'}
                            </ThemedText>
                          </Pressable>
                          <Pressable onPress={() => handleRemovePerson(p.share_id)} style={styles.dangerChip}>
                            <ThemedText type="small" style={{ color: '#b91c1c' }}>Remove</ThemedText>
                          </Pressable>
                        </>
                      )}
                    </View>
                  ))}
                </View>
              )
            )}

            <View style={styles.divider} />

            {/* ---------------- Link for WhatsApp & other apps ---------------- */}
            <ThemedText type="smallBold" style={[styles.sectionTitle, { color: theme.text }]}>
              Share a link (WhatsApp & other apps)
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.help}>
              Anyone with the link can view and download. Links never allow changes.
            </ThemedText>

            {newLink ? (
              <View style={styles.linkBox}>
                <ThemedText selectable numberOfLines={2} style={styles.linkText}>{linkUrl}</ThemedText>
                <View style={styles.shareButtons}>
                  <Pressable style={[styles.appBtn, { backgroundColor: '#16a34a' }]} onPress={() => runShareAction(() => shareViaWhatsApp(linkMessage))}>
                    <ThemedText type="smallBold" style={{ color: '#fff' }}>WhatsApp</ThemedText>
                  </Pressable>
                  <Pressable style={[styles.appBtn, { backgroundColor: '#2563eb' }]} onPress={handleMoreApps}>
                    <ThemedText type="smallBold" style={{ color: '#fff' }}>More apps</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.appBtn, { backgroundColor: '#475569' }]}
                    onPress={() => runShareAction(() => copyText(linkUrl), 'Link copied.')}
                  >
                    <ThemedText type="smallBold" style={{ color: '#fff' }}>Copy link</ThemedText>
                  </Pressable>
                </View>
                <ThemedText type="small" style={styles.warnText}>
                  For security this link is shown only once. Share or copy it now.
                  {newLink.hasPassword ? ' Send the password separately (not in the same message).' : ''}
                </ThemedText>
                <Pressable onPress={() => setNewLink(null)}>
                  <ThemedText type="small" style={{ color: '#2563eb', marginTop: 6 }}>Create another link</ThemedText>
                </Pressable>
              </View>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.optionLabel}>Link expires after</ThemedText>
                <Segmented
                  value={String(expiryHours)}
                  onChange={(v) => setExpiryHours(v === 'null' ? null : Number(v))}
                  options={EXPIRY_OPTIONS.map((o) => ({ value: String(o.hours), label: o.label }))}
                />
                <TextInput
                  style={[inputStyle, { marginTop: 10 }]}
                  placeholder="Password (optional, at least 4 characters)"
                  placeholderTextColor="#94a3b8"
                  value={linkPassword}
                  onChangeText={setLinkPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!creatingLink}
                />
                <Pressable onPress={() => setRequireSignIn((v) => !v)} style={styles.checkboxRow} accessibilityRole="checkbox" accessibilityState={{ checked: requireSignIn }}>
                  <View style={[styles.checkbox, requireSignIn && styles.checkboxOn]}>
                    {requireSignIn && <ThemedText style={{ color: '#fff', fontSize: 11 }}>✓</ThemedText>}
                  </View>
                  <ThemedText type="small" style={{ color: theme.text, flex: 1 }}>
                    Only people signed in to ShareSync can open it
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={handleCreateLink}
                  disabled={creatingLink}
                  style={[styles.primaryBtn, { alignSelf: 'flex-start', marginTop: 10 }, creatingLink && { opacity: 0.6 }]}
                >
                  {creatingLink ? <ActivityIndicator color="#fff" size="small" /> : <ThemedText type="smallBold" style={{ color: '#fff' }}>Create link</ThemedText>}
                </Pressable>
              </>
            )}

            {/* Existing links */}
            {access && access.links.length > 0 && (
              <View style={styles.list}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.listTitle}>
                  LINKS
                </ThemedText>
                {access.links.map((l) => {
                  const state = !l.is_active ? 'Turned off' : l.is_expired ? 'Expired' : 'Active';
                  const usable = l.is_active && !l.is_expired;
                  return (
                    <View key={l.link_id} style={styles.listRow}>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="smallBold" style={{ color: usable ? '#166534' : '#94a3b8' }}>
                          {state}{l.has_password ? ' • 🔒 Password' : ''}{!l.is_anonymous_allowed ? ' • Sign-in' : ''}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                          Created {formatDate(l.created_at)} • {l.expires_at ? `Expires ${formatDate(l.expires_at)}` : 'No expiry'} • Opened {l.access_count}×
                        </ThemedText>
                      </View>
                      {usable && (busyId === l.link_id ? (
                        <ActivityIndicator size="small" color="#2563eb" />
                      ) : (
                        <Pressable onPress={() => handleRevokeLink(l.link_id)} style={styles.dangerChip}>
                          <ThemedText type="small" style={{ color: '#b91c1c' }}>Turn off</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </View>
            )}

            {/* ---------------- Send the file itself ---------------- */}
            {target.type === 'file' && (
              <>
                <View style={styles.divider} />
                <ThemedText type="smallBold" style={[styles.sectionTitle, { color: theme.text }]}>
                  Send the file itself
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.help}>
                  Sends a copy as an attachment (WhatsApp, Gmail, Bluetooth...). The copy cannot be revoked later.
                </ThemedText>
                <Pressable
                  onPress={handleSendCopy}
                  disabled={sendingCopy}
                  style={[styles.secondaryBtn, sendingCopy && { opacity: 0.6 }]}
                >
                  {sendingCopy ? (
                    <ActivityIndicator size="small" color="#2563eb" />
                  ) : (
                    <ThemedText type="smallBold" style={{ color: '#1d4ed8' }}>
                      {Platform.OS === 'web' ? 'Send / download a copy' : 'Send a copy to another app'}
                    </ThemedText>
                  )}
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <ThemedText type="small" style={{ color: active ? '#fff' : '#334155', fontSize: 12 }}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 19, fontWeight: '700', flex: 1 },
  body: { marginTop: 8 },
  sectionTitle: { marginTop: 12, fontSize: 15 },
  help: { marginTop: 2, marginBottom: 8, fontSize: 12 },
  optionLabel: { marginBottom: 6, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    fontSize: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10, flexWrap: 'wrap' },
  primaryBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  segmentActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  list: { marginTop: 12 },
  listTitle: { fontSize: 11, letterSpacing: 0.5, marginBottom: 4 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#dbeafe' },
  dangerChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#fee2e2' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginTop: 16 },
  linkBox: { borderWidth: 1, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12 },
  linkText: { fontSize: 12, color: '#14532d', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  shareButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  appBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  warnText: { marginTop: 8, fontSize: 11, color: '#92400e' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  status: { borderRadius: 8, padding: 10, marginTop: 10 },
  statusOk: { backgroundColor: '#dcfce7' },
  statusErr: { backgroundColor: '#fee2e2' },
});
