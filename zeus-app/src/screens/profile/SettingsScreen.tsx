import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  Platform,
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
      case 'light': return 'Light mode';
      case 'dark': return 'Dark mode';
      case 'system': return 'System default';
      default: return 'Light mode';
    }
  };

  const settingsSections = [
    {
      title: 'APPEARANCE',
      items: [
        { icon: '🌙', label: 'Theme', description: getThemeDescription(), onPress: () => navigation.navigate('Theme') },
        { icon: '🌐', label: 'App Language', description: 'English', onPress: () => handleComingSoon('Language') },
      ],
    },
    {
      title: 'GENERAL',
      items: [
        { icon: '🔔', label: 'Notifications', description: 'Manage alerts', onPress: () => navigation.navigate('Notifications') },
        { icon: '🔒', label: 'Privacy & Security', description: 'Data & privacy', onPress: () => navigation.navigate('PrivacySecurity') },
        { icon: '📊', label: 'Data & Storage', description: 'Cache & storage', onPress: () => navigation.navigate('DataStorage') },
      ],
    },
    {
      title: 'ABOUT',
      items: [
        { icon: '❓', label: 'Help & Support', description: 'FAQs & contact', onPress: () => navigation.navigate('HelpSupport') },
        { icon: '📄', label: 'Terms of Service', description: 'Our terms', onPress: () => navigation.navigate('Terms') },
        { icon: '🔐', label: 'Privacy Policy', description: 'How we protect data', onPress: () => navigation.navigate('PrivacyPolicy') },
      ],
    },
  ];

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {settingsSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={itemIndex}
                  style={[
                    styles.settingItem,
                    itemIndex === section.items.length - 1 && styles.settingItemLast,
                  ]}
                  onPress={item.onPress}
                  activeOpacity={0.6}
                >
                  <View style={styles.settingIconContainer}>
                    <Text style={styles.settingIcon}>{item.icon}</Text>
                  </View>
                  <View style={styles.settingTextContainer}>
                    <Text style={styles.settingLabel}>{item.label}</Text>
                    <Text style={styles.settingDescription}>{item.description}</Text>
                  </View>
                  <Text style={styles.settingArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.versionSection}>
          <Text style={styles.versionText}>Zeus v1.3.1</Text>
          <Text style={styles.copyrightText}>© 2026 Zeus App</Text>
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
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: StyleSheet.hairlineWidth,
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
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    scrollView: {
      flex: 1,
    },
    section: {
      marginTop: 24,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      marginBottom: 8,
      marginLeft: 20,
      letterSpacing: 1,
    },
    sectionCard: {
      marginHorizontal: 16,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 16,
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        },
        android: { elevation: 2 },
      }),
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    settingItemLast: {
      borderBottomWidth: 0,
    },
    settingIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
    },
    settingIcon: {
      fontSize: 20,
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
      fontSize: 13,
      color: colors.textMuted,
    },
    settingArrow: {
      fontSize: 22,
      color: colors.textMuted,
      fontWeight: '400',
    },
    versionSection: {
      alignItems: 'center',
      paddingVertical: 32,
    },
    versionText: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 4,
      opacity: 0.6,
    },
    copyrightText: {
      fontSize: 12,
      color: colors.textMuted,
      opacity: 0.4,
    },
  });
