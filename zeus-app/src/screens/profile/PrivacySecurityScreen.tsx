import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore } from '../../store/themeStore';

export const PrivacySecurityScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useThemeStore();

  const [shareUsageData, setShareUsageData] = useState(true);
  const [personalizedAds, setPersonalizedAds] = useState(false);
  const [saveRecipeHistory, setSaveRecipeHistory] = useState(true);

  const handleExportData = () => {
    Alert.alert(
      'Export Your Data',
      'We will prepare your data export and send it to your registered email address within 24 hours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: () => Alert.alert('Success', 'Your data export request has been submitted.'),
        },
      ]
    );
  };

  const handleDeleteData = () => {
    Alert.alert(
      'Delete All Data',
      'This will permanently delete all your recipes, meal plans, pantry items, and preferences. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => Alert.alert('Coming Soon', 'Data deletion will be available in a future update.'),
        },
      ]
    );
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRIVACY</Text>
          <View style={styles.sectionContent}>
            <View style={styles.settingItem}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Share Usage Data</Text>
                <Text style={styles.settingDescription}>
                  Help improve Zeus by sharing anonymous usage data
                </Text>
              </View>
              <Switch
                value={shareUsageData}
                onValueChange={setShareUsageData}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={styles.settingItem}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Personalized Recommendations</Text>
                <Text style={styles.settingDescription}>
                  Use your data to personalize recipe suggestions
                </Text>
              </View>
              <Switch
                value={personalizedAds}
                onValueChange={setPersonalizedAds}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={[styles.settingItem, styles.lastSettingItem]}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Save Recipe History</Text>
                <Text style={styles.settingDescription}>
                  Keep track of recipes you've viewed
                </Text>
              </View>
              <Switch
                value={saveRecipeHistory}
                onValueChange={setSaveRecipeHistory}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SECURITY</Text>
          <View style={styles.sectionContent}>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => Alert.alert('Coming Soon', 'Two-factor authentication will be available in a future update.')}
            >
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Two-Factor Authentication</Text>
                <Text style={styles.settingDescription}>Add an extra layer of security</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => Alert.alert('Coming Soon', 'Login history will be available in a future update.')}
            >
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Login History</Text>
                <Text style={styles.settingDescription}>View recent account activity</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.settingItem, styles.lastSettingItem]}
              onPress={() => Alert.alert('Coming Soon', 'Active sessions management will be available in a future update.')}
            >
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Active Sessions</Text>
                <Text style={styles.settingDescription}>Manage devices where you're logged in</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>YOUR DATA</Text>
          <View style={styles.sectionContent}>
            <TouchableOpacity style={styles.settingItem} onPress={handleExportData}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Export Your Data</Text>
                <Text style={styles.settingDescription}>Download a copy of your data</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.settingItem, styles.lastSettingItem]}
              onPress={handleDeleteData}
            >
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingLabel, { color: colors.error }]}>Delete All Data</Text>
                <Text style={styles.settingDescription}>Permanently delete your data</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
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
      justifyContent: 'space-between',
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
    backButtonText: {
      fontSize: 28,
      color: colors.text,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    scrollView: {
      flex: 1,
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
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    lastSettingItem: {
      borderBottomWidth: 0,
    },
    settingTextContainer: {
      flex: 1,
      marginRight: 16,
    },
    settingLabel: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
      marginBottom: 2,
    },
    settingDescription: {
      fontSize: 14,
      color: colors.textMuted,
    },
    settingArrow: {
      fontSize: 28,
      color: colors.textMuted,
      fontWeight: '300',
    },
    bottomSpacer: {
      height: 40,
    },
  });
