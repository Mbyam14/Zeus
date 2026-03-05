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
  Animated,
  SafeAreaView,
} from 'react-native';
import { UserPreferences } from '../../types/user';
import { userService } from '../../services/userService';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Keto', 'Paleo', 'Pescatarian'];
const CUISINE_OPTIONS = ['Italian', 'Mexican', 'Asian', 'Mediterranean', 'American', 'Indian', 'French', 'Thai'];
const SKILL_LEVELS: Array<'beginner' | 'intermediate' | 'advanced'> = ['beginner', 'intermediate', 'advanced'];
const RECIPE_SOURCE_OPTIONS = [
  { value: 'mixed', label: 'Mixed', description: 'Curated + AI recipes' },
  { value: 'vetted_only', label: 'Curated Only', description: 'Only trusted recipes' },
  { value: 'ai_only', label: 'AI Only', description: 'Fresh AI-generated' },
];
const LEFTOVER_TOLERANCE_OPTIONS = [
  { value: 'low', label: 'Low', description: '2x max' },
  { value: 'moderate', label: 'Moderate', description: '3x max' },
  { value: 'high', label: 'High', description: '4x max' },
];

interface EditPreferencesScreenProps {
  navigation: any;
}

export const EditPreferencesScreen: React.FC<EditPreferencesScreenProps> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const successOpacity = useState(new Animated.Value(0))[0];
  const successScale = useState(new Animated.Value(0.5))[0];
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
    budget_friendly: false
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
        : [...prev.dietary_restrictions, item]
    }));
  };

  const toggleCuisine = (item: string) => {
    setPreferences(prev => ({
      ...prev,
      cuisine_preferences: prev.cuisine_preferences.includes(item)
        ? prev.cuisine_preferences.filter(c => c !== item)
        : [...prev.cuisine_preferences, item]
    }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const prefsToSave = {
        ...preferences,
        household_size: preferences.household_size || 1
      };
      await userService.updatePreferences(prefsToSave);
      // Refresh auth store so all screens pick up new preferences
      await useAuthStore.getState().loadUser();

      setShowSuccess(true);
      Animated.parallel([
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(successScale, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();

      setTimeout(() => {
        navigation.goBack();
      }, 200);
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

  const calTotal = (preferences.meal_calorie_distribution?.breakfast || 25) +
    (preferences.meal_calorie_distribution?.lunch || 35) +
    (preferences.meal_calorie_distribution?.dinner || 40);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Preferences</Text>
        <TouchableOpacity onPress={handleSave} disabled={loading} style={styles.saveHeaderButton}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.saveHeaderButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

        {/* Dietary Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dietary Restrictions</Text>
          <View style={styles.chipContainer}>
            {DIETARY_OPTIONS.map(option => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.chip,
                  preferences.dietary_restrictions.includes(option) && styles.chipSelected
                ]}
                onPress={() => toggleDietary(option)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.chipText,
                  preferences.dietary_restrictions.includes(option) && styles.chipTextSelected
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Cuisine Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Favorite Cuisines</Text>
          <View style={styles.chipContainer}>
            {CUISINE_OPTIONS.map(option => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.chip,
                  preferences.cuisine_preferences.includes(option) && styles.chipSelected
                ]}
                onPress={() => toggleCuisine(option)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.chipText,
                  preferences.cuisine_preferences.includes(option) && styles.chipTextSelected
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Cooking Skill */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cooking Skill</Text>
          <View style={styles.segmentRow}>
            {SKILL_LEVELS.map(skill => (
              <TouchableOpacity
                key={skill}
                style={[
                  styles.segmentButton,
                  preferences.cooking_skill === skill && styles.segmentButtonSelected
                ]}
                onPress={() => setPreferences(prev => ({ ...prev, cooking_skill: skill }))}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.segmentText,
                  preferences.cooking_skill === skill && styles.segmentTextSelected
                ]}>
                  {skill.charAt(0).toUpperCase() + skill.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Household & Nutrition */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Household & Nutrition</Text>

          <Text style={styles.fieldLabel}>Household Size</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={preferences.household_size ? preferences.household_size.toString() : ''}
            onChangeText={text => {
              const num = parseInt(text);
              setPreferences(prev => ({
                ...prev,
                household_size: text === '' ? 0 : (isNaN(num) ? prev.household_size : Math.min(20, Math.max(1, num)))
              }));
            }}
            placeholder="2"
            placeholderTextColor={colors.textMuted}
          />

          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Daily Calories</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={preferences.calorie_target?.toString() || ''}
                onChangeText={text => setPreferences(prev => ({
                  ...prev,
                  calorie_target: text ? parseInt(text) : undefined
                }))}
                placeholder="2000"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Protein (g)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={preferences.protein_target_grams?.toString() || ''}
                onChangeText={text => setPreferences(prev => ({
                  ...prev,
                  protein_target_grams: text ? parseInt(text) : undefined
                }))}
                placeholder="150"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
        </View>

        {/* Calorie Distribution */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Calorie Distribution</Text>
          <Text style={styles.cardSubtitle}>How to split daily calories across meals</Text>

          <View style={styles.distributionContainer}>
            {(['breakfast', 'lunch', 'dinner'] as const).map(meal => {
              const value = preferences.meal_calorie_distribution?.[meal] || (meal === 'breakfast' ? 25 : meal === 'lunch' ? 35 : 40);
              const min = meal === 'breakfast' ? 10 : meal === 'lunch' ? 15 : 20;
              const max = meal === 'breakfast' ? 50 : meal === 'lunch' ? 50 : 60;
              return (
                <View key={meal} style={styles.distributionItem}>
                  <Text style={styles.distributionLabel}>{meal.charAt(0).toUpperCase() + meal.slice(1)}</Text>
                  <View style={styles.distributionControls}>
                    <TouchableOpacity
                      style={styles.stepButton}
                      onPress={() => {
                        if (value > min) {
                          setPreferences(prev => ({
                            ...prev,
                            meal_calorie_distribution: {
                              breakfast: prev.meal_calorie_distribution?.breakfast ?? 25,
                              lunch: prev.meal_calorie_distribution?.lunch ?? 35,
                              dinner: prev.meal_calorie_distribution?.dinner ?? 40,
                              [meal]: value - 5
                            }
                          }));
                        }
                      }}
                    >
                      <Text style={styles.stepButtonText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.distributionValue}>{value}%</Text>
                    <TouchableOpacity
                      style={styles.stepButton}
                      onPress={() => {
                        if (value < max) {
                          setPreferences(prev => ({
                            ...prev,
                            meal_calorie_distribution: {
                              breakfast: prev.meal_calorie_distribution?.breakfast ?? 25,
                              lunch: prev.meal_calorie_distribution?.lunch ?? 35,
                              dinner: prev.meal_calorie_distribution?.dinner ?? 40,
                              [meal]: value + 5
                            }
                          }));
                        }
                      }}
                    >
                      <Text style={styles.stepButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={[styles.totalText, calTotal !== 100 && { color: colors.error }]}>
            Total: {calTotal}%{calTotal !== 100 ? ' (should be 100%)' : ''}
          </Text>
        </View>

        {/* Cooking Sessions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cooking Sessions</Text>
          <Text style={styles.cardSubtitle}>How many times per week do you want to cook?</Text>

          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepButton}
              onPress={() => {
                const current = preferences.cooking_sessions_per_week || 6;
                if (current > 3) setPreferences(prev => ({ ...prev, cooking_sessions_per_week: current - 1 }));
              }}
            >
              <Text style={styles.stepButtonText}>-</Text>
            </TouchableOpacity>
            <View style={styles.stepperDisplay}>
              <Text style={styles.stepperValue}>{preferences.cooking_sessions_per_week || 6}</Text>
              <Text style={styles.stepperLabel}>sessions</Text>
            </View>
            <TouchableOpacity
              style={styles.stepButton}
              onPress={() => {
                const current = preferences.cooking_sessions_per_week || 6;
                if (current < 14) setPreferences(prev => ({ ...prev, cooking_sessions_per_week: current + 1 }));
              }}
            >
              <Text style={styles.stepButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cardSubtitle}>
            {21 - (preferences.cooking_sessions_per_week || 6)} leftover meals per week
          </Text>
        </View>

        {/* Recipe Source */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recipe Source</Text>
          <Text style={styles.cardSubtitle}>Where should meal plan recipes come from?</Text>
          <View style={styles.segmentRow}>
            {RECIPE_SOURCE_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.segmentButton,
                  preferences.recipe_source_preference === option.value && styles.segmentButtonSelected
                ]}
                onPress={() => setPreferences(prev => ({ ...prev, recipe_source_preference: option.value }))}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.segmentText,
                  preferences.recipe_source_preference === option.value && styles.segmentTextSelected
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Leftover Tolerance */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Leftover Tolerance</Text>
          <Text style={styles.cardSubtitle}>How often can the same meal repeat?</Text>
          <View style={styles.segmentRow}>
            {LEFTOVER_TOLERANCE_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.segmentButton,
                  preferences.leftover_tolerance === option.value && styles.segmentButtonSelected
                ]}
                onPress={() => setPreferences(prev => ({ ...prev, leftover_tolerance: option.value }))}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.segmentText,
                  preferences.leftover_tolerance === option.value && styles.segmentTextSelected
                ]}>
                  {option.label}
                </Text>
                <Text style={[
                  styles.segmentSubtext,
                  preferences.leftover_tolerance === option.value && { color: 'rgba(255,255,255,0.7)' }
                ]}>
                  {option.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Budget Mode */}
        <TouchableOpacity
          style={[styles.card, styles.toggleCard, preferences.budget_friendly && styles.toggleCardActive]}
          onPress={() => setPreferences(prev => ({ ...prev, budget_friendly: !prev.budget_friendly }))}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { marginBottom: 4 }]}>Budget-Friendly Mode</Text>
            <Text style={styles.cardSubtitle}>Prioritize cheaper ingredients & maximize pantry usage</Text>
          </View>
          <View style={[styles.togglePill, preferences.budget_friendly && styles.togglePillActive]}>
            <Text style={styles.togglePillText}>
              {preferences.budget_friendly ? 'ON' : 'OFF'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Bottom Save Button */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.buttonText} />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Overlay */}
      {showSuccess && (
        <Animated.View
          style={[
            styles.successOverlay,
            { opacity: successOpacity, transform: [{ scale: successScale }] },
          ]}
        >
          <View style={styles.successCircle}>
            <Text style={styles.successCheckmark}>✓</Text>
          </View>
          <Text style={styles.successText}>Saved!</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    contentContainer: {
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
    saveHeaderButton: {
      width: 56,
      height: 36,
      justifyContent: 'center',
      alignItems: 'center',
    },
    saveHeaderButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
    },
    // Cards
    card: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 16,
      padding: 20,
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
    cardTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 14,
      letterSpacing: -0.2,
    },
    cardSubtitle: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 12,
      lineHeight: 18,
    },
    // Chips
    chipContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 16,
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
      color: colors.text,
      fontWeight: '500',
    },
    chipTextSelected: {
      color: colors.buttonText,
    },
    // Segmented controls
    segmentRow: {
      flexDirection: 'row',
      gap: 8,
    },
    segmentButton: {
      flex: 1,
      paddingVertical: 14,
      paddingHorizontal: 8,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
    },
    segmentButtonSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    segmentTextSelected: {
      color: colors.buttonText,
    },
    segmentSubtext: {
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 3,
    },
    // Input fields
    fieldLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 12,
    },
    fieldRow: {
      flexDirection: 'row',
      marginTop: 4,
    },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    // Distribution stepper
    distributionContainer: {
      gap: 12,
    },
    distributionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    distributionLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
      width: 80,
    },
    distributionControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    distributionValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      minWidth: 50,
      textAlign: 'center',
    },
    totalText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.success,
      textAlign: 'center',
      marginTop: 12,
    },
    // Step buttons
    stepButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primary + '18',
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepButtonText: {
      fontSize: 22,
      fontWeight: '600',
      color: colors.primary,
    },
    // Stepper
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      marginVertical: 8,
    },
    stepperDisplay: {
      alignItems: 'center',
    },
    stepperValue: {
      fontSize: 40,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: -1,
    },
    stepperLabel: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: -2,
    },
    // Toggle card
    toggleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    toggleCardActive: {
      borderColor: colors.success,
      backgroundColor: colors.successLight,
    },
    togglePill: {
      backgroundColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      marginLeft: 12,
    },
    togglePillActive: {
      backgroundColor: colors.success,
    },
    togglePillText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.buttonText,
    },
    // Save button
    saveButton: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: 'center',
      marginTop: 8,
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
    // Success overlay
    successOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
    },
    successCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.success,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    successCheckmark: {
      fontSize: 48,
      color: colors.buttonText,
      fontWeight: 'bold',
    },
    successText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.buttonText,
    },
  });
