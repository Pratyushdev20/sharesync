import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider, Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

function NavigationGuard() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[theme];

  const inAuthGroup = (segments as string[])[0] === 'login';

  useEffect(() => {
    if (loading) return;

    if (!user && !inAuthGroup) {
      // Unauthenticated user trying to access protected screen -> redirect to login
      router.replace('/login');
    } else if (user && inAuthGroup) {
      // Authenticated user on login screen -> redirect to home
      router.replace('/');
    }
  }, [user, loading, inAuthGroup]);

  // Display loading screen while checking authentication state to prevent flashes
  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // If on login screen, render without the tab bar
  if (inAuthGroup) {
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
