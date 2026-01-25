import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore, ThemeMode } from '../../store/themeStore';

const themeOptions: { mode: ThemeMode; label: string; description: string; icon: string }[] = [
  {
    mode: 'light',
    label: 'Light',
    description: 'Always use light theme',
    icon: '☀️',
  },
  {
    mode: 'dark',
    label: 'Dark',
    description: 'Always use dark theme',
    icon: '🌙',
  },
  {
    mode: 'system',
    label: 'System',
    description: 'Follow device settings',
    icon: '📱',
  },
];

export const ThemeScreen: React.FC = () => {
  const navigation = useNavigation();
  const { mode, setMode, colors } = useThemeStore();

  const handleSelectTheme = async (selectedMode: ThemeMode) => {
    await setMode(selectedMode);
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Theme</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>APPEARANCE</Text>
        <View style={styles.optionsContainer}>
          {themeOptions.map((option, index) => (
            <TouchableOpacity
              key={option.mode}
              style={[
                styles.optionItem,
                index === themeOptions.length - 1 && styles.lastOptionItem,
                mode === option.mode && styles.optionItemSelected,
              ]}
              onPress={() => handleSelectTheme(option.mode)}
            >
              <View style={styles.optionLeft}>
                <Text style={styles.optionIcon}>{option.icon}</Text>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </View>
              </View>
              <View style={[styles.radioOuter, mode === option.mode && styles.radioOuterSelected]}>
                {mode === option.mode && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.previewSection}>
          <Text style={styles.sectionTitle}>PREVIEW</Text>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View style={styles.previewAvatar}>
                <Text style={styles.previewAvatarText}>Z</Text>
              </View>
              <View style={styles.previewHeaderText}>
                <Text style={styles.previewTitle}>Zeus Recipe App</Text>
                <Text style={styles.previewSubtitle}>Your current theme</Text>
              </View>
            </View>
            <View style={styles.previewBody}>
              <View style={styles.previewChip}>
                <Text style={styles.previewChipText}>Sample Tag</Text>
              </View>
              <View style={[styles.previewChip, styles.previewChipPrimary]}>
                <Text style={styles.previewChipTextPrimary}>Primary</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
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
    content: {
      flex: 1,
      paddingTop: 24,
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
    optionsContainer: {
      backgroundColor: colors.backgroundSecondary,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    optionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    lastOptionItem: {
      borderBottomWidth: 0,
    },
    optionItemSelected: {
      backgroundColor: colors.borderLight,
    },
    optionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    optionIcon: {
      fontSize: 24,
      marginRight: 16,
    },
    optionTextContainer: {
      flex: 1,
    },
    optionLabel: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
      marginBottom: 2,
    },
    optionDescription: {
      fontSize: 14,
      color: colors.textMuted,
    },
    radioOuter: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    radioOuterSelected: {
      borderColor: colors.primary,
    },
    radioInner: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.primary,
    },
    previewSection: {
      marginTop: 32,
    },
    previewCard: {
      marginHorizontal: 16,
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    previewAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    previewAvatarText: {
      fontSize: 20,
      fontWeight: 'bold',
      color: '#FFFFFF',
    },
    previewHeaderText: {
      flex: 1,
    },
    previewTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 2,
    },
    previewSubtitle: {
      fontSize: 14,
      color: colors.textMuted,
    },
    previewBody: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    previewChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.borderLight,
    },
    previewChipPrimary: {
      backgroundColor: colors.primary,
    },
    previewChipText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    previewChipTextPrimary: {
      fontSize: 14,
      color: '#FFFFFF',
      fontWeight: '500',
    },
  });
