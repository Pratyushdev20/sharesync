import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider, Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';
import { takePendingRedirect } from '@/utils/pendingRedirect';

SplashScreen.preventAutoHideAsync();

function NavigationGuard() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[theme];

  const currentSegment = (segments as string[])[0];
  const inAuthGroup = currentSegment === 'login' || currentSegment === 'signup';
  // Share links (/s/<token>) are public: the server decides whether sign-in is required
  const isPublicLink = currentSegment === 's';

  useEffect(() => {
    if (loading || isPublicLink) return;

    if (!user && !inAuthGroup) {
      // Unauthenticated user trying to access protected screen -> redirect to login
      router.replace('/login');
    } else if (user && inAuthGroup) {
      // Authenticated user on login/signup screen -> back to a pending share link, or home
      router.replace((takePendingRedirect() || '/') as any);
    }
  }, [user, loading, inAuthGroup, isPublicLink]);

  // Display loading screen while checking authentication state to prevent flashes
  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Login/signup and share-link pages render without the tab bar
  if (inAuthGroup || isPublicLink) {
    return <Slot />;
  }

  // If authenticated on protected routes, render tabs navigation
  return (
    <>
      <AnimatedSplashOverlay />
      <AppTabs />
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <NavigationGuard />
      </ThemeProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
