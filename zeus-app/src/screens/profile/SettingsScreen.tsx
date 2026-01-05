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

type SettingsScreenNavigationProp = StackNavigationProp<ProfileStackParamList, 'Settings'>;

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();

  const handleComingSoon = (feature: string) => {
    Alert.alert('Coming Soon', `${feature} settings will be available in a future update.`);
  };

  const settingsSections = [
    {
      title: 'Personalization',
      items: [
        {
          icon: '🌐',
          label: 'App Language',
          description: 'English',
          onPress: () => handleComingSoon('Language'),
        },
      ],
    },
    {
      title: 'Appearance',
      items: [
        {
          icon: '🌙',
          label: 'Theme',
          description: 'Light mode',
          onPress: () => handleComingSoon('Theme'),
        },
        {
          icon: '🎨',
          label: 'Color Scheme',
          description: 'Default',
          onPress: () => handleComingSoon('Color Scheme'),
        },
      ],
    },
    {
      title: 'Accessibility',
      items: [
        {
          icon: '📱',
          label: 'Text Size',
          description: 'Medium',
          onPress: () => handleComingSoon('Text Size'),
        },
        {
          icon: '♿',
          label: 'Screen Reader',
          description: 'Off',
          onPress: () => handleComingSoon('Screen Reader'),
        },
        {
          icon: '🔊',
          label: 'Audio Feedback',
          description: 'Off',
          onPress: () => handleComingSoon('Audio Feedback'),
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
          onPress: () => handleComingSoon('Notifications'),
        },
        {
          icon: '🔒',
          label: 'Privacy & Security',
          description: 'Manage your data and privacy',
          onPress: () => handleComingSoon('Privacy'),
        },
        {
          icon: '📊',
          label: 'Data & Storage',
          description: 'Manage app data and cache',
          onPress: () => handleComingSoon('Data & Storage'),
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
          onPress: () => handleComingSoon('Help & Support'),
        },
        {
          icon: '📄',
          label: 'Terms of Service',
          description: 'Read our terms and conditions',
          onPress: () => handleComingSoon('Terms'),
        },
        {
          icon: '🔐',
          label: 'Privacy Policy',
          description: 'How we protect your data',
          onPress: () => handleComingSoon('Privacy Policy'),
        },
      ],
    },
  ];

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#2C3E50',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
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
    color: '#7F8C8D',
    marginBottom: 8,
    marginLeft: 24,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E1E8ED',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
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
    color: '#2C3E50',
    fontWeight: '500',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: '#7F8C8D',
  },
  settingArrow: {
    fontSize: 28,
    color: '#7F8C8D',
    fontWeight: '300',
  },
  versionSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  versionText: {
    fontSize: 14,
    color: '#7F8C8D',
    marginBottom: 4,
  },
  copyrightText: {
    fontSize: 12,
    color: '#BDC3C7',
  },
});
