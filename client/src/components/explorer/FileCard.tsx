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
  /** Each optional action is only shown when provided (i.e. when the user has permission). */
  onRename?: (file: FileItem) => void;
  onMove?: (file: FileItem) => void;
  onDelete?: (file: FileItem) => void;
  onShare?: (file: FileItem) => void;
  /** Tap the file to open the in-app preview */
  onOpen?: (file: FileItem) => void;
  /** Upload a new version (owner/editor) */
  onReplace?: (file: FileItem) => void;
  /** Keep / stop keeping a copy on this device (mobile only) */
  onToggleOffline?: (file: FileItem) => void;
  isOffline?: boolean;
  /** Extra line under the name, e.g. "Shared by Rahul • Viewer". */
  subtitle?: string;
}

export function FileCard({
  file,
  viewMode,
  onDownload,
  onRename,
  onMove,
  onDelete,
  onShare,
  onOpen,
  onReplace,
  onToggleOffline,
  isOffline,
  subtitle,
}: FileCardProps) {
  const theme = useTheme();
  const fileTypeInfo = getFileTypeInfo(file.name, file.mime_type);

  if (viewMode === 'list') {
    return (
      <View style={[styles.listRow, { backgroundColor: theme.background, borderBottomColor: '#e2e8f0' }]}>
        <Pressable style={styles.leftInfo} onPress={onOpen ? () => onOpen(file) : undefined} disabled={!onOpen} accessibilityRole="button" accessibilityLabel={`Preview ${file.name}`}>
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
            {!!subtitle && (
              <ThemedText type="small" numberOfLines={1} style={{ fontSize: 11, color: '#2563eb' }}>
                {subtitle}
              </ThemedText>
            )}
          </View>
        </Pressable>

        <View style={styles.actionButtons}>
          <Pressable
            onPress={() => onDownload(file)}
            style={({ pressed }) => [styles.miniActionButton, pressed && styles.pressed]}
            accessibilityLabel="Download file"
          >
            <ThemedText style={{ fontSize: 13 }}>⬇️</ThemedText>
          </Pressable>

          {onShare && (
            <Pressable
              onPress={() => onShare(file)}
              style={({ pressed }) => [styles.miniActionButton, pressed && styles.pressed]}
              accessibilityLabel="Share file"
            >
              <ThemedText style={{ fontSize: 13 }}>🔗</ThemedText>
            </Pressable>
          )}

          {onReplace && (
            <Pressable
              onPress={() => onReplace(file)}
              style={({ pressed }) => [styles.miniActionButton, pressed && styles.pressed]}
              accessibilityLabel="Upload new version"
            >
              <ThemedText style={{ fontSize: 13 }}>⟳</ThemedText>
            </Pressable>
          )}

          {onToggleOffline && (
            <Pressable
              onPress={() => onToggleOffline(file)}
              style={({ pressed }) => [styles.miniActionButton, isOffline && { backgroundColor: '#dcfce7' }, pressed && styles.pressed]}
              accessibilityLabel={isOffline ? 'Remove offline copy' : 'Make available offline'}
            >
              <ThemedText style={{ fontSize: 13 }}>{isOffline ? '✅' : '📥'}</ThemedText>
            </Pressable>
          )}

          {onRename && (
            <Pressable
              onPress={() => onRename(file)}
              style={({ pressed }) => [styles.miniActionButton, pressed && styles.pressed]}
              accessibilityLabel="Rename file"
            >
              <ThemedText style={{ fontSize: 13 }}>✏️</ThemedText>
            </Pressable>
          )}

          {onMove && (
            <Pressable
              onPress={() => onMove(file)}
              style={({ pressed }) => [styles.miniActionButton, pressed && styles.pressed]}
              accessibilityLabel="Move file"
            >
              <ThemedText style={{ fontSize: 13 }}>↪️</ThemedText>
            </Pressable>
          )}

          {onDelete && (
            <Pressable
              onPress={() => onDelete(file)}
              style={({ pressed }) => [styles.miniActionButton, pressed && styles.pressed]}
              accessibilityLabel="Delete file"
            >
              <ThemedText style={{ fontSize: 13 }}>🗑️</ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // Grid view
  return (
    <View style={[styles.gridCard, { backgroundColor: theme.backgroundElement, borderColor: '#e2e8f0' }]}>
      <View style={styles.gridTop}>
        <Pressable onPress={onOpen ? () => onOpen(file) : undefined} disabled={!onOpen} accessibilityLabel={`Preview ${file.name}`} style={[styles.fileIconBadgeLarge, { backgroundColor: `${fileTypeInfo.color}20` }]}>
          <ThemedText style={{ fontSize: 26 }}>📄</ThemedText>
        </Pressable>

        <View style={styles.gridActions}>
          <Pressable onPress={() => onDownload(file)} style={styles.gridActionButton} hitSlop={6}>
            <ThemedText style={{ fontSize: 12 }}>⬇️</ThemedText>
          </Pressable>
          {onShare && (
            <Pressable onPress={() => onShare(file)} style={styles.gridActionButton} hitSlop={6} accessibilityLabel="Share file">
              <ThemedText style={{ fontSize: 12 }}>🔗</ThemedText>
            </Pressable>
          )}
          {onReplace && (
            <Pressable onPress={() => onReplace(file)} style={styles.gridActionButton} hitSlop={6} accessibilityLabel="Upload new version">
              <ThemedText style={{ fontSize: 12 }}>⟳</ThemedText>
            </Pressable>
          )}
          {onToggleOffline && (
            <Pressable
              onPress={() => onToggleOffline(file)}
              style={[styles.gridActionButton, isOffline && { backgroundColor: '#dcfce7' }]}
              hitSlop={6}
              accessibilityLabel={isOffline ? 'Remove offline copy' : 'Make available offline'}
            >
              <ThemedText style={{ fontSize: 12 }}>{isOffline ? '✅' : '📥'}</ThemedText>
            </Pressable>
          )}
          {onRename && (
            <Pressable onPress={() => onRename(file)} style={styles.gridActionButton} hitSlop={6}>
              <ThemedText style={{ fontSize: 12 }}>✏️</ThemedText>
            </Pressable>
          )}
          {onMove && (
            <Pressable onPress={() => onMove(file)} style={styles.gridActionButton} hitSlop={6}>
              <ThemedText style={{ fontSize: 12 }}>↪️</ThemedText>
            </Pressable>
          )}
          {onDelete && (
            <Pressable onPress={() => onDelete(file)} style={styles.gridActionButton} hitSlop={6}>
              <ThemedText style={{ fontSize: 12 }}>🗑️</ThemedText>
            </Pressable>
          )}
        </View>
      </View>

      <Pressable style={styles.gridBottom} onPress={onOpen ? () => onOpen(file) : undefined} disabled={!onOpen}>
        <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.text }}>
          {file.name}
        </ThemedText>
        {!!subtitle && (
          <ThemedText type="small" numberOfLines={1} style={{ fontSize: 11, color: '#2563eb', marginTop: 2 }}>
            {subtitle}
          </ThemedText>
        )}
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
      </Pressable>
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
