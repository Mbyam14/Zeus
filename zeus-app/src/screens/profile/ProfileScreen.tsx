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
import { useAuthStore } from '../../store/authStore';

export const ProfileScreen: React.FC = () => {
  const { user, logout } = useAuthStore();

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

  const profileStats = [
    { label: 'Recipes', value: '24' },
    { label: 'Followers', value: '156' },
    { label: 'Following', value: '89' },
  ];

  const menuItems = [
    { icon: '📖', label: 'My Recipes', badge: '24' },
    { icon: '🔖', label: 'Saved Recipes', badge: '47' },
    { icon: '📅', label: 'Meal Plans', badge: '3' },
    { icon: '🥘', label: 'My Pantry', badge: null },
    { icon: '⚙️', label: 'Settings', badge: null },
    { icon: '❓', label: 'Help & Support', badge: null },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        {/* Profile Info */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
          </View>

          <Text style={styles.username}>@{user?.username}</Text>
          <Text style={styles.email}>{user?.email}</Text>

          {/* Stats */}
          <View style={styles.statsContainer}>
            {profileStats.map((stat, index) => (
              <View key={index} style={styles.statItem}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.editButton}>
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity key={index} style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuItemIcon}>{item.icon}</Text>
                <Text style={styles.menuItemLabel}>{item.label}</Text>
              </View>
              <View style={styles.menuItemRight}>
                {item.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                )}
                <Text style={styles.menuItemArrow}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout Button */}
        <View style={styles.logoutSection}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Version Info */}
        <Text style={styles.versionText}>Zeus v1.0.0</Text>
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
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  profileSection: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: '#7F8C8D',
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    marginBottom: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E1E8ED',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B35',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#7F8C8D',
  },
  editButton: {
    backgroundColor: '#004E89',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  menuSection: {
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  menuItemLabel: {
    fontSize: 16,
    color: '#2C3E50',
    fontWeight: '500',
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  menuItemArrow: {
    fontSize: 28,
    color: '#7F8C8D',
    fontWeight: '300',
  },
  logoutSection: {
    padding: 24,
  },
  logoutButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E74C3C',
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#E74C3C',
    fontSize: 16,
    fontWeight: '600',
  },
  versionText: {
    textAlign: 'center',
    color: '#7F8C8D',
    fontSize: 14,
    marginBottom: 32,
  },
});
