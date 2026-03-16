/**
 * EditPreferencesScreen
 *
 * Meal preferences editor with sections for:
 * - Dietary restrictions
 * - Favorite cuisines
 * - Cooking skill level
 * - Household size & nutrition targets
 * - Leftover tolerance
 * - Eco (budget-friendly) mode
 */

import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserPreferences } from '../../types/user';
import { userService } from '../../services/userService';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';

const DIETARY_OPTIONS = [
  { label: 'Vegetarian', icon: 'leaf-outline' },
  { label: 'Vegan', icon: 'nutrition-outline' },
  { label: 'Gluten-Free', icon: 'ban-outline' },
  { label: 'Dairy-Free', icon: 'water-outline' },
  { label: 'Keto', icon: 'flame-outline' },
  { label: 'Paleo', icon: 'fish-outline' },
  { label: 'Pescatarian', icon: 'boat-outline' },
];

const CUISINE_OPTIONS = [
  { label: 'Italian', flag: 'IT' },
  { label: 'Mexican', flag: 'MX' },
  { label: 'Asian', flag: 'AS' },
  { label: 'Mediterranean', flag: 'MD' },
  { label: 'American', flag: 'US' },
  { label: 'Indian', flag: 'IN' },
  { label: 'French', flag: 'FR' },
  { label: 'Thai', flag: 'TH' },
];

const SKILL_LEVELS: Array<{ value: 'beginner' | 'intermediate' | 'advanced'; label: string; icon: string; desc: string }> = [
  { value: 'beginner', label: 'Beginner', icon: 'sparkles-outline', desc: 'Simple recipes' },
  { value: 'intermediate', label: 'Intermediate', icon: 'restaurant-outline', desc: 'Some challenge' },
  { value: 'advanced', label: 'Advanced', icon: 'trophy-outline', desc: 'Bring it on' },
];

const LEFTOVER_OPTIONS: Array<{ value: string; label: string; desc: string; icon: string }> = [
  { value: 'low', label: 'Low', desc: 'Max 2x same meal', icon: 'remove-circle-outline' },
  { value: 'moderate', label: 'Moderate', desc: 'Max 3x same meal', icon: 'ellipse-outline' },
  { value: 'high', label: 'High', desc: 'Max 4x same meal', icon: 'add-circle-outline' },
];

interface EditPreferencesScreenProps {
  navigation: any;
}

