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
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { UserPreferences } from '../../types/user';

const COMMON_ALLERGIES = [
  { label: 'Peanuts', icon: 'nutrition-outline' },
  { label: 'Tree Nuts', icon: 'leaf-outline' },
  { label: 'Milk', icon: 'water-outline' },
  { label: 'Eggs', icon: 'ellipse-outline' },
  { label: 'Wheat', icon: 'restaurant-outline' },
  { label: 'Soy', icon: 'flask-outline' },
  { label: 'Fish', icon: 'fish-outline' },
  { label: 'Shellfish', icon: 'boat-outline' },
  { label: 'Sesame', icon: 'ellipse-outline' },
];

interface AllergiesScreenProps {
  navigation: any;
}

export const AllergiesScreen: React.FC<AllergiesScreenProps> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikedIngredients, setDislikedIngredients] = useState<string[]>([]);
  const [customAllergyInput, setCustomAllergyInput] = useState('');
  const [dislikeInput, setDislikeInput] = useState('');
  const [prefsRef, setPrefsRef] = useState<UserPreferences | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const prefs = await userService.getPreferences();
      setPrefsRef(prefs);
      setAllergies(prefs.allergies || []);
      setDislikedIngredients(prefs.disliked_ingredients || []);
    } catch (error) {
      console.error('Failed to load preferences:', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const toggleAllergy = (allergy: string) => {
    setAllergies(prev =>
      prev.includes(allergy)
        ? prev.filter(a => a !== allergy)
        : [...prev, allergy]
    );
  };

  const addCustomAllergy = () => {
    const trimmed = customAllergyInput.trim();
    if (trimmed && !allergies.includes(trimmed)) {
      setAllergies(prev => [...prev, trimmed]);
      setCustomAllergyInput('');
    }
  };

  const addDislike = () => {
    const trimmed = dislikeInput.trim();
    if (trimmed && !dislikedIngredients.includes(trimmed)) {
      setDislikedIngredients(prev => [...prev, trimmed]);
      setDislikeInput('');
    }
  };

  const removeDislike = (item: string) => {
    setDislikedIngredients(prev => prev.filter(d => d !== item));
  };

  const removeCustomAllergy = (item: string) => {
    setAllergies(prev => prev.filter(a => a !== item));
  };

  const handleSave = async () => {
    if (!prefsRef) return;
    try {
      setSaving(true);
      const updatedPrefs = {
        dietary_restrictions: prefsRef.dietary_restrictions || [],
        cuisine_preferences: prefsRef.cuisine_preferences || [],
        cooking_skill: prefsRef.cooking_skill || 'intermediate',
        household_size: prefsRef.household_size || 2,
        calorie_target: prefsRef.calorie_target,
        protein_target_grams: prefsRef.protein_target_grams,
        carb_target_grams: prefsRef.carb_target_grams,
        fat_target_grams: prefsRef.fat_target_grams,
        meal_calorie_distribution: prefsRef.meal_calorie_distribution,
        cooking_sessions_per_week: prefsRef.cooking_sessions_per_week,
        recipe_source_preference: prefsRef.recipe_source_preference,
        leftover_tolerance: prefsRef.leftover_tolerance,
        budget_friendly: prefsRef.budget_friendly,
        allergies,
        disliked_ingredients: dislikedIngredients,
      };
      await userService.updatePreferences(updatedPrefs as any);
      await useAuthStore.getState().loadUser();
      navigation.goBack();
    } catch (error: any) {
      console.error('Save allergies error:', error?.response?.data || error);
      Alert.alert('Error', error?.response?.data?.detail || 'Failed to save changes');
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

  // Custom allergies not in the common list
  const customAllergies = allergies.filter(a => !COMMON_ALLERGIES.some(ca => ca.label === a));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Allergies & Dislikes</Text>
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

          {/* Allergies */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.error + '18' }]}>
                <Ionicons name="warning-outline" size={20} color={colors.error} />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Food Allergies</Text>
                <Text style={styles.sectionSubtitle}>These ingredients will be excluded from all recipes</Text>
              </View>
            </View>

            <View style={styles.chipGrid}>
              {COMMON_ALLERGIES.map(allergy => {
                const selected = allergies.includes(allergy.label);
                return (
                  <TouchableOpacity
                    key={allergy.label}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => toggleAllergy(allergy.label)}
                  >
                    <Ionicons
                      name={allergy.icon as any}
                      size={16}
                      color={selected ? colors.buttonText : colors.textSecondary}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {allergy.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom allergies */}
            {customAllergies.length > 0 && (
              <View style={styles.customChips}>
                {customAllergies.map(item => (
                  <View key={item} style={[styles.chip, styles.chipSelected]}>
                    <Text style={[styles.chipText, styles.chipTextSelected]}>{item}</Text>
                    <TouchableOpacity onPress={() => removeCustomAllergy(item)} style={{ marginLeft: 6 }}>
                      <Ionicons name="close-circle" size={16} color={colors.buttonText} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Add custom */}
            <View style={styles.addRow}>
              <TextInput
                style={styles.addInput}
                value={customAllergyInput}
                onChangeText={setCustomAllergyInput}
                placeholder="Add custom allergy..."
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={addCustomAllergy}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.addButton} onPress={addCustomAllergy}>
                <Ionicons name="add" size={22} color={colors.buttonText} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Disliked Ingredients */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.warning + '18' }]}>
                <Ionicons name="thumbs-down-outline" size={20} color={colors.warning} />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Disliked Ingredients</Text>
                <Text style={styles.sectionSubtitle}>We'll minimize these in your meal plans</Text>
              </View>
            </View>

            {dislikedIngredients.length > 0 && (
              <View style={styles.chipGrid}>
                {dislikedIngredients.map(item => (
                  <View key={item} style={[styles.chip, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}>
                    <Text style={[styles.chipText, { color: colors.warning }]}>{item}</Text>
                    <TouchableOpacity onPress={() => removeDislike(item)} style={{ marginLeft: 6 }}>
                      <Ionicons name="close-circle" size={16} color={colors.warning} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.addRow}>
              <TextInput
                style={styles.addInput}
                value={dislikeInput}
                onChangeText={setDislikeInput}
                placeholder="Add ingredient (e.g., cilantro, olives)..."
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={addDislike}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.addButton} onPress={addDislike}>
                <Ionicons name="add" size={22} color={colors.buttonText} />
              </TouchableOpacity>
            </View>

            {dislikedIngredients.length === 0 && (
              <Text style={styles.emptyHint}>No disliked ingredients added yet</Text>
            )}
          </View>

          {/* Save Button */}
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.buttonText} />
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

    section: {
      backgroundColor: colors.backgroundSecondary, borderRadius: 16, padding: 18, marginBottom: 14,
      ...Platform.select({
        ios: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8 },
        android: { elevation: 2 },
      }),
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    sectionIconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    sectionHeaderText: { flex: 1 },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    sectionSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24,
      backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
    },
    chipSelected: { backgroundColor: colors.error, borderColor: colors.error },
    chipText: { fontSize: 14, fontWeight: '500', color: colors.text },
    chipTextSelected: { color: colors.buttonText },
    customChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },

    addRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
    addInput: {
      flex: 1, backgroundColor: colors.background, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 8,
      fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border,
    },
    addButton: {
      width: 44, height: 44, borderRadius: 12,
      backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    },

    emptyHint: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 12, fontStyle: 'italic' },

    saveButton: {
      flexDirection: 'row', backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
      ...Platform.select({
        ios: { shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
        android: { elevation: 4 },
      }),
    },
    saveButtonText: { color: colors.buttonText, fontSize: 17, fontWeight: '700' },
  });
