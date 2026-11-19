import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { FileItem, ViewMode } from '@/types/explorer';
import { formatFileSize, formatDate, getFileTypeInfo } from '@/utils/fileFormatters';

interface FileCardProps {
  file: FileItem;
  viewMode: ViewMode;
  onDownload: (file: FileItem) => void;
  onRename: (file: FileItem) => void;
  onMove: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
}

export function FileCard({
  file,
  viewMode,
  onDownload,
  onRename,
  onMove,
  onDelete,
}: FileCardProps) {
  const theme = useTheme();
  const fileTypeInfo = getFileTypeInfo(file.name, file.mime_type);

  if (viewMode === 'list') {
    return (
      <View style={[styles.listRow, { backgroundColor: theme.background, borderBottomColor: '#e2e8f0' }]}>
        <View style={styles.leftInfo}>
          <View style={[styles.fileIconBadge, { backgroundColor: `${fileTypeInfo.color}15` }]}>
            <ThemedText style={{ fontSize: 16 }}>📄</ThemedText>
          </View>
          <View style={styles.nameContainer}>
            <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.text }}>
              {file.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
              {formatFileSize(file.size)} • {fileTypeInfo.label} {file.updated_at ? `• ${formatDate(file.updated_at)}` : ''}
            </ThemedText>
          </View>
        </View>

        <View style={styles.actionButtons}>
          <Pressable
            onPress={() => onDownload(file)}
            style={({ pressed }) => [styles.miniActionButton, pressed && styles.pressed]}
            accessibilityLabel="Download file"
          >
            <ThemedText style={{ fontSize: 13 }}>⬇️</ThemedText>
          </Pressable>

          <Pressable
            onPress={() => onRename(file)}
            style={({ pressed }) => [styles.miniActionButton, pressed && styles.pressed]}
            accessibilityLabel="Rename file"
          >
            <ThemedText style={{ fontSize: 13 }}>✏️</ThemedText>
          </Pressable>

          <Pressable
            onPress={() => onMove(file)}
            style={({ pressed }) => [styles.miniActionButton, pressed && styles.pressed]}
            accessibilityLabel="Move file"
          >
            <ThemedText style={{ fontSize: 13 }}>↪️</ThemedText>
          </Pressable>

          <Pressable
            onPress={() => onDelete(file)}
            style={({ pressed }) => [styles.miniActionButton, pressed && styles.pressed]}
            accessibilityLabel="Delete file"
          >
            <ThemedText style={{ fontSize: 13 }}>🗑️</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  // Grid view
  return (
    <View style={[styles.gridCard, { backgroundColor: theme.backgroundElement, borderColor: '#e2e8f0' }]}>
      <View style={styles.gridTop}>
        <View style={[styles.fileIconBadgeLarge, { backgroundColor: `${fileTypeInfo.color}20` }]}>
          <ThemedText style={{ fontSize: 26 }}>📄</ThemedText>
        </View>

        <View style={styles.gridActions}>
          <Pressable onPress={() => onDownload(file)} style={styles.gridActionButton} hitSlop={6}>
            <ThemedText style={{ fontSize: 12 }}>⬇️</ThemedText>
          </Pressable>
          <Pressable onPress={() => onRename(file)} style={styles.gridActionButton} hitSlop={6}>
            <ThemedText style={{ fontSize: 12 }}>✏️</ThemedText>
          </Pressable>
          <Pressable onPress={() => onMove(file)} style={styles.gridActionButton} hitSlop={6}>
            <ThemedText style={{ fontSize: 12 }}>↪️</ThemedText>
          </Pressable>
          <Pressable onPress={() => onDelete(file)} style={styles.gridActionButton} hitSlop={6}>
            <ThemedText style={{ fontSize: 12 }}>🗑️</ThemedText>
          </Pressable>
        </View>
      </View>

      <View style={styles.gridBottom}>
        <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.text }}>
          {file.name}
        </ThemedText>
        <View style={styles.metaRow}>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
            {formatFileSize(file.size)}
          </ThemedText>
          <View style={[styles.typePill, { backgroundColor: `${fileTypeInfo.color}25` }]}>
            <ThemedText style={[styles.typePillText, { color: fileTypeInfo.color }]}>
              {fileTypeInfo.category.toUpperCase()}
            </ThemedText>
          </View>
        </View>
      </View>
    </View>
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
  fileIconBadge: {
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
  fileIconBadgeLarge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    maxWidth: 60,
    justifyContent: 'flex-end',
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  typePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typePillText: {
    fontSize: 9,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
