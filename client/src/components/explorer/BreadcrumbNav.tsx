import React from 'react';
import { View, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { BreadcrumbItem } from '@/types/explorer';

interface BreadcrumbNavProps {
  breadcrumbs: BreadcrumbItem[];
  onSelectBreadcrumb: (index: number) => void;
  onNavigateUp: () => void;
  /** Hidden when not provided (e.g. read-only shared folders). */
  onNewFolder?: () => void;
  onUpload?: () => void;
}

export function BreadcrumbNav({
  breadcrumbs,
  onSelectBreadcrumb,
  onNavigateUp,
  onNewFolder,
  onUpload,
}: BreadcrumbNavProps) {
  const theme = useTheme();
  const canGoUp = breadcrumbs.length > 1;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        {/* Navigation Breadcrumb Path */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.breadcrumbList}
        >
          {canGoUp && (
            <Pressable
              onPress={onNavigateUp}
              style={({ pressed }) => [
                styles.backButton,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
              accessibilityLabel="Go to parent folder"
            >
              <ThemedText type="smallBold" style={{ color: '#2563eb' }}>
                ← Up
              </ThemedText>
            </Pressable>
          )}

          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <View key={`${crumb.id || 'root'}-${index}`} style={styles.crumbItem}>
                <Pressable
                  onPress={() => onSelectBreadcrumb(index)}
                  disabled={isLast}
                  style={({ pressed }) => [
                    styles.crumbPressable,
                    pressed && !isLast && styles.pressed,
                  ]}
                >
                  <ThemedText
                    type={isLast ? 'smallBold' : 'small'}
                    style={[
                      styles.crumbText,
                      isLast
                        ? { color: theme.text }
                        : { color: '#2563eb' },
                    ]}
                    numberOfLines={1}
                  >
                    {crumb.name}
                  </ThemedText>
                </Pressable>
                {!isLast && (
                  <ThemedText style={styles.separator} themeColor="textSecondary">
                    /
                  </ThemedText>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Action Buttons: New Folder & Upload */}
        <View style={styles.actionGroup}>
          {onNewFolder && (
            <Pressable
              onPress={onNewFolder}
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: '#cbd5e1', backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText type="smallBold" style={{ color: theme.text }}>
                + Folder
              </ThemedText>
            </Pressable>
          )}

          {onUpload && (
            <Pressable
              onPress={onUpload}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText type="smallBold" style={{ color: '#ffffff' }}>
                ↑ Upload
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  breadcrumbList: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  crumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crumbPressable: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 4,
  },
  crumbText: {
    maxWidth: 160,
  },
  separator: {
    marginHorizontal: 4,
    fontSize: 14,
    opacity: 0.5,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
