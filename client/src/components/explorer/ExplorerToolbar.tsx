import React from 'react';
import { View, StyleSheet, TextInput, Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { ViewMode, SortField, SortDirection } from '@/types/explorer';

interface ExplorerToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: ViewMode;
  onViewModeToggle: () => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField) => void;
  onRefresh: () => void;
  refreshing: boolean;
  itemCountText: string;
}

export function ExplorerToolbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeToggle,
  sortField,
  sortDirection,
  onSortChange,
  onRefresh,
  refreshing,
  itemCountText,
}: ExplorerToolbarProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: '#cbd5e1' }]}>
        <ThemedText style={styles.searchIcon} themeColor="textSecondary">
          🔍
        </ThemedText>
        <TextInput
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search files and folders..."
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              ✕
            </ThemedText>
          </Pressable>
        )}
      </View>

      {/* Controls: Info + Sort + View Mode + Refresh */}
      <View style={styles.rightControls}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.countText}>
          {itemCountText}
        </ThemedText>

        {/* Sort Button */}
        <Pressable
          onPress={() => {
            const fields: SortField[] = ['name', 'updated_at', 'size'];
            const nextIndex = (fields.indexOf(sortField) + 1) % fields.length;
            onSortChange(fields[nextIndex]);
          }}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}
          accessibilityLabel={`Sort by ${sortField}`}
        >
          <ThemedText type="smallBold" style={{ color: theme.text }}>
            {sortField === 'name' ? 'Aa' : sortField === 'size' ? 'Size' : 'Date'} {sortDirection === 'asc' ? '↑' : '↓'}
          </ThemedText>
        </Pressable>

        {/* View Mode Toggle Button */}
        <Pressable
          onPress={onViewModeToggle}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}
          accessibilityLabel={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
        >
          <ThemedText type="smallBold" style={{ color: theme.text }}>
            {viewMode === 'grid' ? '⊞ Grid' : '☰ List'}
          </ThemedText>
        </Pressable>

        {/* Refresh Button */}
        <Pressable
          onPress={onRefresh}
          disabled={refreshing}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
            refreshing && { opacity: 0.5 },
          ]}
          accessibilityLabel="Refresh folder"
        >
          <ThemedText type="smallBold" style={{ color: theme.text }}>
            {refreshing ? '...' : '↻'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  searchBox: {
    flex: 1,
    minWidth: 200,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countText: {
    marginRight: 4,
    fontSize: 12,
  },
  iconButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
