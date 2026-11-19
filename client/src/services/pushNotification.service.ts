import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from './notification.service';

/**
 * Configure foreground notification behavior:
 * Display alert banner, play sound, and update app badge when a notification arrives.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const PUSH_TOKEN_STORAGE_PREFIX = 'sharesync.pushToken.';
const LAST_TOKEN_STORAGE_KEY = 'sharesync.lastRegisteredPushToken';
const HANDLED_NOTIFICATION_PREFIX = 'sharesync.handledNotification.';

/**
 * Configures the Android high-importance notification channel.
 * Required for Android 8.0 (API 26) and above.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#208AEF',
      sound: 'default',
      enableVibrate: true,
    });
  }
}

export interface PushTokenResult {
  token: string | null;
  status: 'granted' | 'denied' | 'undetermined' | 'unsupported';
  error?: string;
}

/**
 * Obtains the Expo Push Token on physical devices and registers it with the ShareSync backend.
 * Checks permissions, avoids duplicate registrations, and associates the token with the authenticated user.
 */
export async function registerForPushNotificationsAsync(uid: string): Promise<PushTokenResult> {
  if (Platform.OS === 'web') {
    return { token: null, status: 'unsupported' };
  }

  try {
    await setupNotificationChannels();

    if (!Device.isDevice) {
      console.log('[Push] Must use a physical device for Push Notifications');
      return { token: null, status: 'unsupported', error: 'Simulator/Emulator does not support remote push' };
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Notification permission not granted:', finalStatus);
      return { token: null, status: finalStatus as any };
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse?.data;

    if (!token) {
      return { token: null, status: 'granted', error: 'Failed to obtain push token from Expo service' };
    }

    // Check if this token was already successfully registered for this specific user
    const userTokenKey = `${PUSH_TOKEN_STORAGE_PREFIX}${uid}`;
    const cachedToken = await AsyncStorage.getItem(userTokenKey);

    if (cachedToken === token) {
      // Already registered; return cached token without duplicate backend call
      return { token, status: 'granted' };
    }

    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    await notificationService.registerPushToken(token, platform);

    await AsyncStorage.setItem(userTokenKey, token);
    await AsyncStorage.setItem(LAST_TOKEN_STORAGE_KEY, token);

    return { token, status: 'granted' };
  } catch (error: any) {
    console.warn('[Push] Error registering push token:', error);
    return { token: null, status: 'undetermined', error: error?.message || 'Push registration failed' };
  }
}

/**
 * Removes the push token registration for a user on logout.
 */
export async function unregisterPushNotificationsAsync(uid?: string): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    let token: string | null = null;
    if (uid) {
      token = await AsyncStorage.getItem(`${PUSH_TOKEN_STORAGE_PREFIX}${uid}`);
    }
    if (!token) {
      token = await AsyncStorage.getItem(LAST_TOKEN_STORAGE_KEY);
    }

    if (token) {
      await notificationService.unregisterPushToken(token).catch(() => {});
      if (uid) {
        await AsyncStorage.removeItem(`${PUSH_TOKEN_STORAGE_PREFIX}${uid}`);
      }
      await AsyncStorage.removeItem(LAST_TOKEN_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('[Push] Error unregistering push token:', err);
  }
}

export interface NotificationPayloadData {
  notificationId?: string;
  type?: string;
  resourceType?: 'file' | 'folder' | 'note' | string;
  resourceId?: string | number;
  [key: string]: any;
}

/**
 * Routes user to the appropriate screen based on tapped notification data.
 */
export function handleNotificationTap(
  response: Notifications.NotificationResponse,
  router: { push: (href: any) => void; replace: (href: any) => void }
): void {
  const data = (response?.notification?.request?.content?.data || {}) as NotificationPayloadData;
  const { type, resourceType } = data;

  if (resourceType === 'note') {
    router.push('/notes' as any);
    return;
  }

  if (resourceType === 'file' || resourceType === 'folder') {
    if (type?.startsWith('share.')) {
      router.push('/shared' as any);
    } else {
      router.push('/explore' as any);
    }
    return;
  }

  if (type?.startsWith('share.')) {
    router.push('/shared' as any);
    return;
  }

  // Default to Alerts / Notifications tab
  router.push('/notifications' as any);
}

/**
 * Sets up foreground notification and tap response listeners.
 * Returns an unsubscribe cleanup function.
 */
export function setupPushNotificationListeners(
  router: { push: (href: any) => void; replace: (href: any) => void },
  onNotificationReceived?: (notification: Notifications.Notification) => void
): () => void {
  if (Platform.OS === 'web') return () => {};

  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    if (onNotificationReceived) {
      onNotificationReceived(notification);
    }
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationTap(response, router);
  });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Checks if the app was opened from a notification when launched from a killed state.
 */
export async function checkInitialNotificationResponse(
  router: { push: (href: any) => void; replace: (href: any) => void }
): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const initialResponse = await Notifications.getLastNotificationResponseAsync();
    if (initialResponse) {
      const notificationId = initialResponse.notification.request.identifier;
      const key = `${HANDLED_NOTIFICATION_PREFIX}${notificationId}`;
      const handled = await AsyncStorage.getItem(key);
      if (!handled) {
        await AsyncStorage.setItem(key, 'true');
        handleNotificationTap(initialResponse, router);
      }
    }
  } catch (err) {
    console.warn('[Push] Error checking initial notification response:', err);
  }
}
