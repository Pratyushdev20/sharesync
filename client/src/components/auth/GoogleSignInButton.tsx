import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { googleClientIds, isGoogleSignInConfigured, signInWithGoogleIdToken, signInWithGoogleWeb } from '@/services/googleAuth';

WebBrowser.maybeCompleteAuthSession();

interface Props {
  /** "signin" signs in / creates the account. "idtoken" only returns a Google ID token (re-auth). */
  mode?: 'signin' | 'idtoken';
  label?: string;
  onSuccess?: (result: { created?: boolean; idToken?: string }) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

/**
 * "Continue with Google" button for web, Android and iOS.
 * On mobile the OAuth hook is only mounted when client ids are configured (the hook throws otherwise).
 */
export function GoogleSignInButton(props: Props) {
  if (Platform.OS === 'web') return <WebGoogleButton {...props} />;
  if (!isGoogleSignInConfigured()) {
    return (
      <View style={[styles.button, styles.disabled]}>
        <Text style={styles.text}>G  Continue with Google</Text>
        <Text style={styles.note}>Not configured for this app build yet</Text>
      </View>
    );
  }
  return <NativeGoogleButton {...props} />;
}

function WebGoogleButton({ mode = 'signin', label, onSuccess, onError, disabled }: Props) {
  const [busy, setBusy] = useState(false);
  const press = async () => {
    setBusy(true);
    try {
      if (mode === 'idtoken') {
        onSuccess?.({}); // web re-auth uses a popup inside reauthenticateWithGoogle
      } else {
        const res = await signInWithGoogleWeb();
        if (res) onSuccess?.(res);
      }
    } catch (err: any) {
      onError?.(err?.message || 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };
  return <ButtonView label={label} busy={busy} disabled={disabled} onPress={press} />;
}

function NativeGoogleButton({ mode = 'signin', label, onSuccess, onError, disabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: googleClientIds.web,
    androidClientId: googleClientIds.android || undefined,
    iosClientId: googleClientIds.ios || undefined,
    selectAccount: true,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type !== 'success') {
      setBusy(false);
      if (response.type === 'error') onError?.(response.error?.message || 'Google sign-in failed.');
      return;
    }
    const idToken = (response.params as any)?.id_token as string | undefined;
    if (!idToken) {
      setBusy(false);
      onError?.('Google did not return an ID token.');
      return;
    }
    if (mode === 'idtoken') {
      setBusy(false);
      onSuccess?.({ idToken });
      return;
    }
    signInWithGoogleIdToken(idToken)
      .then((r) => onSuccess?.(r))
      .catch((err) => onError?.(err?.message || 'Google sign-in failed.'))
      .finally(() => setBusy(false));
  }, [response]); // eslint-disable-line react-hooks/exhaustive-deps

  const press = async () => {
    setBusy(true);
    try {
      const result = await promptAsync();
      if (result.type !== 'success') setBusy(false);
    } catch (err: any) {
      setBusy(false);
      onError?.(err?.message || 'Could not open Google sign-in.');
    }
  };

  return <ButtonView label={label} busy={busy} disabled={disabled || !request} onPress={press} />;
}

function ButtonView({ label, busy, disabled, onPress }: { label?: string; busy: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [styles.button, (busy || disabled) && styles.disabled, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={label || 'Continue with Google'}
    >
      {busy ? (
        <ActivityIndicator color="#1f2937" />
      ) : (
        <Text style={styles.text}>
          <Text style={styles.g}>G</Text>  {label || 'Continue with Google'}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  disabled: { opacity: 0.6 },
  text: { color: '#1f2937', fontWeight: '600', fontSize: 15 },
  g: { color: '#4285F4', fontWeight: '800' },
  note: { color: '#6b7280', fontSize: 11, marginTop: 2 },
});