export const EditPreferencesScreen: React.FC<EditPreferencesScreenProps> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [preferences, setPreferences] = useState<UserPreferences>({
    dietary_restrictions: [],
    cuisine_preferences: [],
    cooking_skill: 'intermediate',
    household_size: 2,
    calorie_target: undefined,
    protein_target_grams: undefined,
    allergies: [],
    disliked_ingredients: [],
    meal_calorie_distribution: { breakfast: 25, lunch: 35, dinner: 40 },
    cooking_sessions_per_week: 6,
    recipe_source_preference: 'mixed',
    leftover_tolerance: 'moderate',
    budget_friendly: false,
  });

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setInitialLoading(true);
      const data = await userService.getPreferences();
      setPreferences(data);
    } catch (error) {
      console.error('Failed to load preferences:', error);
      Alert.alert('Error', 'Failed to load preferences');
    } finally {
      setInitialLoading(false);
    }
  };

  const toggleDietary = (item: string) => {
    setPreferences(prev => ({
      ...prev,
      dietary_restrictions: prev.dietary_restrictions.includes(item)
        ? prev.dietary_restrictions.filter(d => d !== item)
        : [...prev.dietary_restrictions, item],
    }));
  };

  const toggleCuisine = (item: string) => {
    setPreferences(prev => ({
      ...prev,
      cuisine_preferences: prev.cuisine_preferences.includes(item)
        ? prev.cuisine_preferences.filter(c => c !== item)
        : [...prev.cuisine_preferences, item],
    }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const prefsToSave = {
        ...preferences,
        household_size: preferences.household_size || 1,
      };
      await userService.updatePreferences(prefsToSave);
      await useAuthStore.getState().loadUser();
      navigation.goBack();
    } catch (error) {
      console.error('Failed to save preferences:', error);
      Alert.alert('Error', 'Failed to save preferences. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(colors);

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading preferences...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meal Preferences</Text>
        <TouchableOpacity onPress={handleSave} disabled={loading} style={styles.headerButton}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="checkmark" size={26} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* === Dietary Restrictions === */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.success + '18' }]}>
                <Ionicons name="leaf-outline" size={20} color={colors.success} />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Dietary Restrictions</Text>
                <Text style={styles.sectionSubtitle}>Select all that apply to your diet</Text>
              </View>
            </View>
            <View style={styles.chipGrid}>
              {DIETARY_OPTIONS.map(option => {
                const selected = preferences.dietary_restrictions.includes(option.label);
                return (
                  <TouchableOpacity
                    key={option.label}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => toggleDietary(option.label)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={option.icon as any}
                      size={16}
                      color={selected ? colors.buttonText : colors.textSecondary}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* === Favorite Cuisines === */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="globe-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Favorite Cuisines</Text>
                <Text style={styles.sectionSubtitle}>Pick your preferred food styles</Text>
              </View>
            </View>
            <View style={styles.chipGrid}>
              {CUISINE_OPTIONS.map(option => {
                const selected = preferences.cuisine_preferences.includes(option.label);
                return (
                  <TouchableOpacity
                    key={option.label}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => toggleCuisine(option.label)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* === Cooking Skill === */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.warning + '18' }]}>
                <Ionicons name="restaurant-outline" size={20} color={colors.warning} />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Cooking Skill</Text>
                <Text style={styles.sectionSubtitle}>Adjusts recipe difficulty in meal plans</Text>
              </View>
            </View>
            <View style={styles.skillRow}>
              {SKILL_LEVELS.map(skill => {
                const selected = preferences.cooking_skill === skill.value;
                return (
                  <TouchableOpacity
                    key={skill.value}
                    style={[styles.skillCard, selected && styles.skillCardSelected]}
                    onPress={() => setPreferences(prev => ({ ...prev, cooking_skill: skill.value }))}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={skill.icon as any}
                      size={24}
                      color={selected ? colors.buttonText : colors.textSecondary}
                      style={{ marginBottom: 6 }}
                    />
                    <Text style={[styles.skillLabel, selected && styles.skillLabelSelected]}>
                      {skill.label}
                    </Text>
                    <Text style={[styles.skillDesc, selected && styles.skillDescSelected]}>
                      {skill.desc}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* === Household & Nutrition === */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.secondary + '18' }]}>
                <Ionicons name="people-outline" size={20} color={colors.secondary} />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Household & Nutrition</Text>
                <Text style={styles.sectionSubtitle}>Servings and daily macro targets</Text>
              </View>
            </View>

            {/* Household size stepper */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Household Size</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => {
                    const current = preferences.household_size || 2;
                    if (current > 1) setPreferences(prev => ({ ...prev, household_size: current - 1 }));
                  }}
                >
                  <Ionicons name="remove" size={20} color={colors.primary} />
                </TouchableOpacity>
                <View style={styles.stepperValueBox}>
                  <Text style={styles.stepperValue}>{preferences.household_size || 2}</Text>
                  <Text style={styles.stepperUnit}>people</Text>
                </View>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => {
                    const current = preferences.household_size || 2;
                    if (current < 20) setPreferences(prev => ({ ...prev, household_size: current + 1 }));
                  }}
                >
                  <Ionicons name="add" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Calorie & protein inputs side by side */}
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Daily Calories</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="flame-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={preferences.calorie_target?.toString() || ''}
                    onChangeText={text =>
                      setPreferences(prev => ({
                        ...prev,
                        calorie_target: text ? parseInt(text) : undefined,
                      }))
                    }
                    placeholder="2000"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.inputUnit}>cal</Text>
                </View>
              </View>
              <View style={{ width: 12 }} />
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Daily Protein</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="barbell-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={preferences.protein_target_grams?.toString() || ''}
                    onChangeText={text =>
                      setPreferences(prev => ({
                        ...prev,
                        protein_target_grams: text ? parseInt(text) : undefined,
                      }))
                    }
                    placeholder="150"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.inputUnit}>g</Text>
                </View>
              </View>
            </View>
          </View>

          {/* === Leftover Tolerance === */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.proteinColor + '18' }]}>
                <Ionicons name="refresh-outline" size={20} color={colors.proteinColor} />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Leftover Tolerance</Text>
                <Text style={styles.sectionSubtitle}>How often can the same meal repeat?</Text>
              </View>
            </View>
            <View style={styles.toleranceRow}>
              {LEFTOVER_OPTIONS.map(option => {
                const selected = preferences.leftover_tolerance === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.toleranceCard, selected && styles.toleranceCardSelected]}
                    onPress={() => setPreferences(prev => ({ ...prev, leftover_tolerance: option.value }))}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={option.icon as any}
                      size={22}
                      color={selected ? colors.buttonText : colors.textSecondary}
                    />
                    <Text style={[styles.toleranceLabel, selected && styles.toleranceLabelSelected]}>
                      {option.label}
                    </Text>
                    <Text style={[styles.toleranceDesc, selected && styles.toleranceDescSelected]}>
                      {option.desc}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* === Eco Mode === */}
          <TouchableOpacity
            style={[styles.ecoCard, preferences.budget_friendly && styles.ecoCardActive]}
            onPress={() => setPreferences(prev => ({ ...prev, budget_friendly: !prev.budget_friendly }))}
            activeOpacity={0.7}
          >
            <View style={[
              styles.ecoIconCircle,
              { backgroundColor: preferences.budget_friendly ? 'rgba(255,255,255,0.2)' : colors.success + '18' },
            ]}>
              <Ionicons
                name="eco-outline"
                size={24}
                color={preferences.budget_friendly ? colors.buttonText : colors.success}
              />
            </View>
            <View style={styles.ecoContent}>
              <Text style={[styles.ecoTitle, preferences.budget_friendly && styles.ecoTitleActive]}>
                Eco Mode
              </Text>
              <Text style={[styles.ecoDesc, preferences.budget_friendly && styles.ecoDescActive]}>
                Prioritize cheaper ingredients & maximize pantry usage
              </Text>
            </View>
            <View style={[styles.toggleTrack, preferences.budget_friendly && styles.toggleTrackActive]}>
              <View style={[styles.toggleThumb, preferences.budget_friendly && styles.toggleThumbActive]} />
            </View>
          </TouchableOpacity>

          {/* Bottom Save */}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.buttonText} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={22} color={colors.buttonText} style={{ marginRight: 8 }} />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 16,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 15,
      color: colors.textMuted,
    },

    // Header
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
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: -0.3,
    },

    // Sections
    section: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 16,
      padding: 18,
      marginBottom: 14,
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
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    sectionIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    sectionHeaderText: {
      flex: 1,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.2,
    },
    sectionSubtitle: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },

    // Chips (dietary & cuisine)
    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 24,
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    chipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    chipTextSelected: {
      color: colors.buttonText,
    },

    // Cooking skill cards
    skillRow: {
      flexDirection: 'row',
      gap: 10,
    },
    skillCard: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 8,
      borderRadius: 14,
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    skillCardSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    skillLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 2,
    },
    skillLabelSelected: {
      color: colors.buttonText,
    },
    skillDesc: {
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'center',
    },
    skillDescSelected: {
      color: 'rgba(255,255,255,0.7)',
    },

    // Household stepper
    fieldBlock: {
      marginBottom: 16,
    },
    fieldLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
    },
    stepperButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary + '14',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.primary + '30',
    },
    stepperValueBox: {
      alignItems: 'center',
      minWidth: 60,
    },
    stepperValue: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: -1,
    },
    stepperUnit: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: -2,
    },

    // Nutrition inputs
    inputRow: {
      flexDirection: 'row',
    },
    inputGroup: {
      flex: 1,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 12 : 4,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      paddingVertical: 0,
    },
    inputUnit: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '600',
      marginLeft: 4,
    },

    // Leftover tolerance
    toleranceRow: {
      flexDirection: 'row',
      gap: 10,
    },
    toleranceCard: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 6,
      borderRadius: 14,
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    toleranceCardSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    toleranceLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      marginTop: 6,
    },
    toleranceLabelSelected: {
      color: colors.buttonText,
    },
    toleranceDesc: {
      fontSize: 10,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 2,
    },
    toleranceDescSelected: {
      color: 'rgba(255,255,255,0.7)',
    },

    // Eco mode card
    ecoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 16,
      padding: 18,
      marginBottom: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
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
    ecoCardActive: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    ecoIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
    },
    ecoContent: {
      flex: 1,
    },
    ecoTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 3,
    },
    ecoTitleActive: {
      color: colors.buttonText,
    },
    ecoDesc: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 16,
    },
    ecoDescActive: {
      color: 'rgba(255,255,255,0.8)',
    },

    // Toggle switch
    toggleTrack: {
      width: 48,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.border,
      justifyContent: 'center',
      paddingHorizontal: 3,
      marginLeft: 10,
    },
    toggleTrackActive: {
      backgroundColor: 'rgba(255,255,255,0.35)',
    },
    toggleThumb: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.backgroundSecondary,
    },
    toggleThumbActive: {
      alignSelf: 'flex-end',
      backgroundColor: colors.buttonText,
    },

    // Save button
    saveButton: {
      flexDirection: 'row',
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
        android: { elevation: 4 },
      }),
    },
    saveButtonText: {
      color: colors.buttonText,
      fontSize: 17,
      fontWeight: '700',
    },
  });
