import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ProfileStackParamList } from '../../navigation/ProfileNavigator';
import { useThemeStore } from '../../store/themeStore';

type SettingsScreenNavigationProp = StackNavigationProp<ProfileStackParamList, 'Settings'>;

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const { mode, colors } = useThemeStore();

  const handleComingSoon = (feature: string) => {
    Alert.alert('Coming Soon', `${feature} settings will be available in a future update.`);
  };

  const getThemeDescription = () => {
    switch (mode) {
      case 'light':
        return 'Light mode';
      case 'dark':
        return 'Dark mode';
      case 'system':
        return 'System default';
      default:
        return 'Light mode';
    }
  };

  const settingsSections = [
    {
      title: 'Appearance',
      items: [
        {
          icon: '🌙',
          label: 'Theme',
          description: getThemeDescription(),
          onPress: () => navigation.navigate('Theme'),
        },
        {
          icon: '🌐',
          label: 'App Language',
          description: 'English',
          onPress: () => handleComingSoon('Language'),
        },
      ],
    },
    {
      title: 'General',
      items: [
        {
          icon: '🔔',
          label: 'Notifications',
          description: 'Manage notification preferences',
          onPress: () => navigation.navigate('Notifications'),
        },
        {
          icon: '🔒',
          label: 'Privacy & Security',
          description: 'Manage your data and privacy',
          onPress: () => navigation.navigate('PrivacySecurity'),
        },
        {
          icon: '📊',
          label: 'Data & Storage',
          description: 'Manage app data and cache',
          onPress: () => navigation.navigate('DataStorage'),
        },
      ],
    },
    {
      title: 'About',
      items: [
        {
          icon: '❓',
          label: 'Help & Support',
          description: 'FAQs and contact support',
          onPress: () => navigation.navigate('HelpSupport'),
        },
        {
          icon: '📄',
          label: 'Terms of Service',
          description: 'Read our terms and conditions',
          onPress: () => navigation.navigate('Terms'),
        },
        {
          icon: '🔐',
          label: 'Privacy Policy',
          description: 'How we protect your data',
          onPress: () => navigation.navigate('PrivacyPolicy'),
        },
      ],
    },
  ];

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView}>
        {settingsSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionContent}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={itemIndex}
                  style={[
                    styles.settingItem,
                    itemIndex === section.items.length - 1 && styles.lastSettingItem,
                  ]}
                  onPress={item.onPress}
                >
                  <View style={styles.settingItemLeft}>
                    <Text style={styles.settingIcon}>{item.icon}</Text>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingLabel}>{item.label}</Text>
                      {item.description && (
                        <Text style={styles.settingDescription}>{item.description}</Text>
                      )}
                    </View>
                  </View>
                  <Text style={styles.settingArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.versionSection}>
          <Text style={styles.versionText}>Zeus v1.0.0</Text>
          <Text style={styles.copyrightText}>© 2026 Zeus App. All rights reserved.</Text>
        </View>
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
    settingItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    settingIcon: {
      fontSize: 24,
      marginRight: 16,
    },
    settingTextContainer: {
      flex: 1,
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
    versionSection: {
      alignItems: 'center',
      paddingVertical: 32,
    },
    versionText: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 4,
    },
    copyrightText: {
      fontSize: 12,
      color: colors.textMuted,
    },
  });
