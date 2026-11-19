import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useFileExplorer, ExplorerMode } from '@/hooks/useFileExplorer';

import { BreadcrumbNav } from '@/components/explorer/BreadcrumbNav';
import { ExplorerToolbar } from '@/components/explorer/ExplorerToolbar';
import { FolderCard } from '@/components/explorer/FolderCard';
import { FileCard } from '@/components/explorer/FileCard';
import { EmptyState } from '@/components/explorer/EmptyState';

import { CreateFolderModal } from '@/components/explorer/modals/CreateFolderModal';
import { UploadModal } from '@/components/explorer/modals/UploadModal';
import { RenameModal } from '@/components/explorer/modals/RenameModal';
import { MoveModal } from '@/components/explorer/modals/MoveModal';
import { DeleteConfirmModal } from '@/components/explorer/modals/DeleteConfirmModal';
import { ShareModal } from '@/components/explorer/modals/ShareModal';
import { NoteEditorModal, NoteEditorTarget } from '@/components/notes/NoteEditorModal';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { FilePreviewModal } from '@/components/explorer/modals/FilePreviewModal';
import { FileItem } from '@/types/explorer';

const PERMISSION_LABEL: Record<string, string> = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' };

/**
 * File explorer used by both tabs:
 *  - mode "mine":   your own workspace (full control + sharing)
 *  - mode "shared": what other people shared with you (actions limited by your permission)
 */
