import { Linking, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { fileService } from '@/services/file.service';
import { getApiBaseUrl, getAuthToken } from '@/services/api';
import { FileItem } from '@/types/explorer';

/**
 * Helpers for sending ShareSync content to other apps (WhatsApp, Telegram, Gmail, ...).
 */

/** Base URL of the ShareSync web app, used to build share links. */
export function getWebAppUrl(): string {
  const configured = process.env.EXPO_PUBLIC_WEB_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:8081';
}

/** Full https link for a share token. Opens the ShareSync web app (or the app, via its /s/ route). */
export function buildShareUrl(token: string): string {
  return `${getWebAppUrl()}/s/${token}`;
}

/** Deep link that opens the installed ShareSync app directly. */
export function buildAppDeepLink(token: string): string {
  return `sharesync://s/${token}`;
}

export function buildShareMessage(resourceName: string, url: string, hasPassword: boolean): string {
  const lines = [`I shared "${resourceName}" with you on ShareSync:`, url];
  if (hasPassword) lines.push('(It is password protected. I will send you the password separately.)');
  return lines.join('\n');
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}

/** Opens WhatsApp with the message ready to send (app if installed, otherwise WhatsApp Web). */
export async function shareViaWhatsApp(message: string): Promise<void> {
  const encoded = encodeURIComponent(message);
  if (Platform.OS !== 'web') {
    try {
      await Linking.openURL(`whatsapp://send?text=${encoded}`);
      return;
    } catch {
      // WhatsApp not installed: fall through to the web version
    }
  }
  await Linking.openURL(`https://wa.me/?text=${encoded}`);
}

/**
 * Opens the system share sheet with a text message (Telegram, Gmail, SMS, Messenger, ...).
 * Returns false when no share sheet exists (most desktop browsers); the caller should copy instead.
 */
export async function shareViaSystemSheet(message: string, title: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.share) return false;
    try {
      await nav.share({ title, text: message });
    } catch {
      // user cancelled
    }
    return true;
  }
  await Share.share({ message, title });
  return true;
}

/**
 * Sends the actual file (not a link) to another app such as WhatsApp.
 * Native: downloads the file then opens the share sheet with it.
 * Web: uses the Web Share API with files when supported, otherwise downloads it.
 */
export async function sendFileCopy(file: FileItem): Promise<'shared' | 'downloaded'> {
  if (Platform.OS !== 'web') {
    const downloaded = await fileService.downloadFile(file.id, file.name);
    if (!downloaded) throw new Error('Download failed.');
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(downloaded.uri, { mimeType: downloaded.mimeType, dialogTitle: file.name });
    return 'shared';
  }

  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  if (nav?.canShare) {
    // Fetch the bytes ourselves so we can hand them to the Web Share API
    const res = await fetch(`${getApiBaseUrl()}/api/files/${encodeURIComponent(file.id)}/download`, {
      headers: { Authorization: `Bearer ${await getAuthToken()}` },
    });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const webFile = new (window as any).File([blob], file.name, { type: file.mime_type || blob.type });
    if (nav.canShare({ files: [webFile] })) {
      try {
        await nav.share({ files: [webFile], title: file.name });
      } catch {
        // user cancelled
      }
      return 'shared';
    }
  }
  await fileService.downloadFile(file.id, file.name);
  return 'downloaded';
}
