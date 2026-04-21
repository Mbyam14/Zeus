import React, { useState, useEffect, useMemo } from 'react';
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
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { BodyStats, ActivityLevel, Sex, Units } from '../../types/user';

const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; desc: string; multiplier: number }[] = [
  { value: 'sedentary', label: 'Sedentary', desc: 'Little or no exercise', multiplier: 1.2 },
  { value: 'lightly_active', label: 'Lightly Active', desc: 'Exercise 1-3 days/week', multiplier: 1.375 },
  { value: 'moderately_active', label: 'Moderately Active', desc: 'Exercise 3-5 days/week', multiplier: 1.55 },
  { value: 'very_active', label: 'Very Active', desc: 'Exercise 6-7 days/week', multiplier: 1.725 },
  { value: 'extra_active', label: 'Extra Active', desc: 'Very hard exercise daily', multiplier: 1.9 },
];

// Conversion helpers
const kgToLbs = (kg: number) => Math.round(kg * 2.20462);
const lbsToKg = (lbs: number) => lbs / 2.20462;
const cmToFeetInches = (cm: number) => {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { feet, inches };
};
const feetInchesToCm = (feet: number, inches: number) => (feet * 12 + inches) * 2.54;

interface BodyStatsScreenProps {
  navigation: any;
}

