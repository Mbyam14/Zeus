import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { authService } from '../../services/authService';
import { userService } from '../../services/userService';

interface EditProfileScreenProps {
  navigation: any;
}

export const EditProfileScreen: React.FC<EditProfileScreenProps> = ({ navigation }) => {
  const { user, loadUser, logout } = useAuthStore();
  const { colors } = useThemeStore();

  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Password change
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Delete account
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const avatarUrl = user?.profile_data?.avatar_url;
  const hasChanges = username !== user?.username || email !== user?.email;

  const handleSaveProfile = async () => {
    if (!username.trim() || username.length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email');
      return;
    }

    try {
      setSaving(true);
      await authService.updateProfile({ username: username.trim(), profile_data: user?.profile_data || {} });
      await loadUser();
      Alert.alert('Success', 'Profile updated');
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to change your avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      try {
        setUploadingPhoto(true);
        await userService.uploadAvatar(result.assets[0].base64);
        await loadUser();
      } catch (error: any) {
        Alert.alert('Error', error?.response?.data?.detail || 'Failed to upload photo');
      } finally {
        setUploadingPhoto(false);
      }
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Error', 'Please enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Error', 'New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    try {
      setChangingPassword(true);
      await authService.changePassword(currentPassword, newPassword);
      Alert.alert('Success', 'Password changed successfully');
      setShowPasswordSection(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    if (!deletePassword) {
      Alert.alert('Error', 'Please enter your password to confirm');
      return;
    }

    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and ALL data (recipes, meal plans, pantry, AI conversations). This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await authService.deleteAccount(deletePassword);
              await logout();
            } catch (error: any) {
              Alert.alert('Error', error?.response?.data?.detail || 'Failed to delete account');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity
          onPress={handleSaveProfile}
          disabled={saving || !hasChanges}
          style={styles.headerButton}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="checkmark" size={26} color={hasChanges ? colors.primary : colors.textMuted} />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={handlePickPhoto} disabled={uploadingPhoto} activeOpacity={0.7}>
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
                <View style={styles.cameraIcon}>
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={16} color="#fff" />
                  )}
                </View>
              </View>
            </TouchableOpacity>
            <Text style={styles.changePhotoText}>Tap to change photo</Text>
          </View>

          {/* Username & Email */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ACCOUNT INFO</Text>
            <View style={styles.card}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Username</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Username"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoComplete="off"
                  textContentType="none"
                />
              </View>
              <View style={[styles.field, styles.fieldLast]}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="off"
                  textContentType="none"
                />
              </View>
            </View>
          </View>

          {/* Change Password */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SECURITY</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={[styles.expandableHeader, showPasswordSection && styles.expandableHeaderOpen]}
                onPress={() => setShowPasswordSection(!showPasswordSection)}
              >
                <View style={styles.expandableLeft}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.text} style={{ marginRight: 12 }} />
                  <Text style={styles.expandableLabel}>Change Password</Text>
                </View>
                <Ionicons
                  name={showPasswordSection ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>

              {showPasswordSection && (
                <View style={styles.expandableContent}>
                  <TextInput
                    style={styles.passwordInput}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Current password"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    autoComplete="off"
                    textContentType="none"
                  />
                  <TextInput
                    style={styles.passwordInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="New password (min 8 characters)"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    autoComplete="off"
                    textContentType="none"
                  />
                  <TextInput
                    style={[styles.passwordInput, { marginBottom: 0 }]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm new password"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    autoComplete="off"
                    textContentType="none"
                  />
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleChangePassword}
                    disabled={changingPassword}
                  >
                    {changingPassword ? (
                      <ActivityIndicator size="small" color={colors.buttonText} />
                    ) : (
                      <Text style={styles.actionButtonText}>Update Password</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Delete Account */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.error }]}>DANGER ZONE</Text>
            <View style={[styles.card, { borderWidth: 1, borderColor: colors.error + '30' }]}>
              <TouchableOpacity
                style={[styles.expandableHeader, showDeleteSection && styles.expandableHeaderOpen]}
                onPress={() => setShowDeleteSection(!showDeleteSection)}
              >
                <View style={styles.expandableLeft}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} style={{ marginRight: 12 }} />
                  <Text style={[styles.expandableLabel, { color: colors.error }]}>Delete Account</Text>
                </View>
                <Ionicons
                  name={showDeleteSection ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>

              {showDeleteSection && (
                <View style={styles.expandableContent}>
                  <Text style={styles.deleteWarning}>
                    This will permanently delete your account and all associated data. This action cannot be undone.
                  </Text>
                  <TextInput
                    style={styles.passwordInput}
                    value={deletePassword}
                    onChangeText={setDeletePassword}
                    placeholder="Enter your password to confirm"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    autoComplete="off"
                    textContentType="none"
                  />
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.error }]}
                    onPress={handleDeleteAccount}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={[styles.actionButtonText, { color: '#fff' }]}>Delete My Account</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerButton: {
      width: 44, height: 44, borderRadius: 22,
      justifyContent: 'center', alignItems: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
    scrollContent: { padding: 16 },
    avatarSection: { alignItems: 'center', paddingVertical: 20 },
    avatarRing: {
      width: 108, height: 108, borderRadius: 54,
      borderWidth: 3, borderColor: colors.primary + '30',
      justifyContent: 'center', alignItems: 'center',
    },
    avatar: {
      width: 96, height: 96, borderRadius: 48,
      justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontSize: 38, fontWeight: '700', color: colors.buttonText },
    cameraIcon: {
      position: 'absolute', bottom: 0, right: 0,
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
      borderWidth: 2, borderColor: colors.background,
    },
    changePhotoText: { fontSize: 14, color: colors.primary, fontWeight: '500', marginTop: 8 },
    section: { marginBottom: 8 },
    sectionLabel: {
      fontSize: 13, fontWeight: '600', color: colors.textMuted,
      letterSpacing: 0.5, marginBottom: 8, marginLeft: 4,
    },
    card: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 16, overflow: 'hidden',
      ...Platform.select({
        ios: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8 },
        android: { elevation: 2 },
      }),
    },
    field: {
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    fieldLast: { borderBottomWidth: 0 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
    input: { fontSize: 16, color: colors.text, paddingVertical: 0 },
    expandableHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 16,
    },
    expandableHeaderOpen: {
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    expandableLeft: { flexDirection: 'row', alignItems: 'center' },
    expandableLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
    expandableContent: { padding: 16 },
    passwordInput: {
      backgroundColor: colors.background, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 10,
      fontSize: 15, color: colors.text, marginBottom: 10,
      borderWidth: 1, borderColor: colors.border,
    },
    actionButton: {
      backgroundColor: colors.primary, borderRadius: 12,
      paddingVertical: 14, alignItems: 'center', marginTop: 6,
    },
    actionButtonText: { fontSize: 16, fontWeight: '600', color: colors.buttonText },
    deleteWarning: {
      fontSize: 14, color: colors.error, lineHeight: 20, marginBottom: 12,
    },
  });
