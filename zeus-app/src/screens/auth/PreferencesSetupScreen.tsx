import React, { useState, useRef } from 'react';
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
  Dimensions,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserPreferences } from '../../types/user';
import { userService } from '../../services/userService';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_STEPS = 5;

const DIETARY_OPTIONS = [
  { label: 'Vegetarian', icon: 'leaf-outline' as const },
  { label: 'Vegan', icon: 'flower-outline' as const },
  { label: 'Gluten-Free', icon: 'ban-outline' as const },
  { label: 'Dairy-Free', icon: 'water-outline' as const },
  { label: 'Keto', icon: 'flame-outline' as const },
  { label: 'Paleo', icon: 'fish-outline' as const },
  { label: 'Pescatarian', icon: 'fish-outline' as const },
];

const CUISINE_OPTIONS = [
  { label: 'Italian', emoji: '🇮🇹' },
  { label: 'Mexican', emoji: '🇲🇽' },
  { label: 'Asian', emoji: '🥢' },
  { label: 'Mediterranean', emoji: '🫒' },
  { label: 'American', emoji: '🇺🇸' },
  { label: 'Indian', emoji: '🇮🇳' },
  { label: 'French', emoji: '🇫🇷' },
  { label: 'Thai', emoji: '🇹🇭' },
  { label: 'Japanese', emoji: '🇯🇵' },
  { label: 'Korean', emoji: '🇰🇷' },
  { label: 'Greek', emoji: '🇬🇷' },
  { label: 'Latin American', emoji: '🌮' },
];

const SKILL_LEVELS = [
  { key: 'beginner' as const, label: 'Beginner', icon: 'sparkles-outline' as const, desc: 'Simple recipes, few ingredients' },
  { key: 'intermediate' as const, label: 'Intermediate', icon: 'restaurant-outline' as const, desc: 'Comfortable with most techniques' },
  { key: 'advanced' as const, label: 'Advanced', icon: 'trophy-outline' as const, desc: 'Bring on the challenge!' },
];

const HOUSEHOLD_SIZES = [1, 2, 3, 4, 5, 6];

interface PreferencesSetupScreenProps {
  navigation: any;
}

