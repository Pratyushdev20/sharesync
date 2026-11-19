import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { FolderItem, ViewMode } from '@/types/explorer';
import { formatDate } from '@/utils/fileFormatters';

interface FolderCardProps {
  folder: FolderItem;
  viewMode: ViewMode;
  onOpen: (folder: FolderItem) => void;
  onRename: (folder: FolderItem) => void;
  onDelete: (folder: FolderItem) => void;
}

export function FolderCard({
  folder,
  viewMode,
  onOpen,
  onRename,
  onDelete,
}: FolderCardProps) {
  const theme = useTheme();

  if (viewMode === 'list') {
    return (
      <Pressable
        onPress={() => onOpen(folder)}
        style={({ pressed }) => [
          styles.listRow,
          { backgroundColor: theme.background, borderBottomColor: '#e2e8f0' },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.leftInfo}>
          <View style={[styles.folderIconBadge, { backgroundColor: '#eff6ff' }]}>
            <ThemedText style={{ fontSize: 18 }}>📁</ThemedText>
          </View>
          <View style={styles.nameContainer}>
            <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.text }}>
              {folder.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
              Folder {folder.updated_at ? `• ${formatDate(folder.updated_at)}` : ''}
            </ThemedText>
          </View>
        </View>

        <View style={styles.actionButtons}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onRename(folder);
            }}
            style={({ pressed }) => [styles.miniActionButton, pressed && styles.pressed]}
            accessibilityLabel="Rename folder"
          >
            <ThemedText style={{ fontSize: 13 }}>✏️</ThemedText>
          </Pressable>

          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onDelete(folder);
            }}
            style={({ pressed }) => [styles.miniActionButton, pressed && styles.pressed]}
            accessibilityLabel="Delete folder"
          >
            <ThemedText style={{ fontSize: 13 }}>🗑️</ThemedText>
          </Pressable>
        </View>
      </Pressable>
    );
  }

  // Grid view
  return (
    <Pressable
      onPress={() => onOpen(folder)}
      style={({ pressed }) => [
        styles.gridCard,
        { backgroundColor: theme.backgroundElement, borderColor: '#e2e8f0' },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.gridTop}>
        <View style={[styles.folderIconBadgeLarge, { backgroundColor: '#dbeafe' }]}>
          <ThemedText style={{ fontSize: 28 }}>📁</ThemedText>
        </View>

        <View style={styles.gridActions}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onRename(folder);
            }}
            style={styles.gridActionButton}
            hitSlop={6}
          >
            <ThemedText style={{ fontSize: 12 }}>✏️</ThemedText>
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onDelete(folder);
            }}
            style={styles.gridActionButton}
            hitSlop={6}
          >
            <ThemedText style={{ fontSize: 12 }}>🗑️</ThemedText>
          </Pressable>
        </View>
      </View>

      <View style={styles.gridBottom}>
        <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.text }}>
          {folder.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, marginTop: 2 }}>
          Folder
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  leftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  folderIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  nameContainer: {
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniActionButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  gridCard: {
    width: '48%',
    minWidth: 140,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  gridTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  folderIconBadgeLarge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridActions: {
    flexDirection: 'row',
    gap: 4,
  },
  gridActionButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  gridBottom: {
    marginTop: 4,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
});
