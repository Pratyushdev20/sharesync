import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { FileItem, FolderItem } from '@/types/explorer';

interface MoveModalProps {
  file: FileItem | null;
  allFolders: FolderItem[];
  onLoadFolders: () => Promise<void>;
  onClose: () => void;
  onSubmit: (targetFolderId: string | null) => Promise<void>;
}

export function MoveModal({
  file,
  allFolders,
  onLoadFolders,
  onClose,
  onSubmit,
}: MoveModalProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingFolders, setFetchingFolders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();

  useEffect(() => {
    if (file) {
      // Default to root if file is currently in a folder, or null
      setSelectedTargetId(file.folder_id ? null : null);
      setError(null);
      setFetchingFolders(true);
      onLoadFolders().finally(() => setFetchingFolders(false));
    }
  }, [file, onLoadFolders]);

  if (!file) return null;

  const handleMove = async () => {
    if (String(file.folder_id || null) === String(selectedTargetId)) {
      setError('File is already in this location.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit(selectedTargetId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to move file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={!!file} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.background, borderColor: '#e2e8f0' }]}>
          <ThemedText type="subtitle" style={[styles.modalTitle, { color: theme.text }]}>
            Move File
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.modalSubtitle}>
            Select target folder for "{file.name}".
          </ThemedText>

          {error && (
            <View style={styles.errorBox}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          )}

          {fetchingFolders ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#2563eb" />
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 8 }}>
                Loading folders...
              </ThemedText>
            </View>
          ) : (
            <ScrollView style={styles.folderList} showsVerticalScrollIndicator={true}>
              {/* Root / Home Option */}
              <Pressable
                onPress={() => setSelectedTargetId(null)}
                style={[
                  styles.folderOption,
                  { backgroundColor: selectedTargetId === null ? '#eff6ff' : theme.backgroundElement },
                  selectedTargetId === null && styles.selectedOption,
                ]}
              >
                <ThemedText style={{ fontSize: 18, marginRight: 10 }}>🏠</ThemedText>
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold" style={{ color: selectedTargetId === null ? '#2563eb' : theme.text }}>
                    Home (Root Directory)
                  </ThemedText>
                  {file.folder_id === null && (
                    <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                      Current location
                    </ThemedText>
                  )}
                </View>
                {selectedTargetId === null && (
                  <ThemedText style={{ color: '#2563eb', fontWeight: 'bold' }}>✓</ThemedText>
                )}
              </Pressable>

              {/* Folder Options */}
              {allFolders.map((f) => {
                const isSelected = selectedTargetId === f.id;
                const isCurrent = file.folder_id === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setSelectedTargetId(f.id)}
                    style={[
                      styles.folderOption,
                      { backgroundColor: isSelected ? '#eff6ff' : theme.backgroundElement },
                      isSelected && styles.selectedOption,
                    ]}
                  >
                    <ThemedText style={{ fontSize: 18, marginRight: 10 }}>📁</ThemedText>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="smallBold" style={{ color: isSelected ? '#2563eb' : theme.text }}>
                        {f.name}
                      </ThemedText>
                      {isCurrent && (
                        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                          Current location
                        </ThemedText>
                      )}
                    </View>
                    {isSelected && (
                      <ThemedText style={{ color: '#2563eb', fontWeight: 'bold' }}>✓</ThemedText>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.buttonRow}>
            <Pressable
              onPress={onClose}
              disabled={loading}
              style={[styles.button, styles.cancelButton, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" style={{ color: theme.text }}>
                Cancel
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={handleMove}
              disabled={loading || fetchingFolders}
              style={[styles.button, styles.submitButton, (loading || fetchingFolders) && { opacity: 0.7 }]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <ThemedText type="smallBold" style={{ color: '#ffffff' }}>
                  Move Here
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
    maxWidth: 440,
    maxHeight: '80%',
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
  loadingBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderList: {
    maxHeight: 240,
    marginBottom: 16,
  },
  folderOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedOption: {
    borderWidth: 1,
    borderColor: '#2563eb',
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
