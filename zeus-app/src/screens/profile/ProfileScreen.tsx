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
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ProfileStackParamList } from '../../navigation/ProfileNavigator';

type ProfileScreenNavigationProp = StackNavigationProp<ProfileStackParamList, 'ProfileMain'>;

export const ProfileScreen: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { colors } = useThemeStore();
  const navigation = useNavigation<ProfileScreenNavigationProp>();

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  const menuItems = [
    { icon: '✏️', label: 'Edit Profile', subtitle: 'Update your info', screen: 'EditProfile' as const },
    { icon: '🎯', label: 'Meal Preferences', subtitle: 'Diet, goals & planning', screen: 'EditPreferences' as const },
    { icon: '⚙️', label: 'Settings', subtitle: 'App configuration', screen: 'Settings' as const },
  ];

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
          </View>

          <Text style={styles.username}>{user?.username}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        {/* Menu Items */}
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.menuItem,
                index === menuItems.length - 1 && styles.menuItemLast,
              ]}
              onPress={() => navigation.navigate(item.screen)}
              activeOpacity={0.6}
            >
              <View style={styles.menuIconContainer}>
                <Text style={styles.menuItemIcon}>{item.icon}</Text>
              </View>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemLabel}>{item.label}</Text>
                <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
              </View>
              <Text style={styles.menuItemArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Zeus v1.3.1</Text>
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
    profileCard: {
      alignItems: 'center',
      paddingTop: 40,
      paddingBottom: 32,
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
      width: 108,
      height: 108,
      borderRadius: 54,
      borderWidth: 3,
      borderColor: colors.primary + '30',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: 38,
      fontWeight: '700',
      color: colors.buttonText,
    },
    username: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
      letterSpacing: -0.3,
    },
    email: {
      fontSize: 15,
      color: colors.textMuted,
    },
    menuCard: {
      marginHorizontal: 16,
      marginTop: 20,
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
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    menuItemLast: {
      borderBottomWidth: 0,
    },
    menuIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
    },
    menuItemIcon: {
      fontSize: 22,
    },
    menuItemContent: {
      flex: 1,
    },
    menuItemLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    menuItemSubtitle: {
      fontSize: 13,
      color: colors.textMuted,
    },
    menuItemArrow: {
      fontSize: 22,
      color: colors.textMuted,
      fontWeight: '400',
    },
    logoutButton: {
      marginHorizontal: 16,
      marginTop: 24,
      paddingVertical: 15,
      borderRadius: 14,
      backgroundColor: colors.error + '10',
      borderWidth: 1,
      borderColor: colors.error + '30',
      alignItems: 'center',
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
      marginBottom: 32,
      opacity: 0.6,
    },
  });
