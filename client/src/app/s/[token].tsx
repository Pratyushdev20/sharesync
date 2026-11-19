import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/context/AuthContext';
import { LinkError, shareService } from '@/services/share.service';
import { fileService } from '@/services/file.service';
import { PublicLinkContents, PublicLinkInfo, UploadProgress } from '@/types/explorer';
import { formatDate, formatFileSize } from '@/utils/fileFormatters';
import { buildAppDeepLink } from '@/utils/shareTargets';
import { setPendingRedirect } from '@/utils/pendingRedirect';

type Phase = 'loading' | 'password' | 'signin' | 'ready' | 'error';

/**
 * Opens a ShareSync share link: /s/<token>
 * Works for visitors without an account (unless the owner required sign-in).
 */
export default function SharedLinkScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token: string }>();
  const token = String(rawToken || '');
  const router = useRouter();
  const theme = useTheme();
  const { user, loading: authLoading } = useAuth();

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorText, setErrorText] = useState('');
  const [info, setInfo] = useState<PublicLinkInfo | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [acceptedPassword, setAcceptedPassword] = useState<string | null>(null);

  const [contents, setContents] = useState<PublicLinkContents | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [loadingContents, setLoadingContents] = useState(false);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [notice, setNotice] = useState('');

  const handleLinkError = useCallback((err: LinkError) => {
    if (err.code === 'PASSWORD_REQUIRED') {
      setPhase('password');
    } else if (err.code === 'PASSWORD_INCORRECT') {
      setPhase('password');
      setPasswordError('Incorrect password. Please try again.');
    } else if (err.code === 'SIGN_IN_REQUIRED') {
      setPhase('signin');
    } else if (err.status === 410) {
      setPhase('error');
      setErrorText(err.message || 'This link has expired or was turned off by its owner.');
    } else if (err.status === 429) {
      setPhase('error');
      setErrorText('Too many attempts. Please wait 15 minutes and try again.');
    } else {
      setPhase('error');
      setErrorText(err.message || 'This link is not valid.');
    }
  }, []);

  const loadFolder = useCallback(
    async (pw: string | null, folderId: string | null) => {
      setLoadingContents(true);
      try {
        setContents(await shareService.getLinkContents(token, pw, folderId));
      } catch (err: any) {
        handleLinkError(err);
      } finally {
        setLoadingContents(false);
      }
    },
    [token, handleLinkError]
  );

  const open = useCallback(
    async (pw: string | null) => {
      setPasswordError('');
      try {
        const data = await shareService.getLinkInfo(token, pw);
        setInfo(data);
        setAcceptedPassword(pw);
        setPhase('ready');
        if (data.resourceType === 'folder') {
          setFolderStack([{ id: String(data.resource.id), name: data.resource.name }]);
          await loadFolder(pw, null);
        }
      } catch (err: any) {
        handleLinkError(err);
      }
    },
    [token, loadFolder, handleLinkError]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!/^[0-9a-fA-F]{64}$/.test(token)) {
      setPhase('error');
      setErrorText('This link is not valid. Check that it was copied completely.');
      return;
    }
    open(null);
  }, [token, authLoading, user, open]);

  const openSubfolder = async (id: string, name: string) => {
    setFolderStack((s) => [...s, { id, name }]);
    await loadFolder(acceptedPassword, id);
  };

  const goToCrumb = async (index: number) => {
    const target = folderStack[index];
    setFolderStack((s) => s.slice(0, index + 1));
    await loadFolder(acceptedPassword, index === 0 ? null : target.id);
  };

  const download = async (fileId: string | null, name: string) => {
    if (downloadingId) return;
    setNotice('');
    setDownloadingId(fileId || 'file');
    setProgress(null);
    try {
      const result = await shareService.downloadViaLink(token, name, acceptedPassword, fileId, setProgress);
      if (result && Platform.OS !== 'web') {
        const buttons: { text: string; style?: 'cancel'; onPress?: () => void }[] = [];
        if (Platform.OS === 'android') {
          buttons.push({
            text: 'Save to device',
            onPress: () =>
              fileService
                .saveToDeviceFolder(result)
                .then((ok) => ok && setNotice(`"${name}" saved to your device.`))
                .catch((e) => setNotice(e?.message || 'Could not save.')),
          });
        }
        buttons.push({
          text: Platform.OS === 'ios' ? 'Save / Share' : 'Open / Share',
          onPress: () => fileService.shareDownloadedFile(result).catch((e) => setNotice(e?.message || 'Could not share.')),
        });
        buttons.push({ text: 'Close', style: 'cancel' });
        Alert.alert('Download complete', `"${name}" was downloaded.`, buttons);
      }
    } catch (err: any) {
      setNotice(err?.message || 'Download failed.');
    } finally {
      setDownloadingId(null);
      setProgress(null);
    }
  };

  const goSignIn = () => {
    setPendingRedirect(`/s/${token}`);
    router.push('/login');
  };

  const inputStyle = [styles.input, { color: theme.text, borderColor: '#cbd5e1', backgroundColor: theme.backgroundElement }];

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.inner}>
          <ThemedText type="subtitle" style={[styles.brand, { color: '#2563eb' }]}>ShareSync</ThemedText>

          {phase === 'loading' && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#2563eb" />
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 12 }}>Opening shared link...</ThemedText>
            </View>
          )}

          {phase === 'error' && (
            <View style={styles.card}>
              <ThemedText style={styles.bigIcon}>⛔</ThemedText>
              <ThemedText type="smallBold" style={[styles.cardTitle, { color: theme.text }]}>Can't open this link</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>{errorText}</ThemedText>
            </View>
          )}

          {phase === 'signin' && (
            <View style={styles.card}>
              <ThemedText style={styles.bigIcon}>👤</ThemedText>
              <ThemedText type="smallBold" style={[styles.cardTitle, { color: theme.text }]}>Sign in required</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
                The owner only allows ShareSync users to open this link.
              </ThemedText>
              <Pressable style={styles.primaryBtn} onPress={goSignIn}>
                <ThemedText type="smallBold" style={{ color: '#fff' }}>Sign in to ShareSync</ThemedText>
              </Pressable>
            </View>
          )}

          {phase === 'password' && (
            <View style={styles.card}>
              <ThemedText style={styles.bigIcon}>🔒</ThemedText>
              <ThemedText type="smallBold" style={[styles.cardTitle, { color: theme.text }]}>Password protected</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
                Enter the password the sender gave you.
              </ThemedText>
              <TextInput
                style={[inputStyle, { alignSelf: 'stretch', marginTop: 12 }]}
                placeholder="Password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={() => password && open(password)}
              />
              {!!passwordError && <ThemedText type="small" style={styles.errText}>{passwordError}</ThemedText>}
              <Pressable style={[styles.primaryBtn, !password && { opacity: 0.6 }]} disabled={!password} onPress={() => open(password)}>
                <ThemedText type="smallBold" style={{ color: '#fff' }}>Unlock</ThemedText>
              </Pressable>
            </View>
          )}

          {phase === 'ready' && info && (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: 8 }}>
                {info.sharedBy ? `${info.sharedBy} shared this with you` : 'Shared with you'}
                {info.expiresAt ? ` • Link expires ${formatDate(info.expiresAt)}` : ''}
              </ThemedText>

              {!!notice && (
                <View style={styles.notice}><ThemedText type="small" style={{ color: '#1e3a8a' }}>{notice}</ThemedText></View>
              )}
              {!!downloadingId && (
                <View style={styles.notice}>
                  <ThemedText type="small" style={{ color: '#1e3a8a' }}>
                    Downloading... {progress?.total ? `${progress.percent}%` : ''}
                  </ThemedText>
                </View>
              )}

              {info.resourceType === 'file' ? (
                <View style={styles.card}>
                  <ThemedText style={styles.bigIcon}>📄</ThemedText>
                  <ThemedText type="smallBold" style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
                    {info.resource.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatFileSize(info.resource.size ?? 0)}{info.resource.updated_at ? ` • ${formatDate(info.resource.updated_at)}` : ''}
                  </ThemedText>
                  <Pressable style={styles.primaryBtn} onPress={() => download(null, info.resource.name)} disabled={!!downloadingId}>
                    {downloadingId ? <ActivityIndicator color="#fff" size="small" /> : <ThemedText type="smallBold" style={{ color: '#fff' }}>⬇ Download</ThemedText>}
                  </Pressable>
                </View>
              ) : (
                <View style={[styles.card, { alignItems: 'stretch' }]}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.crumbs}>
                    {folderStack.map((c, i) => (
                      <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Pressable onPress={() => i < folderStack.length - 1 && goToCrumb(i)} disabled={i === folderStack.length - 1}>
                          <ThemedText type={i === folderStack.length - 1 ? 'smallBold' : 'small'} style={{ color: i === folderStack.length - 1 ? theme.text : '#2563eb' }}>
                            📁 {c.name}
                          </ThemedText>
                        </Pressable>
                        {i < folderStack.length - 1 && <ThemedText themeColor="textSecondary"> / </ThemedText>}
                      </View>
                    ))}
                  </ScrollView>

                  {loadingContents && !contents ? (
                    <ActivityIndicator style={{ marginVertical: 20 }} color="#2563eb" />
                  ) : contents && contents.subfolders.length === 0 && contents.files.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" style={{ marginVertical: 16, textAlign: 'center' }}>
                      This folder is empty.
                    </ThemedText>
                  ) : (
                    contents && (
                      <View>
                        {contents.subfolders.map((f) => (
                          <Pressable key={`d${f.id}`} style={styles.row} onPress={() => openSubfolder(String(f.id), f.name)}>
                            <ThemedText style={{ fontSize: 18 }}>📁</ThemedText>
                            <ThemedText type="smallBold" style={{ flex: 1, color: theme.text }} numberOfLines={1}>{f.name}</ThemedText>
                            <ThemedText themeColor="textSecondary">›</ThemedText>
                          </Pressable>
                        ))}
                        {contents.files.map((f) => (
                          <View key={`f${f.id}`} style={styles.row}>
                            <ThemedText style={{ fontSize: 18 }}>📄</ThemedText>
                            <View style={{ flex: 1 }}>
                              <ThemedText type="smallBold" style={{ color: theme.text }} numberOfLines={1}>{f.name}</ThemedText>
                              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>{formatFileSize(f.size)}</ThemedText>
                            </View>
                            <Pressable style={styles.smallBtn} onPress={() => download(String(f.id), f.name)} disabled={!!downloadingId}>
                              {downloadingId === String(f.id) ? <ActivityIndicator size="small" color="#2563eb" /> : <ThemedText type="small" style={{ color: '#1d4ed8' }}>⬇ Download</ThemedText>}
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )
                  )}
                </View>
              )}

              <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
                🔐 Files are encrypted on ShareSync's servers. This link is view-only.
              </ThemedText>
            </>
          )}

          {/* Footer actions */}
          <View style={styles.footer}>
            {Platform.OS === 'web' && phase !== 'error' && (
              <Pressable onPress={() => Linking.openURL(buildAppDeepLink(token)).catch(() => {})}>
                <ThemedText type="small" style={{ color: '#2563eb' }}>Open in the ShareSync app</ThemedText>
              </Pressable>
            )}
            <Pressable onPress={() => router.replace(user ? '/' : '/login')}>
              <ThemedText type="small" style={{ color: '#2563eb' }}>
                {user ? 'Go to my ShareSync' : 'Create your own ShareSync account'}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 16, paddingTop: 48 },
  inner: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  brand: { fontSize: 24, fontWeight: '800', marginBottom: 16 },
  center: { alignItems: 'center', paddingVertical: 60 },
  centerText: { textAlign: 'center', marginTop: 4 },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  bigIcon: { fontSize: 40, marginBottom: 8 },
  cardTitle: { fontSize: 17, textAlign: 'center', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  errText: { color: '#b91c1c', marginTop: 6 },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 22,
    paddingVertical: 11,
    marginTop: 14,
    minWidth: 140,
    alignItems: 'center',
  },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#dbeafe' },
  crumbs: { paddingBottom: 10, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  notice: { backgroundColor: '#eff6ff', borderRadius: 8, padding: 10, marginBottom: 10 },
  footnote: { textAlign: 'center', marginTop: 4, fontSize: 11 },
  footer: { alignItems: 'center', gap: 10, marginTop: 24 },
});
