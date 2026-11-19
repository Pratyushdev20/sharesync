import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

interface EmptyStateProps {
  isSearch: boolean;
  onNewFolder: () => void;
  onUpload: () => void;
  onClearSearch: () => void;
}

export function EmptyState({
  isSearch,
  onNewFolder,
  onUpload,
  onClearSearch,
}: EmptyStateProps) {
  const theme = useTheme();

  if (isSearch) {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.icon}>🔍</ThemedText>
        <ThemedText type="subtitle" style={[styles.title, { color: theme.text }]}>
          No matches found
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          No files or folders matched your search query in this location.
        </ThemedText>
        <Pressable
          onPress={onClearSearch}
          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
          <ThemedText type="smallBold" style={{ color: '#ffffff' }}>
            Clear Search
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.iconBadge, { backgroundColor: '#eff6ff' }]}>
        <ThemedText style={{ fontSize: 36 }}>📂</ThemedText>
      </View>
      <ThemedText type="subtitle" style={[styles.title, { color: theme.text }]}>
        This folder is empty
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
        Upload documents, images, and files or create subfolders to organize your files.
      </ThemedText>

      <View style={styles.buttonRow}>
        <Pressable
          onPress={onUpload}
          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
          <ThemedText type="smallBold" style={{ color: '#ffffff' }}>
            ↑ Upload File
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={onNewFolder}
          style={({ pressed }) => [
            styles.secondaryButton,
            { borderColor: '#cbd5e1', backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}
        >
          <ThemedText type="smallBold" style={{ color: theme.text }}>
            + New Folder
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 40,
    marginBottom: 12,
  },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 360,
    marginBottom: 24,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  actionButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  secondaryButton: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.75,
  },
});