export function FileExplorerScreen({ mode = 'mine' }: { mode?: ExplorerMode }) {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();

  const explorer = useFileExplorer(mode);
  const [noteEditor, setNoteEditor] = React.useState<NoteEditorTarget | null>(null);
  const [previewFile, setPreviewFile] = React.useState<FileItem | null>(null);

  const isShared = mode === 'shared';
  const atSharedTop = isShared && explorer.currentFolderId === null;
  // Can the user add/change things in the folder that is open right now?
  const canEditHere = explorer.currentAccess === 'owner' || explorer.currentAccess === 'editor';
  const canAddHere = !atSharedTop && canEditHere;

  const itemAccess = (type: 'file' | 'folder', id: string) =>
    atSharedTop ? explorer.sharedInfo[type + ':' + id]?.permission || 'viewer' : explorer.currentAccess;
  const sharedSubtitle = (type: 'file' | 'folder', id: string) => {
    if (!atSharedTop) return undefined;
    const info = explorer.sharedInfo[type + ':' + id];
    return info ? 'From ' + info.ownerName + ' • ' + PERMISSION_LABEL[info.permission] : undefined;
  };

  const insetsStyle = Platform.select({
    android: {
      paddingTop: safeAreaInsets.top + Spacing.two,
      paddingBottom: safeAreaInsets.bottom + Spacing.six,
    },
    ios: {
      paddingTop: safeAreaInsets.top,
      paddingBottom: safeAreaInsets.bottom + Spacing.six,
    },
    default: {
      paddingTop: Spacing.four,
      paddingBottom: Spacing.six,
    },
  });

  const itemCountText = `${explorer.folders.length} folder${explorer.folders.length === 1 ? '' : 's'}, ${explorer.files.length} file${explorer.files.length === 1 ? '' : 's'}`;
  const isEmpty = explorer.folders.length === 0 && explorer.files.length === 0 && explorer.notes.length === 0;

  return (
    <ThemedView style={styles.screenWrapper}>
      <ScrollView
        style={[styles.scrollView, { backgroundColor: theme.background }]}
        contentContainerStyle={[styles.scrollContent, insetsStyle]}
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl
            refreshing={explorer.refreshing}
            onRefresh={explorer.refresh}
            tintColor="#2563eb"
          />
        }
      >
        <View style={styles.centerContainer}>
          {/* Header Title */}
          <View style={styles.header}>
            <ThemedText type="subtitle" style={[styles.mainTitle, { color: theme.text }]}>
              {isShared ? 'Shared with me' : 'File Explorer'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {isShared
                ? atSharedTop
                  ? 'Files and folders other ShareSync users sent you'
                  : canEditHere
                    ? 'You can view and edit this shared folder'
                    : 'You can view and download from this shared folder'
                : 'Organize, upload and manage your cloud files'}
            </ThemedText>
            <SyncStatusBadge />
          </View>

          {/* Breadcrumb Navigation & Action Buttons */}
          <BreadcrumbNav
            breadcrumbs={explorer.breadcrumbs}
            onSelectBreadcrumb={explorer.navigateToBreadcrumb}
            onNavigateUp={explorer.navigateUp}
            onNewFolder={canAddHere ? () => explorer.setIsCreateFolderOpen(true) : undefined}
            onUpload={canAddHere ? () => explorer.setIsUploadModalOpen(true) : undefined}
          />

          {/* Toolbar: Search, Sort & View Mode */}
          <ExplorerToolbar
            searchQuery={explorer.searchQuery}
            onSearchChange={explorer.setSearchQuery}
            viewMode={explorer.viewMode}
            onViewModeToggle={() =>
              explorer.setViewMode((prev) => (prev === 'grid' ? 'list' : 'grid'))
            }
            sortField={explorer.sortField}
            sortDirection={explorer.sortDirection}
            onSortChange={(field) => {
              if (explorer.sortField === field) {
                explorer.setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
              } else {
                explorer.setSortField(field);
                explorer.setSortDirection('asc');
              }
            }}
            onRefresh={explorer.refresh}
            refreshing={explorer.refreshing}
            itemCountText={itemCountText}
          />

          {/* Error Banner */}
          {explorer.error && (
            <View style={styles.errorBanner}>
              <ThemedText style={styles.errorBannerText}>{explorer.error}</ThemedText>
              <Pressable onPress={explorer.refresh} style={styles.retryButton}>
                <ThemedText type="smallBold" style={{ color: '#b91c1c' }}>
                  Retry
                </ThemedText>
              </Pressable>
            </View>
          )}

          {/* Download Progress */}
          {explorer.downloadingFile && (
            <View style={styles.downloadBanner}>
              <View style={styles.downloadHeader}>
                <ThemedText type="smallBold" numberOfLines={1} style={styles.downloadTitle}>
                  Downloading "{explorer.downloadingFile.name}"
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: '#2563eb' }}>
                  {explorer.downloadProgress?.total ? `${explorer.downloadProgress.percent}%` : '...'}
                </ThemedText>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${explorer.downloadProgress?.total ? explorer.downloadProgress.percent : 15}%` },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Action result message (download saved / failed) */}
          {explorer.notice && (
            <View
              style={[
                styles.noticeBanner,
                explorer.notice.type === 'success' ? styles.noticeSuccess : styles.noticeError,
              ]}
            >
              <ThemedText
                style={[
                  styles.noticeText,
                  { color: explorer.notice.type === 'success' ? '#166534' : '#991b1b' },
                ]}
              >
                {explorer.notice.message}
              </ThemedText>
              <Pressable onPress={explorer.dismissNotice} hitSlop={8} accessibilityLabel="Dismiss message">
                <ThemedText type="smallBold" style={{ color: '#475569' }}>
                  ✕
                </ThemedText>
              </Pressable>
            </View>
          )}

          {/* Loading State */}
          {explorer.loading && !explorer.refreshing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563eb" />
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 12 }}>
                Loading directory...
              </ThemedText>
            </View>
          ) : isEmpty ? (
            /* Empty State */
            <EmptyState
              isSearch={explorer.searchQuery.trim().length > 0}
              onNewFolder={canAddHere ? () => explorer.setIsCreateFolderOpen(true) : undefined}
              onUpload={canAddHere ? () => explorer.setIsUploadModalOpen(true) : undefined}
              onClearSearch={() => explorer.setSearchQuery('')}
              title={atSharedTop ? 'Nothing shared with you yet' : undefined}
              message={
                atSharedTop
                  ? 'When someone shares a file or folder with your email, it appears here.'
                  : isShared && !canEditHere
                    ? 'This shared folder is empty.'
                    : undefined
              }
            />
          ) : (
            /* Content Area: Folders & Files */
            <View style={styles.contentArea}>
              {/* Folders Section */}
              {explorer.folders.length > 0 && (
                <View style={styles.section}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
                    FOLDERS ({explorer.folders.length})
                  </ThemedText>
                  <View style={explorer.viewMode === 'grid' ? styles.gridContainer : styles.listContainer}>
                    {explorer.folders.map((folder) => (
                      <FolderCard
                        key={folder.id}
                        folder={folder}
                        viewMode={explorer.viewMode}
                        onOpen={explorer.navigateToFolder}
                        subtitle={sharedSubtitle('folder', folder.id)}
                        onShare={!isShared ? (f) => explorer.setItemToShare({ type: 'folder', item: f }) : undefined}
                        onRename={
                          itemAccess('folder', folder.id) !== 'viewer'
                            ? (f) => explorer.setItemToRename({ type: 'folder', item: f })
                            : undefined
                        }
                        onDelete={
                          // A folder shared with you can only be deleted by its owner
                          !atSharedTop && itemAccess('folder', folder.id) !== 'viewer'
                            ? (f) => explorer.setItemToDelete({ type: 'folder', item: f })
                            : undefined
                        }
                      />
                    ))}
                  </View>
                </View>
              )}

              {/* Files Section */}
              {explorer.files.length > 0 && (
                <View style={styles.section}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
                    FILES ({explorer.files.length})
                  </ThemedText>
                  <View style={explorer.viewMode === 'grid' ? styles.gridContainer : styles.listContainer}>
                    {explorer.files.map((file) => (
                      <FileCard
                        key={file.id}
                        file={file}
                        viewMode={explorer.viewMode}
                        onDownload={explorer.handleDownloadFile}
                        onOpen={setPreviewFile}
                        subtitle={sharedSubtitle('file', file.id)}
                        onShare={!isShared ? (f) => explorer.setItemToShare({ type: 'file', item: f }) : undefined}
                        onRename={
                          itemAccess('file', file.id) !== 'viewer'
                            ? (f) => explorer.setItemToRename({ type: 'file', item: f })
                            : undefined
                        }
                        onMove={!isShared ? explorer.setFileToMove : undefined}
                        onDelete={
                          !atSharedTop && itemAccess('file', file.id) !== 'viewer'
                            ? (f) => explorer.setItemToDelete({ type: 'file', item: f })
                            : undefined
                        }
                        onReplace={
                          itemAccess('file', file.id) !== 'viewer'
                            ? (f) => {
                                explorer.setFileToReplace(f);
                                explorer.setIsUploadModalOpen(true);
                              }
                            : undefined
                        }
                        onToggleOffline={explorer.offlineSupported ? explorer.toggleOffline : undefined}
                        isOffline={explorer.offlineIds.has(String(file.id))}
                      />
                    ))}
                  </View>
                </View>
              )}

              {/* Notes Section */}
              {explorer.notes.length > 0 && (
                <View style={styles.section}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
                    NOTES & DOCUMENTS ({explorer.notes.length})
                  </ThemedText>
                  {explorer.notes.map((n) => (
                    <Pressable
                      key={n.id}
                      onPress={() => setNoteEditor({ noteId: n.id })}
                      style={({ pressed }) => [styles.noteRow, { backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.8 }]}
                    >
                      <ThemedText style={{ fontSize: 16 }}>{n.kind === 'document' ? '📄' : '📝'}</ThemedText>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.text }}>{n.title}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ fontSize: 11 }}>
                          {n.pending ? 'Waiting to sync • ' : ''}{n.preview || 'Empty'}
                        </ThemedText>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          {canAddHere && !explorer.loading && (
            <View style={styles.noteActions}>
              <Pressable onPress={() => setNoteEditor({ folderId: explorer.currentFolderId, kind: 'note' })} style={styles.noteButton}>
                <ThemedText type="smallBold" style={{ color: '#1d4ed8' }}>+ Note here</ThemedText>
              </Pressable>
              <Pressable onPress={() => setNoteEditor({ folderId: explorer.currentFolderId, kind: 'document' })} style={styles.noteButton}>
                <ThemedText type="smallBold" style={{ color: '#1d4ed8' }}>+ Document here</ThemedText>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modals */}
      <CreateFolderModal
        visible={explorer.isCreateFolderOpen}
        onClose={() => explorer.setIsCreateFolderOpen(false)}
        onSubmit={explorer.handleCreateFolder}
      />

      <UploadModal
        visible={explorer.isUploadModalOpen}
        uploading={explorer.uploading}
        uploadProgress={explorer.uploadProgress}
        onClose={() => {
          explorer.setIsUploadModalOpen(false);
          explorer.setFileToReplace(null);
        }}
        onUpload={explorer.fileToReplace ? explorer.handleReplaceFile : explorer.handleUploadFile}
        replaceTargetName={explorer.fileToReplace?.name ?? null}
      />

      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={(f) => explorer.handleDownloadFile(f)}
      />

      <NoteEditorModal
        target={noteEditor}
        onClose={(changed) => {
          setNoteEditor(null);
          if (changed) explorer.refresh();
        }}
      />

      <RenameModal
        item={explorer.itemToRename}
        onClose={() => explorer.setItemToRename(null)}
        onSubmit={explorer.handleRename}
      />

      <MoveModal
        file={explorer.fileToMove}
        allFolders={explorer.allFolders}
        onLoadFolders={explorer.loadAllFolders}
        onClose={() => explorer.setFileToMove(null)}
        onSubmit={explorer.handleMoveFile}
      />

      <ShareModal target={explorer.itemToShare} onClose={() => explorer.setItemToShare(null)} />

      <DeleteConfirmModal
        item={explorer.itemToDelete}
        onClose={() => explorer.setItemToDelete(null)}
        onConfirm={explorer.handleDelete}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    flexGrow: 1,
  },
  centerContainer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingBottom: 40,
  },
  header: {
    marginBottom: 8,
  },
  mainTitle: {
    fontSize: 26,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorBannerText: {
    color: '#991b1b',
    flex: 1,
    fontSize: 13,
  },
  retryButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    marginLeft: 8,
  },
  downloadBanner: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  downloadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  downloadTitle: {
    color: '#1e3a8a',
    flex: 1,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#dbeafe',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 3,
  },
  noticeBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  noticeSuccess: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  noticeError: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentArea: {
    marginTop: 12,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  noteActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  noteButton: {
    borderWidth: 1,
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  listContainer: {
    flexDirection: 'column',
  },
});
