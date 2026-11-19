import React, { useState, useRef } from 'react';
import { View, StyleSheet, Modal, Pressable, ActivityIndicator, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { SelectedFile, fileService } from '@/services/file.service';
import { UploadProgress } from '@/types/explorer';
import { formatFileSize } from '@/utils/fileFormatters';

interface UploadModalProps {
  visible: boolean;
  uploading: boolean;
  uploadProgress: UploadProgress | null;
  onClose: () => void;
  onUpload: (file: SelectedFile) => Promise<void>;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function UploadModal({
  visible,
  uploading,
  uploadProgress,
  onClose,
  onUpload,
}: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const theme = useTheme();

  const handleSelectWebFile = (e: any) => {
    const files = e.target?.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    if (file.size > MAX_FILE_SIZE) {
      setError(`File exceeds the maximum limit of 50MB (${formatFileSize(file.size)}).`);
      setSelectedFile(null);
      return;
    }

    setError(null);
    setSelectedFile({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      fileObject: file,
    });
  };

  const triggerFilePicker = async () => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click();
      return;
    }

    // Android / iOS: open the system document picker
    try {
      const picked = await fileService.pickNativeFile();
      if (!picked) return; // user cancelled

      if (picked.size !== undefined && picked.size > MAX_FILE_SIZE) {
        setError(`File exceeds the maximum limit of 50MB (${formatFileSize(picked.size)}).`);
        setSelectedFile(null);
        return;
      }

      setError(null);
      setSelectedFile(picked);
    } catch (err: any) {
      setError(err?.message || 'Could not open the file picker.');
    }
  };

  const actionVerb = Platform.OS === 'web' ? 'Click' : 'Tap';

  const handleStartUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file to upload.');
      return;
    }
    setError(null);
    try {
      await onUpload(selectedFile);
      setSelectedFile(null);
    } catch (err: any) {
      setError(err.message || 'File upload failed.');
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setSelectedFile(null);
    setError(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.background, borderColor: '#e2e8f0' }]}>
          <ThemedText type="subtitle" style={[styles.modalTitle, { color: theme.text }]}>
            Upload File
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.modalSubtitle}>
            Select a document, image, audio, video or archive (Max 50MB).
          </ThemedText>

          {/* Hidden Web File Input */}
          {Platform.OS === 'web' && (
            <input
              type="file"
              ref={fileInputRef as any}
              style={{ display: 'none' }}
              onChange={handleSelectWebFile}
            />
          )}

          {error && (
            <View style={styles.errorBox}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          )}

          {/* File Selector Dropzone Area */}
          <Pressable
            onPress={triggerFilePicker}
            disabled={uploading}
            style={({ pressed }) => [
              styles.dropzone,
              { backgroundColor: theme.backgroundElement, borderColor: selectedFile ? '#2563eb' : '#cbd5e1' },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText style={{ fontSize: 32, marginBottom: 8 }}>
              {selectedFile ? '📄' : '📁'}
            </ThemedText>
            {selectedFile ? (
              <View style={styles.selectedFileInfo}>
                <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.text }}>
                  {selectedFile.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 2 }}>
                  {formatFileSize(selectedFile.size)} • {selectedFile.type || 'Unknown type'}
                </ThemedText>
                <ThemedText type="small" style={{ color: '#2563eb', marginTop: 8 }}>
                  {actionVerb} to choose a different file
                </ThemedText>
              </View>
            ) : (
              <View style={styles.dropzonePlaceholder}>
                <ThemedText type="smallBold" style={{ color: theme.text }}>
                  {actionVerb} to browse files
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 4 }}>
                  Supports PDF, Office, images, audio, video & text
                </ThemedText>
              </View>
            )}
          </Pressable>

          {/* Upload Progress Bar */}
          {uploading && uploadProgress && (
            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <ThemedText type="smallBold" style={{ color: '#2563eb' }}>
                  Uploading... {uploadProgress.percent}%
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatFileSize(uploadProgress.loaded)} / {formatFileSize(uploadProgress.total)}
                </ThemedText>
              </View>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${uploadProgress.percent}%` }]} />
              </View>
            </View>
          )}

          {/* Modal Action Buttons */}
          <View style={styles.buttonRow}>
            <Pressable
              onPress={handleClose}
              disabled={uploading}
              style={[styles.button, styles.cancelButton, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold" style={{ color: theme.text }}>
                Cancel
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={handleStartUpload}
              disabled={!selectedFile || uploading}
              style={[
                styles.button,
                styles.submitButton,
                (!selectedFile || uploading) && { opacity: 0.6 },
              ]}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <ThemedText type="smallBold" style={{ color: '#ffffff' }}>
                  Upload
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
    maxWidth: 460,
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
  dropzone: {
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  selectedFileInfo: {
    alignItems: 'center',
    maxWidth: '90%',
  },
  dropzonePlaceholder: {
    alignItems: 'center',
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 4,
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
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  cancelButton: {},
  submitButton: {
    backgroundColor: '#2563eb',
  },
  pressed: {
    opacity: 0.75,
  },
});
