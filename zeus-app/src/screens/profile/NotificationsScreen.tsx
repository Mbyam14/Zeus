import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore } from '../../store/themeStore';

interface NotificationSetting {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export const NotificationsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useThemeStore();

  const [settings, setSettings] = useState<NotificationSetting[]>([
    {
      id: 'meal_reminders',
      label: 'Meal Reminders',
      description: 'Get reminded before meal times',
      enabled: true,
    },
    {
      id: 'prep_reminders',
      label: 'Prep Reminders',
      description: 'Reminders to prepare ingredients ahead',
      enabled: false,
    },
    {
      id: 'grocery_reminders',
      label: 'Grocery List Reminders',
      description: 'Remind me to shop for groceries',
      enabled: true,
    },
    {
      id: 'expiring_items',
      label: 'Expiring Items',
      description: 'Alert when pantry items are expiring',
      enabled: true,
    },
    {
      id: 'new_recipes',
      label: 'New Recipe Suggestions',
      description: 'Get notified about new recipes you might like',
      enabled: false,
    },
    {
      id: 'weekly_summary',
      label: 'Weekly Summary',
      description: 'Receive a weekly meal planning summary',
      enabled: false,
    },
  ]);

  const toggleSetting = (id: string) => {
    setSettings(prev =>
      prev.map(setting =>
        setting.id === id ? { ...setting, enabled: !setting.enabled } : setting
      )
    );
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PUSH NOTIFICATIONS</Text>
          <View style={styles.sectionContent}>
            {settings.map((setting, index) => (
              <View
                key={setting.id}
                style={[
                  styles.settingItem,
                  index === settings.length - 1 && styles.lastSettingItem,
                ]}
              >
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingLabel}>{setting.label}</Text>
                  <Text style={styles.settingDescription}>{setting.description}</Text>
                </View>
                <Switch
                  value={setting.enabled}
                  onValueChange={() => toggleSetting(setting.id)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.buttonText}
                />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REMINDER TIMES</Text>
          <View style={styles.sectionContent}>
            <TouchableOpacity style={styles.settingItem}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Breakfast Reminder</Text>
                <Text style={styles.settingDescription}>8:00 AM</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingItem}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Lunch Reminder</Text>
                <Text style={styles.settingDescription}>12:00 PM</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.settingItem, styles.lastSettingItem]}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Dinner Reminder</Text>
                <Text style={styles.settingDescription}>6:00 PM</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footerNote}>
          You can also manage notification permissions in your device settings.
        </Text>
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
    footerNote: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: 32,
      paddingVertical: 24,
    },
  });
