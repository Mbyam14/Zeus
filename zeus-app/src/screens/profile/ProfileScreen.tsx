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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ProfileStackParamList } from '../../navigation/ProfileNavigator';

type ProfileScreenNavigationProp = StackNavigationProp<ProfileStackParamList, 'ProfileMain'>;

interface MenuItem {
  icon: string;
  ionicon: string;
  label: string;
  subtitle: string;
  screen: keyof ProfileStackParamList;
  iconBg: string;
}

export const ProfileScreen: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { colors } = useThemeStore();
  const navigation = useNavigation<ProfileScreenNavigationProp>();

  const avatarUrl = user?.profile_data?.avatar_url;
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const sections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'HEALTH & NUTRITION',
      items: [
        { icon: '📊', ionicon: 'barbell-outline', label: 'Body & Goals', subtitle: 'Stats, TDEE & macro targets', screen: 'BodyStats', iconBg: colors.primary },
        { icon: '🎯', ionicon: 'restaurant-outline', label: 'Meal Preferences', subtitle: 'Diet, cuisine & planning', screen: 'EditPreferences', iconBg: colors.warning },
        { icon: '⚠️', ionicon: 'warning-outline', label: 'Allergies & Dislikes', subtitle: 'Foods to avoid', screen: 'Allergies', iconBg: colors.error },
      ],
    },
    {
      title: 'ACCOUNT',
      items: [
        { icon: '✏️', ionicon: 'person-outline', label: 'Edit Profile', subtitle: 'Photo, name & password', screen: 'EditProfile', iconBg: colors.secondary || '#6B7280' },
      ],
    },
    {
      title: 'APP SETTINGS',
      items: [
        { icon: '🎨', ionicon: 'color-palette-outline', label: 'Theme', subtitle: 'Light, dark or system', screen: 'Theme', iconBg: '#8B5CF6' },
        { icon: '🔔', ionicon: 'notifications-outline', label: 'Notifications', subtitle: 'Reminders & alerts', screen: 'Notifications', iconBg: '#EC4899' },
      ],
    },
    {
      title: 'ABOUT',
      items: [
        { icon: '❓', ionicon: 'help-circle-outline', label: 'Help & Support', subtitle: 'FAQs & contact', screen: 'HelpSupport', iconBg: '#06B6D4' },
        { icon: '📄', ionicon: 'document-text-outline', label: 'Terms of Service', subtitle: 'Our terms', screen: 'Terms', iconBg: '#64748B' },
        { icon: '🔐', ionicon: 'shield-checkmark-outline', label: 'Privacy Policy', subtitle: 'How we protect data', screen: 'PrivacyPolicy', iconBg: '#64748B' },
      ],
    },
  ];

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarRing}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarText}>
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.username}>{user?.username}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {memberSince ? (
            <Text style={styles.memberSince}>Member since {memberSince}</Text>
          ) : null}
        </View>

        {/* Menu Sections */}
        {sections.map((section) => (
          <View key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, index) => (
                <TouchableOpacity
                  key={item.screen}
                  style={[
                    styles.menuItem,
                    index === section.items.length - 1 && styles.menuItemLast,
                  ]}
                  onPress={() => navigation.navigate(item.screen as any)}
                  activeOpacity={0.6}
                >
                  <View style={[styles.menuIconContainer, { backgroundColor: item.iconBg + '15' }]}>
                    <Ionicons name={item.ionicon as any} size={22} color={item.iconBg} />
                  </View>
                  <View style={styles.menuItemContent}>
                    <Text style={styles.menuItemLabel}>{item.label}</Text>
                    <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} style={{ marginRight: 8 }} />
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Zeus v1.4.0</Text>
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
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: -0.5,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    profileCard: {
      alignItems: 'center',
      paddingTop: 28,
      paddingBottom: 24,
      marginHorizontal: 16,
      marginTop: 16,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 20,
      ...Platform.select({
        ios: {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        },
        android: { elevation: 3 },
      }),
    },
    avatarRing: {
      width: 100,
      height: 100,
      borderRadius: 50,
      borderWidth: 3,
      borderColor: colors.primary + '30',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
    },
    avatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: 36,
      fontWeight: '700',
      color: colors.buttonText,
    },
    username: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 2,
      letterSpacing: -0.3,
    },
    email: {
      fontSize: 14,
      color: colors.textMuted,
    },
    memberSince: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 6,
      opacity: 0.7,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      letterSpacing: 0.5,
      marginTop: 24,
      marginBottom: 8,
      marginLeft: 28,
    },
    menuCard: {
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
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    menuItemLast: {
      borderBottomWidth: 0,
    },
    menuIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
    },
    menuItemContent: {
      flex: 1,
    },
    menuItemLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 1,
    },
    menuItemSubtitle: {
      fontSize: 13,
      color: colors.textMuted,
    },
    logoutButton: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 28,
      paddingVertical: 15,
      borderRadius: 14,
      backgroundColor: colors.error + '10',
      borderWidth: 1,
      borderColor: colors.error + '30',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoutButtonText: {
      color: colors.error,
      fontSize: 16,
      fontWeight: '600',
    },
    versionText: {
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 20,
      opacity: 0.5,
    },
  });
