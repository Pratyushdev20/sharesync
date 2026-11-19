import React, { useState } from 'react';
import { View, StyleSheet, Modal, Pressable, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { FileItem, FolderItem } from '@/types/explorer';

interface DeleteConfirmModalProps {
  item: { type: 'file' | 'folder'; item: FileItem | FolderItem } | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteConfirmModal({ item, onClose, onConfirm }: DeleteConfirmModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();

  if (!item) return null;

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete item.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setError(null);
    onClose();
  };

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.background, borderColor: '#e2e8f0' }]}>
          <ThemedText type="subtitle" style={[styles.modalTitle, { color: '#dc2626' }]}>
            Delete {item.type === 'folder' ? 'Folder' : 'File'}?
          </ThemedText>

          <ThemedText type="default" style={[styles.modalSubtitle, { color: theme.text }]}>
            Are you sure you want to permanently delete "{item.item.name}"?
          </ThemedText>

          {item.type === 'folder' && (
            <View style={styles.warningBox}>
              <ThemedText style={styles.warningText}>
                ⚠️ Note: Folders containing files or subfolders cannot be deleted until emptied.
              </ThemedText>
            </View>
          )}

          {error && (
            <View style={styles.errorBox}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          )}

          <View style={styles.buttonRow}>
            <Pressable
              onPress={handleClose}
              disabled={loading}
              style={[styles.button, styles.cancelButton, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" style={{ color: theme.text }}>
                Cancel
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={handleDelete}
              disabled={loading}
              style={[styles.button, styles.deleteButton, loading && { opacity: 0.7 }]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <ThemedText type="smallBold" style={{ color: '#ffffff' }}>
                  Delete
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalSubtitle: {
    marginBottom: 12,
    lineHeight: 22,
  },
  warningBox: {
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  warningText: {
    color: '#b45309',
    fontSize: 12,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 84,
    alignItems: 'center',
  },
  cancelButton: {},
  deleteButton: {
    backgroundColor: '#dc2626',
  },
});
