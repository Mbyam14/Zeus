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
} from 'react-native';
import { UserPreferences } from '../../types/user';
import { userService } from '../../services/userService';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Keto', 'Paleo', 'Pescatarian'];
const CUISINE_OPTIONS = ['Italian', 'Mexican', 'Asian', 'Mediterranean', 'American', 'Indian', 'French', 'Thai'];
const SKILL_LEVELS: Array<'beginner' | 'intermediate' | 'advanced'> = ['beginner', 'intermediate', 'advanced'];

interface PreferencesSetupScreenProps {
  navigation: any;
}

export const PreferencesSetupScreen: React.FC<PreferencesSetupScreenProps> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { setSetupCompleted } = useAuthStore();
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>({
    dietary_restrictions: [],
    cuisine_preferences: [],
    cooking_skill: 'intermediate',
    household_size: 2,
    calorie_target: undefined,
    protein_target_grams: undefined,
    allergies: [],
    disliked_ingredients: []
  });

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
        household_size: preferences.household_size || 2,
      };
      await userService.updatePreferences(prefsToSave);
      Alert.alert('Success', 'Your preferences have been saved!');
      setSetupCompleted();  // AppNavigator will auto-navigate to main app
    } catch (error) {
      console.error('Failed to save preferences:', error);
      Alert.alert('Error', 'Failed to save preferences. You can update them later in your profile.');
      setSetupCompleted();  // Still allow access even if save fails
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    setSetupCompleted();  // AppNavigator will auto-navigate to main app
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Set Up Your Preferences</Text>
      <Text style={styles.subtitle}>Help us personalize your meal plans</Text>

      {/* Dietary Restrictions */}
      <Text style={styles.sectionTitle}>Dietary Restrictions</Text>
      <View style={styles.chipContainer}>
        {DIETARY_OPTIONS.map(option => (
          <TouchableOpacity
            key={option}
            style={[
              styles.chip,
              preferences.dietary_restrictions.includes(option) && styles.chipSelected
            ]}
            onPress={() => toggleDietary(option)}
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

      {/* Cuisine Preferences */}
      <Text style={styles.sectionTitle}>Favorite Cuisines</Text>
      <View style={styles.chipContainer}>
        {CUISINE_OPTIONS.map(option => (
          <TouchableOpacity
            key={option}
            style={[
              styles.chip,
              preferences.cuisine_preferences.includes(option) && styles.chipSelected
            ]}
            onPress={() => toggleCuisine(option)}
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

      {/* Cooking Skill */}
      <Text style={styles.sectionTitle}>Cooking Skill Level</Text>
      <View style={styles.skillContainer}>
        {SKILL_LEVELS.map(skill => (
          <TouchableOpacity
            key={skill}
            style={[
              styles.skillButton,
              preferences.cooking_skill === skill && styles.skillButtonSelected
            ]}
            onPress={() => setPreferences(prev => ({ ...prev, cooking_skill: skill }))}
          >
            <Text style={[
              styles.skillButtonText,
              preferences.cooking_skill === skill && styles.skillButtonTextSelected
            ]}>
              {skill.charAt(0).toUpperCase() + skill.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Household Size */}
      <Text style={styles.sectionTitle}>Household Size</Text>
      <Text style={styles.helperText}>How many people do you typically cook for?</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={preferences.household_size ? String(preferences.household_size) : ''}
        onChangeText={text => {
          const num = parseInt(text);
          setPreferences(prev => ({
            ...prev,
            household_size: text === '' ? 0 : (isNaN(num) ? prev.household_size : Math.min(20, Math.max(1, num)))
          }));
        }}
        placeholder="2"
      />

      {/* Optional: Daily Targets */}
      <Text style={styles.sectionTitle}>Daily Nutrition Goals (Optional)</Text>
      <Text style={styles.helperText}>Leave blank if you don't track macros</Text>

      <View style={styles.row}>
        <View style={styles.halfInput}>
          <Text style={styles.inputLabel}>Calories</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={preferences.calorie_target?.toString() || ''}
            onChangeText={text => setPreferences(prev => ({
              ...prev,
              calorie_target: text ? parseInt(text) : undefined
            }))}
            placeholder="2000"
          />
        </View>
        <View style={styles.halfInput}>
          <Text style={styles.inputLabel}>Protein (g)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={preferences.protein_target_grams?.toString() || ''}
            onChangeText={text => setPreferences(prev => ({
              ...prev,
              protein_target_grams: text ? parseInt(text) : undefined
            }))}
            placeholder="150"
          />
        </View>
      </View>

      {/* Action Buttons */}
      <TouchableOpacity
        style={styles.saveButton}
        onPress={handleSave}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveButtonText}>Complete Setup</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleSkip} disabled={loading}>
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>

      <View style={styles.bottomSpacer} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    contentContainer: {
      padding: 20,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text,
      marginTop: 20,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textMuted,
      marginBottom: 32,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginTop: 24,
      marginBottom: 12,
    },
    helperText: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 8,
    },
    chipContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
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
      color: '#FFFFFF',
    },
    skillContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    skillButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    skillButtonSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    skillButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    skillButtonTextSelected: {
      color: '#FFFFFF',
    },
    input: {
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.text,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 6,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    halfInput: {
      flex: 1,
    },
    saveButton: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 32,
    },
    saveButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    skipText: {
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 16,
      marginTop: 16,
    },
    bottomSpacer: {
      height: 40,
    },
  });
