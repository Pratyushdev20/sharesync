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
import { useFileExplorer } from '@/hooks/useFileExplorer';

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

export default function FileExplorerScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();

  const explorer = useFileExplorer();

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
  const isEmpty = explorer.folders.length === 0 && explorer.files.length === 0;

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
              File Explorer
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Organize, upload and manage your cloud files
            </ThemedText>
          </View>

          {/* Breadcrumb Navigation & Action Buttons */}
          <BreadcrumbNav
            breadcrumbs={explorer.breadcrumbs}
            onSelectBreadcrumb={explorer.navigateToBreadcrumb}
            onNavigateUp={explorer.navigateUp}
            onNewFolder={() => explorer.setIsCreateFolderOpen(true)}
            onUpload={() => explorer.setIsUploadModalOpen(true)}
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
              onNewFolder={() => explorer.setIsCreateFolderOpen(true)}
              onUpload={() => explorer.setIsUploadModalOpen(true)}
              onClearSearch={() => explorer.setSearchQuery('')}
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
                        onRename={(f) => explorer.setItemToRename({ type: 'folder', item: f })}
                        onDelete={(f) => explorer.setItemToDelete({ type: 'folder', item: f })}
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
                        onRename={(f) => explorer.setItemToRename({ type: 'file', item: f })}
                        onMove={explorer.setFileToMove}
                        onDelete={(f) => explorer.setItemToDelete({ type: 'file', item: f })}
                      />
                    ))}
                  </View>
                </View>
              )}
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
        onClose={() => explorer.setIsUploadModalOpen(false)}
        onUpload={explorer.handleUploadFile}
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
  listContainer: {
    flexDirection: 'column',
  },
});
