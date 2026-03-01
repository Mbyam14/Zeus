import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore } from '../../store/themeStore';

interface StorageInfo {
  recipes: number;
  mealPlans: number;
  pantryItems: number;
  cachedImages: string;
  totalStorage: string;
}

export const DataStorageScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useThemeStore();
  const [loading, setLoading] = useState(false);

  // Mock storage data - in a real app, this would come from the device
  const [storageInfo] = useState<StorageInfo>({
    recipes: 24,
    mealPlans: 8,
    pantryItems: 47,
    cachedImages: '12.4 MB',
    totalStorage: '18.2 MB',
  });

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear cached images and temporary data. Your saved recipes and meal plans will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: () => {
            setLoading(true);
            setTimeout(() => {
              setLoading(false);
              Alert.alert('Success', 'Cache cleared successfully.');
            }, 1500);
          },
        },
      ]
    );
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Recipe History',
      'This will clear your recently viewed recipes. Your saved and liked recipes will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: () => Alert.alert('Success', 'Recipe history cleared.'),
        },
      ]
    );
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Data & Storage</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Storage Overview */}
        <View style={styles.storageOverview}>
          <Text style={styles.storageTitle}>Storage Used</Text>
          <Text style={styles.storageValue}>{storageInfo.totalStorage}</Text>
          <View style={styles.storageBar}>
            <View style={[styles.storageBarFill, { width: '35%' }]} />
          </View>
          <Text style={styles.storageSubtext}>of 50 MB local storage</Text>
        </View>

        {/* Data Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DATA BREAKDOWN</Text>
          <View style={styles.sectionContent}>
            <View style={styles.dataItem}>
              <View style={styles.dataItemLeft}>
                <Text style={styles.dataIcon}>📖</Text>
                <Text style={styles.dataLabel}>Saved Recipes</Text>
              </View>
              <Text style={styles.dataValue}>{storageInfo.recipes} items</Text>
            </View>
            <View style={styles.dataItem}>
              <View style={styles.dataItemLeft}>
                <Text style={styles.dataIcon}>📅</Text>
                <Text style={styles.dataLabel}>Meal Plans</Text>
              </View>
              <Text style={styles.dataValue}>{storageInfo.mealPlans} plans</Text>
            </View>
            <View style={styles.dataItem}>
              <View style={styles.dataItemLeft}>
                <Text style={styles.dataIcon}>🥫</Text>
                <Text style={styles.dataLabel}>Pantry Items</Text>
              </View>
              <Text style={styles.dataValue}>{storageInfo.pantryItems} items</Text>
            </View>
            <View style={[styles.dataItem, styles.lastDataItem]}>
              <View style={styles.dataItemLeft}>
                <Text style={styles.dataIcon}>🖼️</Text>
                <Text style={styles.dataLabel}>Cached Images</Text>
              </View>
              <Text style={styles.dataValue}>{storageInfo.cachedImages}</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MANAGE DATA</Text>
          <View style={styles.sectionContent}>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={handleClearCache}
              disabled={loading}
            >
              <View style={styles.actionItemLeft}>
                <Text style={styles.actionIcon}>🗑️</Text>
                <View style={styles.actionTextContainer}>
                  <Text style={styles.actionLabel}>Clear Cache</Text>
                  <Text style={styles.actionDescription}>Free up {storageInfo.cachedImages} of space</Text>
                </View>
              </View>
              {loading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.actionArrow}>›</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleClearHistory}>
              <View style={styles.actionItemLeft}>
                <Text style={styles.actionIcon}>📜</Text>
                <View style={styles.actionTextContainer}>
                  <Text style={styles.actionLabel}>Clear Recipe History</Text>
                  <Text style={styles.actionDescription}>Remove recently viewed recipes</Text>
                </View>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.lastActionItem]}
              onPress={() => Alert.alert('Coming Soon', 'Offline mode settings will be available in a future update.')}
            >
              <View style={styles.actionItemLeft}>
                <Text style={styles.actionIcon}>📶</Text>
                <View style={styles.actionTextContainer}>
                  <Text style={styles.actionLabel}>Offline Mode</Text>
                  <Text style={styles.actionDescription}>Manage offline data sync</Text>
                </View>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Auto-Sync */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SYNC SETTINGS</Text>
          <View style={styles.sectionContent}>
            <TouchableOpacity
              style={[styles.actionItem, styles.lastActionItem]}
              onPress={() => Alert.alert('Coming Soon', 'Sync settings will be available in a future update.')}
            >
              <View style={styles.actionItemLeft}>
                <Text style={styles.actionIcon}>🔄</Text>
                <View style={styles.actionTextContainer}>
                  <Text style={styles.actionLabel}>Auto-Sync</Text>
                  <Text style={styles.actionDescription}>Sync data when connected to Wi-Fi</Text>
                </View>
              </View>
              <Text style={styles.syncStatus}>On</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backArrow: {
      fontSize: 24,
      color: colors.text,
    },
    headerTitle: {
      flex: 1,
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
      textAlign: 'center',
    },
    scrollView: {
      flex: 1,
    },
    storageOverview: {
      backgroundColor: colors.backgroundSecondary,
      padding: 24,
      alignItems: 'center',
      marginTop: 16,
      marginHorizontal: 16,
      borderRadius: 12,
    },
    storageTitle: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 8,
    },
    storageValue: {
      fontSize: 36,
      fontWeight: 'bold',
      color: colors.primary,
      marginBottom: 16,
    },
    storageBar: {
      width: '100%',
      height: 8,
      backgroundColor: colors.border,
      borderRadius: 4,
      overflow: 'hidden',
    },
    storageBarFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 4,
    },
    storageSubtext: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 8,
    },
    section: {
      marginTop: 24,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
      marginBottom: 8,
      marginLeft: 24,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionContent: {
      backgroundColor: colors.backgroundSecondary,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    dataItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    lastDataItem: {
      borderBottomWidth: 0,
    },
    dataItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dataIcon: {
      fontSize: 20,
      marginRight: 12,
    },
    dataLabel: {
      fontSize: 16,
      color: colors.text,
    },
    dataValue: {
      fontSize: 16,
      color: colors.textMuted,
    },
    actionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    lastActionItem: {
      borderBottomWidth: 0,
    },
    actionItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    actionIcon: {
      fontSize: 20,
      marginRight: 12,
    },
    actionTextContainer: {
      flex: 1,
    },
    actionLabel: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
      marginBottom: 2,
    },
    actionDescription: {
      fontSize: 14,
      color: colors.textMuted,
    },
    actionArrow: {
      fontSize: 28,
      color: colors.textMuted,
      fontWeight: '300',
    },
    syncStatus: {
      fontSize: 16,
      color: colors.success,
      fontWeight: '500',
    },
    bottomSpacer: {
      height: 40,
    },
  });