export const BodyStatsScreen: React.FC<BodyStatsScreenProps> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [stats, setStats] = useState<BodyStats>({
    sex: null,
    age: null,
    height_cm: null,
    weight_kg: null,
    goal_weight_kg: null,
    activity_level: null,
    units: 'imperial',
  });

  // Imperial display values
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [weightDisplay, setWeightDisplay] = useState('');
  const [goalWeightDisplay, setGoalWeightDisplay] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await userService.getBodyStats();
      setStats(data);
      syncDisplayValues(data);
    } catch (error) {
      console.error('Failed to load body stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncDisplayValues = (data: BodyStats) => {
    if (data.units === 'imperial') {
      if (data.height_cm) {
        const { feet, inches } = cmToFeetInches(data.height_cm);
        setHeightFeet(feet.toString());
        setHeightInches(inches.toString());
      }
      if (data.weight_kg) setWeightDisplay(kgToLbs(data.weight_kg).toString());
      if (data.goal_weight_kg) setGoalWeightDisplay(kgToLbs(data.goal_weight_kg).toString());
    } else {
      if (data.height_cm) {
        setHeightFeet(Math.round(data.height_cm).toString());
        setHeightInches('');
      }
      if (data.weight_kg) setWeightDisplay(Math.round(data.weight_kg).toString());
      if (data.goal_weight_kg) setGoalWeightDisplay(Math.round(data.goal_weight_kg).toString());
    }
  };

  const toggleUnits = () => {
    const newUnits: Units = stats.units === 'imperial' ? 'metric' : 'imperial';
    const newStats = { ...stats, units: newUnits };
    setStats(newStats);
    syncDisplayValues(newStats);
  };

  const updateWeight = (text: string) => {
    setWeightDisplay(text);
    const val = parseFloat(text);
    if (!isNaN(val) && val > 0) {
      setStats(prev => ({
        ...prev,
        weight_kg: prev.units === 'imperial' ? lbsToKg(val) : val,
      }));
    }
  };

  const updateGoalWeight = (text: string) => {
    setGoalWeightDisplay(text);
    const val = parseFloat(text);
    if (!isNaN(val) && val > 0) {
      setStats(prev => ({
        ...prev,
        goal_weight_kg: prev.units === 'imperial' ? lbsToKg(val) : val,
      }));
    }
  };

  const updateHeight = (feet: string, inches: string) => {
    if (stats.units === 'imperial') {
      setHeightFeet(feet);
      setHeightInches(inches);
      const f = parseInt(feet) || 0;
      const i = parseInt(inches) || 0;
      if (f > 0) {
        setStats(prev => ({ ...prev, height_cm: feetInchesToCm(f, i) }));
      }
    } else {
      setHeightFeet(feet);
      const cm = parseFloat(feet);
      if (!isNaN(cm) && cm > 0) {
        setStats(prev => ({ ...prev, height_cm: cm }));
      }
    }
  };

  // TDEE Calculation (Mifflin-St Jeor)
  const calculation = useMemo(() => {
    if (!stats.sex || !stats.age || !stats.height_cm || !stats.weight_kg || !stats.activity_level) {
      return null;
    }

    const bmr = stats.sex === 'male'
      ? (10 * stats.weight_kg) + (6.25 * stats.height_cm) - (5 * stats.age) + 5
      : (10 * stats.weight_kg) + (6.25 * stats.height_cm) - (5 * stats.age) - 161;

    const activityData = ACTIVITY_LEVELS.find(a => a.value === stats.activity_level);
    const tdee = Math.round(bmr * (activityData?.multiplier || 1.2));

    // Adjust for goal
    let suggestedCalories = tdee;
    if (stats.goal_weight_kg && stats.weight_kg) {
      if (stats.goal_weight_kg < stats.weight_kg) {
        suggestedCalories = Math.max(1200, tdee - 500); // Deficit
      } else if (stats.goal_weight_kg > stats.weight_kg) {
        suggestedCalories = tdee + 300; // Surplus
      }
    }

    // Macro split: 30% protein, 40% carbs, 30% fat
    const proteinCals = suggestedCalories * 0.30;
    const carbCals = suggestedCalories * 0.40;
    const fatCals = suggestedCalories * 0.30;

    return {
      bmr: Math.round(bmr),
      tdee,
      suggestedCalories,
      protein: Math.round(proteinCals / 4), // 4 cal/g
      carbs: Math.round(carbCals / 4),     // 4 cal/g
      fat: Math.round(fatCals / 9),         // 9 cal/g
    };
  }, [stats]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await userService.updateBodyStats(stats);
      await useAuthStore.getState().loadUser();
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to save body stats');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyTargets = async () => {
    if (!calculation) return;

    try {
      setSaving(true);
      // Save body stats
      await userService.updateBodyStats(stats);

      // Update nutrition targets in preferences
      const prefs = await userService.getPreferences();
      const updatedPrefs = {
        dietary_restrictions: prefs.dietary_restrictions || [],
        cuisine_preferences: prefs.cuisine_preferences || [],
        cooking_skill: prefs.cooking_skill || 'intermediate',
        household_size: prefs.household_size || 2,
        allergies: prefs.allergies || [],
        disliked_ingredients: prefs.disliked_ingredients || [],
        meal_calorie_distribution: prefs.meal_calorie_distribution,
        cooking_sessions_per_week: prefs.cooking_sessions_per_week,
        recipe_source_preference: prefs.recipe_source_preference,
        leftover_tolerance: prefs.leftover_tolerance,
        budget_friendly: prefs.budget_friendly,
        calorie_target: calculation.suggestedCalories,
        protein_target_grams: calculation.protein,
        carb_target_grams: calculation.carbs,
        fat_target_grams: calculation.fat,
      };
      await userService.updatePreferences(updatedPrefs as any);

      await useAuthStore.getState().loadUser();
      Alert.alert('Applied', 'Nutrition targets updated based on your stats');
      navigation.goBack();
    } catch (error: any) {
      console.error('Apply targets error:', error?.response?.data || error);
      Alert.alert('Error', error?.response?.data?.detail || 'Failed to apply targets');
    } finally {
      setSaving(false);
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Body & Goals</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerButton}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="checkmark" size={26} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Units Toggle */}
          <View style={styles.unitsRow}>
            <Text style={styles.unitsLabel}>Units</Text>
            <View style={styles.unitsToggle}>
              <TouchableOpacity
                style={[styles.unitsOption, stats.units === 'imperial' && styles.unitsOptionActive]}
                onPress={() => { if (stats.units !== 'imperial') toggleUnits(); }}
              >
                <Text style={[styles.unitsOptionText, stats.units === 'imperial' && styles.unitsOptionTextActive]}>
                  Imperial
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.unitsOption, stats.units === 'metric' && styles.unitsOptionActive]}
                onPress={() => { if (stats.units !== 'metric') toggleUnits(); }}
              >
                <Text style={[styles.unitsOptionText, stats.units === 'metric' && styles.unitsOptionTextActive]}>
                  Metric
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Sex */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="person-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Sex</Text>
            </View>
            <View style={styles.pillRow}>
              {(['male', 'female'] as Sex[]).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.pill, stats.sex === s && styles.pillActive]}
                  onPress={() => setStats(prev => ({ ...prev, sex: s }))}
                >
                  <Ionicons
                    name={s === 'male' ? 'male' : 'female'}
                    size={18}
                    color={stats.sex === s ? colors.buttonText : colors.text}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.pillText, stats.sex === s && styles.pillTextActive]}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Age */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.warning + '18' }]}>
                <Ionicons name="calendar-outline" size={20} color={colors.warning} />
              </View>
              <Text style={styles.sectionTitle}>Age</Text>
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.numberInput}
                keyboardType="numeric"
                value={stats.age?.toString() || ''}
                onChangeText={t => setStats(prev => ({ ...prev, age: t ? parseInt(t) : null }))}
                placeholder="25"
                placeholderTextColor={colors.textMuted}
                autoComplete="off"
                textContentType="none"
              />
              <Text style={styles.inputUnit}>years</Text>
            </View>
          </View>

          {/* Height */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconCircle, { backgroundColor: '#8B5CF6' + '18' }]}>
                <Ionicons name="resize-outline" size={20} color="#8B5CF6" />
              </View>
              <Text style={styles.sectionTitle}>Height</Text>
            </View>
            {stats.units === 'imperial' ? (
              <View style={styles.heightRow}>
                <View style={styles.heightInputGroup}>
                  <TextInput
                    style={styles.numberInput}
                    keyboardType="numeric"
                    value={heightFeet}
                    onChangeText={t => updateHeight(t, heightInches)}
                    placeholder="5"
                    placeholderTextColor={colors.textMuted}
                    autoComplete="off"
                    importantForAutofill="no"
                  />
                  <Text style={styles.inputUnit}>ft</Text>
                </View>
                <View style={styles.heightInputGroup}>
                  <TextInput
                    style={styles.numberInput}
                    keyboardType="numeric"
                    value={heightInches}
                    onChangeText={t => updateHeight(heightFeet, t)}
                    placeholder="10"
                    placeholderTextColor={colors.textMuted}
                    autoComplete="off"
                    importantForAutofill="no"
                  />
                  <Text style={styles.inputUnit}>in</Text>
                </View>
              </View>
            ) : (
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numberInput}
                  keyboardType="numeric"
                  value={heightFeet}
                  onChangeText={t => updateHeight(t, '')}
                  placeholder="175"
                  placeholderTextColor={colors.textMuted}
                  autoComplete="off"
                  importantForAutofill="no"
                />
                <Text style={styles.inputUnit}>cm</Text>
              </View>
            )}
          </View>

          {/* Weight & Goal Weight */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.success + '18' }]}>
                <Ionicons name="speedometer-outline" size={20} color={colors.success} />
              </View>
              <Text style={styles.sectionTitle}>Weight</Text>
            </View>
            <View style={styles.weightRow}>
              <View style={styles.weightGroup}>
                <Text style={styles.weightLabel}>Current</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.numberInput}
                    keyboardType="numeric"
                    value={weightDisplay}
                    onChangeText={updateWeight}
                    placeholder={stats.units === 'imperial' ? '170' : '77'}
                    placeholderTextColor={colors.textMuted}
                    autoComplete="off"
                    importantForAutofill="no"
                  />
                  <Text style={styles.inputUnit}>{stats.units === 'imperial' ? 'lbs' : 'kg'}</Text>
                </View>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.textMuted} style={{ marginTop: 28 }} />
              <View style={styles.weightGroup}>
                <Text style={styles.weightLabel}>Goal</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.numberInput}
                    keyboardType="numeric"
                    value={goalWeightDisplay}
                    onChangeText={updateGoalWeight}
                    placeholder={stats.units === 'imperial' ? '155' : '70'}
                    placeholderTextColor={colors.textMuted}
                    autoComplete="off"
                    importantForAutofill="no"
                  />
                  <Text style={styles.inputUnit}>{stats.units === 'imperial' ? 'lbs' : 'kg'}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Activity Level */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.error + '18' }]}>
                <Ionicons name="fitness-outline" size={20} color={colors.error} />
              </View>
              <Text style={styles.sectionTitle}>Activity Level</Text>
            </View>
            {ACTIVITY_LEVELS.map(level => {
              const selected = stats.activity_level === level.value;
              return (
                <TouchableOpacity
                  key={level.value}
                  style={[styles.activityCard, selected && styles.activityCardActive]}
                  onPress={() => setStats(prev => ({ ...prev, activity_level: level.value }))}
                >
                  <View style={styles.activityLeft}>
                    <View style={[styles.activityRadio, selected && styles.activityRadioActive]}>
                      {selected && <View style={styles.activityRadioDot} />}
                    </View>
                    <View>
                      <Text style={[styles.activityLabel, selected && styles.activityLabelActive]}>
                        {level.label}
                      </Text>
                      <Text style={[styles.activityDesc, selected && styles.activityDescActive]}>
                        {level.desc}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* TDEE Results */}
          {calculation && (
            <View style={styles.resultsSection}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconCircle, { backgroundColor: colors.primary + '18' }]}>
                  <Ionicons name="calculator-outline" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.sectionTitle}>Your Calculated Targets</Text>
                  <Text style={styles.sectionSubtitle}>Based on Mifflin-St Jeor equation</Text>
                </View>
              </View>

              <View style={styles.resultsGrid}>
                <View style={styles.resultCard}>
                  <Text style={styles.resultValue}>{calculation.tdee}</Text>
                  <Text style={styles.resultLabel}>TDEE (cal/day)</Text>
                </View>
                <View style={[styles.resultCard, { backgroundColor: colors.primary + '12' }]}>
                  <Text style={[styles.resultValue, { color: colors.primary }]}>{calculation.suggestedCalories}</Text>
                  <Text style={styles.resultLabel}>
                    {stats.goal_weight_kg && stats.weight_kg
                      ? stats.goal_weight_kg < stats.weight_kg ? 'Target (deficit)' : stats.goal_weight_kg > stats.weight_kg ? 'Target (surplus)' : 'Maintenance'
                      : 'Maintenance'}
                  </Text>
                </View>
              </View>

              <View style={styles.macroRow}>
                <View style={[styles.macroCard, { borderLeftColor: colors.proteinColor || '#3B82F6' }]}>
                  <Text style={styles.macroValue}>{calculation.protein}g</Text>
                  <Text style={styles.macroLabel}>Protein</Text>
                </View>
                <View style={[styles.macroCard, { borderLeftColor: colors.carbsColor || '#F59E0B' }]}>
                  <Text style={styles.macroValue}>{calculation.carbs}g</Text>
                  <Text style={styles.macroLabel}>Carbs</Text>
                </View>
                <View style={[styles.macroCard, { borderLeftColor: colors.fatColor || '#EF4444' }]}>
                  <Text style={styles.macroValue}>{calculation.fat}g</Text>
                  <Text style={styles.macroLabel}>Fat</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.applyButton} onPress={handleApplyTargets} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.buttonText} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color={colors.buttonText} style={{ marginRight: 8 }} />
                    <Text style={styles.applyButtonText}>Apply to Nutrition Goals</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
    headerButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
    scrollContent: { padding: 16 },

    // Units toggle
    unitsRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.backgroundSecondary, borderRadius: 14, padding: 14, marginBottom: 14,
    },
    unitsLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
    unitsToggle: {
      flexDirection: 'row', backgroundColor: colors.background, borderRadius: 10, padding: 3,
    },
    unitsOption: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
    unitsOptionActive: { backgroundColor: colors.primary },
    unitsOptionText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
    unitsOptionTextActive: { color: colors.buttonText },

    // Sections
    section: {
      backgroundColor: colors.backgroundSecondary, borderRadius: 16, padding: 18, marginBottom: 14,
      ...Platform.select({
        ios: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8 },
        android: { elevation: 2 },
      }),
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    sectionIconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    sectionSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

    // Sex pills
    pillRow: { flexDirection: 'row', gap: 12 },
    pill: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 14, borderRadius: 14,
      backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
    },
    pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    pillText: { fontSize: 16, fontWeight: '600', color: colors.text },
    pillTextActive: { color: colors.buttonText },

    // Inputs
    inputRow: { flexDirection: 'row', alignItems: 'center' },
    numberInput: {
      flex: 1, fontSize: 24, fontWeight: '700', color: colors.text,
      backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
      borderWidth: 1, borderColor: colors.border,
    },
    inputUnit: { fontSize: 16, fontWeight: '600', color: colors.textMuted, marginLeft: 10 },

    // Height
    heightRow: { flexDirection: 'row', gap: 12 },
    heightInputGroup: { flex: 1, flexDirection: 'row', alignItems: 'center' },

    // Weight
    weightRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    weightGroup: { flex: 1 },
    weightLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 8 },

    // Activity
    activityCard: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8,
      backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
    },
    activityCardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
    activityLeft: { flexDirection: 'row', alignItems: 'center' },
    activityRadio: {
      width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border,
      justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    activityRadioActive: { borderColor: colors.primary },
    activityRadioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
    activityLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    activityLabelActive: { color: colors.primary },
    activityDesc: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    activityDescActive: { color: colors.primary + 'AA' },

    // Results
    resultsSection: {
      backgroundColor: colors.backgroundSecondary, borderRadius: 16, padding: 18, marginBottom: 14,
      borderWidth: 2, borderColor: colors.primary + '30',
    },
    resultsGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    resultCard: {
      flex: 1, backgroundColor: colors.background, borderRadius: 14, padding: 16, alignItems: 'center',
    },
    resultValue: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -1 },
    resultLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginTop: 4, textAlign: 'center' },
    macroRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    macroCard: {
      flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 12, alignItems: 'center',
      borderLeftWidth: 3,
    },
    macroValue: { fontSize: 18, fontWeight: '700', color: colors.text },
    macroLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginTop: 2 },

    applyButton: {
      flexDirection: 'row', backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
      ...Platform.select({
        ios: { shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
        android: { elevation: 4 },
      }),
    },
    applyButtonText: { fontSize: 16, fontWeight: '700', color: colors.buttonText },
  });
