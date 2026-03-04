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
  Animated
} from 'react-native';
import { UserPreferences } from '../../types/user';
import { userService } from '../../services/userService';

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Keto', 'Paleo', 'Pescatarian'];
const CUISINE_OPTIONS = ['Italian', 'Mexican', 'Asian', 'Mediterranean', 'American', 'Indian', 'French', 'Thai'];
const SKILL_LEVELS: Array<'beginner' | 'intermediate' | 'advanced'> = ['beginner', 'intermediate', 'advanced'];

interface EditPreferencesScreenProps {
  navigation: any;
}

export const EditPreferencesScreen: React.FC<EditPreferencesScreenProps> = ({ navigation }) => {
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
    disliked_ingredients: []
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
      // Ensure household_size has a valid value (default to 1 if undefined)
      const prefsToSave = {
        ...preferences,
        household_size: preferences.household_size || 1
      };
      await userService.updatePreferences(prefsToSave);

      // Show success animation and navigate back quickly
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

      // Navigate back after a brief moment
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

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={styles.loadingText}>Loading preferences...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit Preferences</Text>
        </View>

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
        value={preferences.household_size?.toString() || ''}
        onChangeText={text => {
          const num = parseInt(text);
          setPreferences(prev => ({
            ...prev,
            household_size: text === '' ? undefined : (isNaN(num) ? prev.household_size : Math.max(1, num))
          }));
        }}
        placeholder="1"
      />

      {/* Daily Targets */}
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

      {/* Save Button */}
      <TouchableOpacity
        style={styles.saveButton}
        onPress={handleSave}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveButtonText}>Save Changes</Text>
        )}
      </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Success Checkmark Overlay */}
      {showSuccess && (
        <Animated.View
          style={[
            styles.successOverlay,
            {
              opacity: successOpacity,
              transform: [{ scale: successScale }],
            },
          ]}
        >
          <View style={styles.successCircle}>
            <Text style={styles.successCheckmark}>✓</Text>
          </View>
          <Text style={styles.successText}>Saved!</Text>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  contentContainer: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF8F0',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#7F8C8D',
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B35',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginTop: 24,
    marginBottom: 12,
  },
  helperText: {
    fontSize: 14,
    color: '#7F8C8D',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8ED',
  },
  chipSelected: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  chipText: {
    fontSize: 14,
    color: '#2C3E50',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8ED',
    alignItems: 'center',
  },
  skillButtonSelected: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  skillButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E50',
  },
  skillButtonTextSelected: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8ED',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#2C3E50',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2C3E50',
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
    backgroundColor: '#FF6B35',
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
  bottomSpacer: {
    height: 40,
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#27AE60',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  successCheckmark: {
    fontSize: 60,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  successText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
