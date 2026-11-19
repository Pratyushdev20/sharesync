import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '@/config/firebase';
import { useAuth } from '@/context/AuthContext';
import { Profile, profileService, signInMethods, SyncDevice } from '@/services/profile.service';
import { reauthenticateWithGoogle } from '@/services/googleAuth';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { getDeviceId } from '@/services/device';
import { formatDate, formatFileSize } from '@/utils/fileFormatters';

type Msg = { type: 'ok' | 'err'; text: string } | null;

/**
 * Profile & account management:
 * name, email verification, password change / reset, sign-in method, usage,
 * synced devices, sign out and account deletion (with re-authentication).
 */
export function ProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [thisDevice, setThisDevice] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [nameMsg, setNameMsg] = useState<Msg>(null);
  const [savingName, setSavingName] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [savingPw, setSavingPw] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<Msg>(null);

  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle');
  const [deleteText, setDeleteText] = useState('');
  const [deletePw, setDeletePw] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<Msg>(null);

  const methods = signInMethods();
  const hasPassword = methods.includes('password');
  const hasGoogle = methods.includes('google.com');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, d, id] = await Promise.all([profileService.get(), profileService.listDevices().catch(() => []), getDeviceId()]);
      setProfile(p);
      setName(p.name);
      setDevices(d);
      setThisDevice(id);
    } catch (err: any) {
      setLoadError(err?.network ? "You're offline. Connect to manage your profile." : err?.message || 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setNameMsg(null);
      setPwMsg(null);
      setVerifyMsg(null);
      setDeleteMsg(null);
      setDeleteStep('idle');
      setDeleteText('');
      setDeletePw('');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      load();
    }
  }, [visible, load]);

  if (!visible) return null;

  const saveName = async () => {
    const clean = name.trim();
    if (!clean) return setNameMsg({ type: 'err', text: 'Name cannot be empty.' });
    if (clean.length > 100) return setNameMsg({ type: 'err', text: 'Name must be 100 characters or fewer.' });
    setSavingName(true);
    try {
      const saved = await profileService.updateName(clean);
      setName(saved);
      setProfile((p) => (p ? { ...p, name: saved } : p));
      setNameMsg({ type: 'ok', text: 'Name updated.' });
    } catch (err: any) {
      setNameMsg({ type: 'err', text: err?.message || 'Could not update name.' });
    } finally {
      setSavingName(false);
    }
  };

  const changePassword = async () => {
    if (newPw.length < 8) return setPwMsg({ type: 'err', text: 'New password must be at least 8 characters.' });
    if (newPw !== confirmPw) return setPwMsg({ type: 'err', text: 'New passwords do not match.' });
    if (newPw === currentPw) return setPwMsg({ type: 'err', text: 'New password must be different.' });
    setSavingPw(true);
    try {
      await profileService.changePassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwMsg({ type: 'ok', text: 'Password changed.' });
    } catch (err: any) {
      setPwMsg({ type: 'err', text: err?.message || 'Could not change password.' });
    } finally {
      setSavingPw(false);
    }
  };

  const sendVerification = async () => {
    try {
      await profileService.sendVerificationEmail();
      setVerifyMsg({ type: 'ok', text: `Verification email sent to ${profile?.email}.` });
    } catch (err: any) {
      setVerifyMsg({ type: 'err', text: err?.message || 'Could not send email.' });
    }
  };

  const sendReset = async () => {
    try {
      await profileService.sendPasswordReset();
      setPwMsg({ type: 'ok', text: `Password reset link sent to ${profile?.email}.` });
    } catch (err: any) {
      setPwMsg({ type: 'err', text: err?.message || 'Could not send email.' });
    }
  };

  const removeDevice = async (id: string) => {
    try {
      await profileService.removeDevice(id);
      setDevices((d) => d.filter((x) => x.device_id !== id));
    } catch {}
  };

  /** Re-authenticate (password or Google), then delete. */
  const confirmDelete = async (googleIdToken?: string) => {
    if (deleteText.trim().toUpperCase() !== 'DELETE') {
      return setDeleteMsg({ type: 'err', text: 'Type DELETE to confirm.' });
    }
    setDeleting(true);
    setDeleteMsg(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('You are not signed in.');
      if (hasPassword) {
        if (!deletePw) throw new Error('Enter your password to confirm.');
        await profileService.reauthenticateWithPassword(deletePw);
      } else if (hasGoogle) {
        await reauthenticateWithGoogle(user, googleIdToken);
      }
      await profileService.deleteAccount();
      onClose();
    } catch (err: any) {
      setDeleteMsg({ type: 'err', text: err?.message || 'Could not delete the account.' });
    } finally {
      setDeleting(false);
    }
  };

  const providerLabel = hasGoogle && hasPassword ? 'Google and email/password' : hasGoogle ? 'Google' : 'Email and password';

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}>
      <View style={[styles.flex, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.back}>‹ Back</Text></Pressable>
          <Text style={styles.headerTitle}>Profile & account</Text>
          <View style={{ width: 50 }} />
        </View>

        {loading && !profile ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
        ) : loadError ? (
          <View style={styles.center}>
            <Text style={styles.errText}>{loadError}</Text>
            <Pressable onPress={load} style={[styles.btn, { marginTop: 12 }]}><Text style={styles.btnText}>Retry</Text></Pressable>
          </View>
        ) : profile ? (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Account */}
            <View style={styles.card}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(profile.name || '?').slice(0, 1).toUpperCase()}</Text></View>
              <Text style={styles.label}>Name</Text>
              <View style={styles.row}>
                <TextInput value={name} onChangeText={setName} style={[styles.input, { flex: 1 }]} maxLength={100} placeholder="Your name" />
                <Pressable onPress={saveName} disabled={savingName || name.trim() === profile.name} style={[styles.btn, (savingName || name.trim() === profile.name) && styles.btnOff]}>
                  {savingName ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save</Text>}
                </Pressable>
              </View>
              <Message msg={nameMsg} />

              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{profile.email}</Text>
              <Text style={[styles.badge, profile.emailVerified ? styles.badgeOk : styles.badgeWarn]}>
                {profile.emailVerified ? '✓ Verified' : 'Not verified'}
              </Text>
              {!profile.emailVerified && hasPassword && (
                <Pressable onPress={sendVerification}><Text style={styles.link}>Send verification email</Text></Pressable>
              )}
              <Message msg={verifyMsg} />

              <Text style={styles.label}>Sign-in method</Text>
              <Text style={styles.value}>{providerLabel}</Text>
              <Text style={styles.label}>Member since</Text>
              <Text style={styles.value}>{formatDate(profile.created_at)}</Text>
            </View>

            {/* Usage */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Usage</Text>
              <View style={styles.statsGrid}>
                <Stat label="Storage used" value={formatFileSize(profile.stats.storageBytes)} />
                <Stat label="Files" value={String(profile.stats.files)} />
                <Stat label="Folders" value={String(profile.stats.folders)} />
                <Stat label="Notes & documents" value={String(profile.stats.notes)} />
                <Stat label="Shared by you" value={String(profile.stats.sharesGiven)} />
                <Stat label="Shared with you" value={String(profile.stats.sharesReceived)} />
                <Stat label="Active links" value={String(profile.stats.activeLinks)} />
              </View>
            </View>

            {/* Password */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Password</Text>
              {hasPassword ? (
                <>
                  <TextInput value={currentPw} onChangeText={setCurrentPw} secureTextEntry style={styles.input} placeholder="Current password" autoCapitalize="none" />
                  <TextInput value={newPw} onChangeText={setNewPw} secureTextEntry style={styles.input} placeholder="New password (at least 8 characters)" autoCapitalize="none" />
                  <TextInput value={confirmPw} onChangeText={setConfirmPw} secureTextEntry style={styles.input} placeholder="Confirm new password" autoCapitalize="none" />
                  <Pressable onPress={changePassword} disabled={savingPw || !currentPw || !newPw} style={[styles.btn, { alignSelf: 'flex-start' }, (savingPw || !currentPw || !newPw) && styles.btnOff]}>
                    {savingPw ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Change password</Text>}
                  </Pressable>
                  <Pressable onPress={sendReset}><Text style={styles.link}>Forgot your current password? Email me a reset link</Text></Pressable>
                </>
              ) : (
                <Text style={styles.hint}>You sign in with Google, so your password is managed by your Google account.</Text>
              )}
              <Message msg={pwMsg} />
            </View>

            {/* Devices */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Synced devices</Text>
              {devices.length === 0 ? (
                <Text style={styles.hint}>No devices recorded yet.</Text>
              ) : (
                devices.map((d) => (
                  <View key={d.device_id} style={styles.deviceRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.value}>
                        {d.device_name || (d.platform ? d.platform[0].toUpperCase() + d.platform.slice(1) : 'Device')}
                        {d.device_id === thisDevice ? ' (this device)' : ''}
                      </Text>
                      <Text style={styles.hint}>Last active {formatDate(d.last_seen_at)}</Text>
                    </View>
                    {d.device_id !== thisDevice && (
                      <Pressable onPress={() => removeDevice(d.device_id)}><Text style={styles.link}>Forget</Text></Pressable>
                    )}
                  </View>
                ))
              )}
            </View>

            <Pressable onPress={() => logout().then(onClose).catch(() => {})} style={styles.signOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>

            {/* Delete account */}
            <View style={[styles.card, styles.danger]}>
              <Text style={[styles.cardTitle, { color: '#991b1b' }]}>Delete account</Text>
              <Text style={styles.hint}>
                Permanently deletes your account, all your files, folders, notes, shares and links. People you shared with lose access. This cannot be undone.
              </Text>
              {deleteStep === 'idle' ? (
                <Pressable onPress={() => setDeleteStep('confirm')} style={[styles.dangerBtn, { alignSelf: 'flex-start' }]}>
                  <Text style={styles.btnText}>Delete my account…</Text>
                </Pressable>
              ) : (
                <>
                  <TextInput value={deleteText} onChangeText={setDeleteText} style={styles.input} placeholder='Type DELETE to confirm' autoCapitalize="characters" />
                  {hasPassword ? (
                    <>
                      <TextInput value={deletePw} onChangeText={setDeletePw} secureTextEntry style={styles.input} placeholder="Your password" autoCapitalize="none" />
                      <View style={styles.row}>
                        <Pressable onPress={() => confirmDelete()} disabled={deleting} style={[styles.dangerBtn, deleting && styles.btnOff]}>
                          {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Permanently delete</Text>}
                        </Pressable>
                        <Pressable onPress={() => setDeleteStep('idle')}><Text style={styles.link}>Cancel</Text></Pressable>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.hint}>Confirm with Google to delete:</Text>
                      {Platform.OS === 'web' ? (
                        <Pressable onPress={() => confirmDelete()} disabled={deleting} style={[styles.dangerBtn, { alignSelf: 'flex-start' }, deleting && styles.btnOff]}>
                          {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Confirm with Google and delete</Text>}
                        </Pressable>
                      ) : (
                        <GoogleSignInButton
                          mode="idtoken"
                          label="Confirm with Google and delete"
                          disabled={deleting}
                          onSuccess={({ idToken }) => confirmDelete(idToken)}
                          onError={(m) => setDeleteMsg({ type: 'err', text: m })}
                        />
                      )}
                      <Pressable onPress={() => setDeleteStep('idle')}><Text style={styles.link}>Cancel</Text></Pressable>
                    </>
                  )}
                </>
              )}
              <Message msg={deleteMsg} />
            </View>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <Text style={[styles.msg, msg.type === 'ok' ? styles.msgOk : styles.msgErr]}>{msg.text}</Text>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#fff' },
  back: { color: '#2563eb', fontSize: 16 },
  headerTitle: { fontWeight: '700', fontSize: 16, color: '#0f172a' },
  body: { padding: 16, width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 48 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 16, marginBottom: 14 },
  danger: { borderColor: '#fecaca' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 8 },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  label: { color: '#64748b', fontSize: 12, marginTop: 12, marginBottom: 4 },
  value: { color: '#0f172a', fontSize: 15 },
  hint: { color: '#64748b', fontSize: 13, marginVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: Platform.OS === 'web' ? 10 : 8, fontSize: 14, backgroundColor: '#fff', marginBottom: 8, minWidth: 160 },
  btn: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  btnOff: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700' },
  dangerBtn: { backgroundColor: '#dc2626', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', marginVertical: 6 },
  link: { color: '#2563eb', fontSize: 13, marginVertical: 6 },
  badge: { alignSelf: 'flex-start', fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 6, overflow: 'hidden' },
  badgeOk: { backgroundColor: '#dcfce7', color: '#166534' },
  badgeWarn: { backgroundColor: '#fef3c7', color: '#92400e' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, flexBasis: 130, backgroundColor: '#f1f5f9', borderRadius: 10, padding: 10 },
  statValue: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  statLabel: { fontSize: 12, color: '#64748b', marginTop: 2 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  signOut: { alignItems: 'center', paddingVertical: 12, marginBottom: 14, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  signOutText: { color: '#334155', fontWeight: '600' },
  msg: { fontSize: 13, marginTop: 6, padding: 8, borderRadius: 6, overflow: 'hidden' },
  msgOk: { backgroundColor: '#dcfce7', color: '#166534' },
  msgErr: { backgroundColor: '#fee2e2', color: '#991b1b' },
  errText: { color: '#991b1b', textAlign: 'center' },
});