export const PreferencesSetupScreen: React.FC<PreferencesSetupScreenProps> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { setSetupCompleted, user } = useAuthStore();
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [preferences, setPreferences] = useState<UserPreferences>({
    dietary_restrictions: [],
    cuisine_preferences: [],
    cooking_skill: 'intermediate',
    household_size: 2,
    calorie_target: undefined,
    protein_target_grams: undefined,
    allergies: [],
    disliked_ingredients: [],
  });

  const animateTransition = (direction: 'forward' | 'back', callback: () => void) => {
    const toValue = direction === 'forward' ? -SCREEN_WIDTH : SCREEN_WIDTH;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      callback();
      slideAnim.setValue(direction === 'forward' ? SCREEN_WIDTH : -SCREEN_WIDTH);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
      ]).start();
    });
  };

  const goNext = () => {
    if (currentStep < TOTAL_STEPS - 1) {
      animateTransition('forward', () => setCurrentStep(s => s + 1));
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      animateTransition('back', () => setCurrentStep(s => s - 1));
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
      await userService.updatePreferences({
        ...preferences,
        household_size: preferences.household_size || 2,
      });
      setSetupCompleted();
    } catch (error) {
      console.error('Failed to save preferences:', error);
      Alert.alert('Error', 'Failed to save preferences. You can update them later in your profile.');
      setSetupCompleted();
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    setSetupCompleted();
  };

  // --- STEP RENDERERS ---

  const renderWelcome = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.welcomeIconCircle, { backgroundColor: colors.primary + '15' }]}>
        <Ionicons name="restaurant" size={56} color={colors.primary} />
      </View>
      <Text style={styles.welcomeTitle}>Welcome{user?.username ? `, ${user.username}` : ''}!</Text>
      <Text style={styles.welcomeSubtitle}>
        Let's personalize Zeus so your meal plans, recipes, and grocery lists are tailored just for you.
      </Text>
      <Text style={styles.welcomeHint}>This takes about 30 seconds</Text>
    </View>
  );

  const renderDietary = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Any dietary needs?</Text>
      <Text style={styles.stepSubtitle}>Select all that apply, or skip if none</Text>
      <View style={styles.optionGrid}>
        {DIETARY_OPTIONS.map(option => {
          const selected = preferences.dietary_restrictions.includes(option.label);
          return (
            <TouchableOpacity
              key={option.label}
              style={[
                styles.optionCard,
                { backgroundColor: selected ? colors.primary + '15' : colors.backgroundSecondary, borderColor: selected ? colors.primary : colors.border },
              ]}
              onPress={() => toggleDietary(option.label)}
              activeOpacity={0.7}
            >
              <Ionicons name={option.icon} size={24} color={selected ? colors.primary : colors.textMuted} />
              <Text style={[styles.optionLabel, { color: selected ? colors.primary : colors.text }]}>
                {option.label}
              </Text>
              {selected && (
                <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                  <Ionicons name="checkmark" size={12} color="#FFF" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderCuisines = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What do you love to eat?</Text>
      <Text style={styles.stepSubtitle}>Pick your favorite cuisines for better recommendations</Text>
      <View style={styles.cuisineGrid}>
        {CUISINE_OPTIONS.map(option => {
          const selected = preferences.cuisine_preferences.includes(option.label);
          return (
            <TouchableOpacity
              key={option.label}
              style={[
                styles.cuisineCard,
                { backgroundColor: selected ? colors.primary + '15' : colors.backgroundSecondary, borderColor: selected ? colors.primary : colors.border },
              ]}
              onPress={() => toggleCuisine(option.label)}
              activeOpacity={0.7}
            >
              <Text style={styles.cuisineEmoji}>{option.emoji}</Text>
              <Text style={[styles.cuisineLabel, { color: selected ? colors.primary : colors.text }]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderSkillAndHousehold = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>About your kitchen</Text>
      <Text style={styles.stepSubtitle}>This helps us pick the right recipes for you</Text>

      <Text style={styles.fieldLabel}>Cooking skill level</Text>
      <View style={styles.skillContainer}>
        {SKILL_LEVELS.map(skill => {
          const selected = preferences.cooking_skill === skill.key;
          return (
            <TouchableOpacity
              key={skill.key}
              style={[
                styles.skillCard,
                { backgroundColor: selected ? colors.primary + '15' : colors.backgroundSecondary, borderColor: selected ? colors.primary : colors.border },
              ]}
              onPress={() => setPreferences(prev => ({ ...prev, cooking_skill: skill.key }))}
              activeOpacity={0.7}
            >
              <Ionicons name={skill.icon} size={28} color={selected ? colors.primary : colors.textMuted} />
              <Text style={[styles.skillLabel, { color: selected ? colors.primary : colors.text }]}>{skill.label}</Text>
              <Text style={[styles.skillDesc, { color: colors.textMuted }]}>{skill.desc}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.fieldLabel, { marginTop: 28 }]}>Household size</Text>
      <Text style={[styles.stepSubtitle, { marginBottom: 12 }]}>How many people do you cook for?</Text>
      <View style={styles.householdRow}>
        {HOUSEHOLD_SIZES.map(size => {
          const selected = preferences.household_size === size;
          return (
            <TouchableOpacity
              key={size}
              style={[
                styles.householdChip,
                { backgroundColor: selected ? colors.primary : colors.backgroundSecondary, borderColor: selected ? colors.primary : colors.border },
              ]}
              onPress={() => setPreferences(prev => ({ ...prev, household_size: size }))}
              activeOpacity={0.7}
            >
              <Text style={[styles.householdText, { color: selected ? '#FFF' : colors.text }]}>
                {size}{size === 6 ? '+' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderNutritionGoals = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Nutrition goals</Text>
      <Text style={styles.stepSubtitle}>Optional — leave blank if you don't track macros</Text>

      <View style={[styles.nutritionCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
        <View style={styles.nutritionRow}>
          <Ionicons name="flame-outline" size={22} color={colors.primary} />
          <Text style={[styles.nutritionLabel, { color: colors.text }]}>Daily calories</Text>
        </View>
        <TextInput
          style={[styles.nutritionInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
          keyboardType="numeric"
          value={preferences.calorie_target?.toString() || ''}
          onChangeText={text => setPreferences(prev => ({ ...prev, calorie_target: text ? parseInt(text) : undefined }))}
          placeholder="e.g. 2000"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <View style={[styles.nutritionCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
        <View style={styles.nutritionRow}>
          <Ionicons name="barbell-outline" size={22} color="#4ECDC4" />
          <Text style={[styles.nutritionLabel, { color: colors.text }]}>Daily protein (g)</Text>
        </View>
        <TextInput
          style={[styles.nutritionInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
          keyboardType="numeric"
          value={preferences.protein_target_grams?.toString() || ''}
          onChangeText={text => setPreferences(prev => ({ ...prev, protein_target_grams: text ? parseInt(text) : undefined }))}
          placeholder="e.g. 150"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <View style={[styles.tipContainer, { backgroundColor: colors.primary + '10' }]}>
        <Ionicons name="bulb-outline" size={18} color={colors.primary} />
        <Text style={[styles.tipText, { color: colors.textSecondary }]}>
          You can always change these later in your profile settings.
        </Text>
      </View>
    </View>
  );

  const steps = [renderWelcome, renderDietary, renderCuisines, renderSkillAndHousehold, renderNutritionGoals];
  const stepTitles = ['Welcome', 'Dietary', 'Cuisines', 'Kitchen', 'Nutrition'];

  const isLastStep = currentStep === TOTAL_STEPS - 1;
  const isFirstStep = currentStep === 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Progress bar */}
      <View style={[styles.progressContainer, { backgroundColor: colors.background }]}>
        <View style={styles.progressBarTrack}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                {
                  backgroundColor: i <= currentStep ? colors.primary : colors.border,
                  flex: 1,
                  marginHorizontal: 2,
                  borderRadius: 4,
                  height: 4,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.progressText, { color: colors.textMuted }]}>
          {currentStep + 1} of {TOTAL_STEPS}
        </Text>
      </View>

      {/* Step content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
          {steps[currentStep]()}
        </Animated.View>
      </ScrollView>

      {/* Bottom navigation */}
      <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {isFirstStep ? (
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip setup</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={goBack} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>
        )}

        {isLastStep ? (
          <TouchableOpacity
            style={[styles.nextButton, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={styles.nextText}>Get Started</Text>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextButton, { backgroundColor: colors.primary }]}
            onPress={goNext}
            activeOpacity={0.8}
          >
            <Text style={styles.nextText}>{isFirstStep ? "Let's Go" : 'Next'}</Text>
            <Ionicons name="chevron-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    // Progress
    progressContainer: {
      paddingTop: Platform.OS === 'ios' ? 60 : 20,
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    progressBarTrack: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    progressDot: {},
    progressText: {
      fontSize: 13,
      textAlign: 'center',
    },

    // Scroll
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 20,
    },

    // Step container
    stepContainer: {
      paddingTop: 12,
    },

    // Welcome step
    welcomeIconCircle: {
      width: 112,
      height: 112,
      borderRadius: 56,
      justifyContent: 'center',
      alignItems: 'center',
      alignSelf: 'center',
      marginBottom: 24,
      marginTop: 20,
    },
    welcomeTitle: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 12,
    },
    welcomeSubtitle: {
      fontSize: 17,
      lineHeight: 26,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 10,
      marginBottom: 16,
    },
    welcomeHint: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
    },

    // Step headers
    stepTitle: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    stepSubtitle: {
      fontSize: 15,
      color: colors.textMuted,
      marginBottom: 20,
      lineHeight: 22,
    },
    fieldLabel: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },

    // Dietary option grid
    optionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      gap: 10,
      minWidth: '45%' as any,
      flexGrow: 1,
    },
    optionLabel: {
      fontSize: 15,
      fontWeight: '600',
      flex: 1,
    },
    checkBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Cuisine grid
    cuisineGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    cuisineCard: {
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1.5,
      width: (SCREEN_WIDTH - 60) / 3,
    },
    cuisineEmoji: {
      fontSize: 28,
      marginBottom: 6,
    },
    cuisineLabel: {
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
    },

    // Skill level
    skillContainer: {
      gap: 10,
    },
    skillCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1.5,
      gap: 14,
    },
    skillLabel: {
      fontSize: 16,
      fontWeight: '700',
    },
    skillDesc: {
      fontSize: 13,
      flex: 1,
      textAlign: 'right',
    },

    // Household
    householdRow: {
      flexDirection: 'row',
      gap: 10,
    },
    householdChip: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: 'center',
    },
    householdText: {
      fontSize: 18,
      fontWeight: '700',
    },

    // Nutrition goals
    nutritionCard: {
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: 14,
    },
    nutritionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    nutritionLabel: {
      fontSize: 16,
      fontWeight: '600',
    },
    nutritionInput: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
    },
    tipContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: 12,
      gap: 10,
      marginTop: 8,
    },
    tipText: {
      fontSize: 14,
      flex: 1,
      lineHeight: 20,
    },

    // Bottom bar
    bottomBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      paddingBottom: Platform.OS === 'ios' ? 34 : 16,
      borderTopWidth: 1,
    },
    skipButton: {
      paddingVertical: 10,
      paddingHorizontal: 4,
    },
    skipText: {
      fontSize: 15,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      gap: 2,
    },
    backText: {
      fontSize: 15,
      fontWeight: '500',
    },
    nextButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 14,
      gap: 8,
    },
    nextText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
  });
