import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore } from '../../store/themeStore';
import { userService } from '../../services/userService';
import { NotificationPreferences } from '../../types/user';

const NOTIFICATION_ITEMS: { key: keyof NotificationPreferences; label: string; desc: string; icon: string }[] = [
  { key: 'meal_reminders', label: 'Meal Reminders', desc: 'Remind you before meal times', icon: 'restaurant-outline' },
  { key: 'prep_reminders', label: 'Prep Reminders', desc: 'Remind you to prep ingredients', icon: 'time-outline' },
  { key: 'grocery_reminders', label: 'Grocery Reminders', desc: 'When your grocery list is ready', icon: 'cart-outline' },
  { key: 'expiring_items', label: 'Expiring Items', desc: 'Pantry items about to expire', icon: 'alert-circle-outline' },
  { key: 'new_recipes', label: 'New Recipe Suggestions', desc: 'Personalized recipe picks', icon: 'sparkles-outline' },
  { key: 'weekly_summary', label: 'Weekly Summary', desc: 'Your nutrition & planning recap', icon: 'bar-chart-outline' },
];

export const NotificationsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useThemeStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    meal_reminders: true,
    prep_reminders: false,
    grocery_reminders: true,
    expiring_items: true,
    new_recipes: false,
    weekly_summary: false,
  });

  useEffect(() => {
    loadPrefs();
  }, []);

  const loadPrefs = async () => {
    try {
      const data = await userService.getNotificationPreferences();
      setPrefs(data);
    } catch (error) {
      console.error('Failed to load notification prefs:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePref = async (key: keyof NotificationPreferences) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);

    try {
      await userService.updateNotificationPreferences(updated);
    } catch (error) {
      // Revert on failure
      setPrefs(prefs);
      Alert.alert('Error', 'Failed to save preference');
    }
  };

  const styles = createStyles(colors);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>PUSH NOTIFICATIONS</Text>
        <View style={styles.card}>
          {NOTIFICATION_ITEMS.map((item, index) => (
            <View
              key={item.key}
              style={[styles.row, index === NOTIFICATION_ITEMS.length - 1 && styles.rowLast]}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconCircle, { backgroundColor: colors.primary + '12' }]}>
                  <Ionicons name={item.icon as any} size={20} color={colors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={styles.rowDesc}>{item.desc}</Text>
                </View>
              </View>
              <Switch
                value={prefs[item.key]}
                onValueChange={() => togglePref(item.key)}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={prefs[item.key] ? colors.primary : colors.textMuted}
              />
            </View>
          ))}
        </View>

        <Text style={styles.footnote}>
          Push notifications require system-level permission. You can manage this in your device settings.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 12, paddingVertical: 12,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    backButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
    scrollContent: { padding: 16 },

    sectionLabel: {
      fontSize: 13, fontWeight: '600', color: colors.textMuted,
      letterSpacing: 0.5, marginBottom: 8, marginLeft: 4,
    },
    card: {
      backgroundColor: colors.backgroundSecondary, borderRadius: 16, overflow: 'hidden',
      ...Platform.select({
        ios: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8 },
        android: { elevation: 2 },
      }),
    },
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 14, paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    rowLast: { borderBottomWidth: 0 },
    rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
    iconCircle: {
      width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    rowText: { flex: 1 },
    rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    rowDesc: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    footnote: {
      fontSize: 13, color: colors.textMuted, textAlign: 'center',
      marginTop: 16, paddingHorizontal: 16, lineHeight: 18,
    },
  });
