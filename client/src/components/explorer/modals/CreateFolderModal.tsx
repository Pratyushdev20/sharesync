import React, { useState } from 'react';
import { View, StyleSheet, Modal, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

interface CreateFolderModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export function CreateFolderModal({ visible, onClose, onSubmit }: CreateFolderModalProps) {
  const [folderName, setFolderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();

  const handleCreate = async () => {
    const trimmed = folderName.trim();
    if (!trimmed) {
      setError('Folder name cannot be empty.');
      return;
    }
    if (trimmed.length > 255) {
      setError('Folder name cannot exceed 255 characters.');
      return;
    }
    if (/[\/\\\x00-\x1f\x7f]/.test(trimmed) || trimmed === '.' || trimmed === '..') {
      setError('Folder name contains invalid characters (/ \\ . ..).');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setFolderName('');
    } catch (err: any) {
      setError(err.message || 'Failed to create folder.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setFolderName('');
    setError(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.background, borderColor: '#e2e8f0' }]}>
          <ThemedText type="subtitle" style={[styles.modalTitle, { color: theme.text }]}>
            New Folder
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.modalSubtitle}>
            Enter a name for the new folder.
          </ThemedText>

          {error && (
            <View style={styles.errorBox}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          )}

          <TextInput
            value={folderName}
            onChangeText={(text) => {
              setFolderName(text);
              if (error) setError(null);
            }}
            placeholder="Folder Name"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: '#cbd5e1' }]}
            autoFocus
            autoCapitalize="sentences"
            onSubmitEditing={handleCreate}
          />

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
              onPress={handleCreate}
              disabled={loading}
              style={[styles.button, styles.submitButton, loading && { opacity: 0.7 }]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <ThemedText type="smallBold" style={{ color: '#ffffff' }}>
                  Create
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
    marginBottom: 4,
  },
  modalSubtitle: {
    marginBottom: 16,
  },
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
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
  submitButton: {
    backgroundColor: '#2563eb',
  },
});
