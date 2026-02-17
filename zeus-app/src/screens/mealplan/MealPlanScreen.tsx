import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { mealPlanService } from '../../services/mealPlanService';
import {
  MealPlan,
  Recipe,
  DayOfWeek,
  MealType,
  MacroSummaryResponse,
  MealSlot,
  getRecipeIdFromSlot,
  isRepeatMeal,
  getOriginalDay
} from '../../types/mealplan';
import { useThemeStore } from '../../store/themeStore';

interface MealPlanScreenProps {
  navigation: any;
}

export const MealPlanScreen: React.FC<MealPlanScreenProps> = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [recipes, setRecipes] = useState<{ [key: string]: Recipe }>({});
  const [recipeLoadError, setRecipeLoadError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('monday');
  const [regeneratingMeal, setRegeneratingMeal] = useState<string | null>(null);
  const [macroSummary, setMacroSummary] = useState<MacroSummaryResponse | null>(null);
  const [showMacroSummary, setShowMacroSummary] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, 1 = next week, -1 = last week

  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  // Refs to prevent race conditions
  const isMountedRef = useRef(true);
  const regeneratingMealsRef = useRef(new Set<string>());
  const dayScrollRef = useRef<ScrollView>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animated values for loading overlay (must be at top level with other hooks)
  const floatAnim1 = useRef(new Animated.Value(0)).current;
  const floatAnim2 = useRef(new Animated.Value(0)).current;
  const floatAnim3 = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const [loadingStep, setLoadingStep] = useState(0);

  useEffect(() => {
    isMountedRef.current = true;
    loadMealPlan();

    return () => {
      isMountedRef.current = false;
      // Clean up scroll timeout on unmount
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [weekOffset]);

  // Reload when returning from edit screen
  useFocusEffect(
    useCallback(() => {
      if (mealPlan) {
        loadMealPlan();
      }
    }, [mealPlan?.id, weekOffset])
  );

  // Animation effect for loading overlay (must be before any early returns)
  useEffect(() => {
    if (generating) {
      setLoadingStep(0);

      const createFloatAnimation = (anim: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1,
              duration: 2000,
              delay,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0,
              duration: 2000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        );
      };

      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      const rotateAnimation = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 8000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );

      const float1 = createFloatAnimation(floatAnim1, 0);
      const float2 = createFloatAnimation(floatAnim2, 500);
      const float3 = createFloatAnimation(floatAnim3, 1000);

      float1.start();
      float2.start();
      float3.start();
      pulseAnimation.start();
      rotateAnimation.start();

      const stepInterval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % 6);
      }, 4000);

      return () => {
        float1.stop();
        float2.stop();
        float3.stop();
        pulseAnimation.stop();
        rotateAnimation.stop();
        clearInterval(stepInterval);
        floatAnim1.setValue(0);
        floatAnim2.setValue(0);
        floatAnim3.setValue(0);
        pulseAnim.setValue(1);
        rotateAnim.setValue(0);
      };
    }
  }, [generating]);

  const loadMealPlan = async () => {
    try {
      if (isMountedRef.current) {
        setLoading(true);
      }
      console.log(`📱 Loading meal plan for week offset ${weekOffset}...`);
      const plan = weekOffset === 0
        ? await mealPlanService.getCurrentWeekMealPlan()
        : await mealPlanService.getMealPlanByWeekOffset(weekOffset);

      if (plan) {
        console.log('✅ Meal plan loaded:', plan.plan_name);
        console.log('📊 Meal plan ID:', plan.id);
        console.log('📅 Has meals data:', Object.keys(plan.meals).length > 0);
        if (isMountedRef.current) {
          setMealPlan(plan);
        }
        await loadRecipes(plan);

        // Set selected day to current day of week (or first day with meals if current day has none)
        const currentDay = getCurrentDayOfWeek();
        const daysOrder: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const currentDayIndex = daysOrder.indexOf(currentDay);

        console.log('📅 Current day:', currentDay);
        if (isMountedRef.current) {
          // Check if current day has meals, otherwise use first day with meals
          if (plan.meals[currentDay] && Object.keys(plan.meals[currentDay] || {}).length > 0) {
            setSelectedDay(currentDay);
            scrollToDay(currentDayIndex);
          } else {
            const daysWithMeals = Object.keys(plan.meals) as DayOfWeek[];
            if (daysWithMeals.length > 0) {
              const firstDayWithMeals = daysWithMeals[0];
              setSelectedDay(firstDayWithMeals);
              scrollToDay(daysOrder.indexOf(firstDayWithMeals));
            }
          }
        }
      } else {
        console.log('ℹ️ No meal plan found for this week');
        // Clear the meal plan state when no plan exists for this week
        if (isMountedRef.current) {
          setMealPlan(null);
          setRecipes({});
          setMacroSummary(null);
        }
      }
    } catch (error) {
      console.error('❌ Failed to load meal plan:', error);
      // Also clear state on error
      if (isMountedRef.current) {
        setMealPlan(null);
        setRecipes({});
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Poll for meal plan with exponential backoff (fixes race condition)
  const pollForMealPlan = async (maxAttempts = 5, initialDelay = 300): Promise<boolean> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const delay = initialDelay * Math.pow(1.5, attempt); // Exponential backoff: 300ms, 450ms, 675ms, 1012ms, 1518ms
      console.log(`🔄 Polling attempt ${attempt + 1}/${maxAttempts} (waiting ${delay}ms)...`);

      await new Promise(resolve => setTimeout(resolve, delay));

      if (!isMountedRef.current) {
        console.log('⚠️ Component unmounted, stopping poll');
        return false;
      }

      try {
        const plan = await mealPlanService.getCurrentWeekMealPlan();
        if (plan && Object.keys(plan.meals).length > 0) {
          console.log('✅ Meal plan found with meals!');
          return true;
        }
        console.log(`⏳ Meal plan not ready yet (attempt ${attempt + 1}/${maxAttempts})`);
      } catch (error) {
        console.error(`❌ Error during poll attempt ${attempt + 1}:`, error);
      }
    }

    console.log('⚠️ Max polling attempts reached');
    return false;
  };

  /**
   * Safely extract recipe IDs from meal plan with type validation
   * Handles both old format (string) and new format (object with recipe_id)
   */
  const extractRecipeIds = (plan: MealPlan): string[] => {
    const recipeIds: string[] = [];

    if (!plan.meals || typeof plan.meals !== 'object') {
      console.warn('⚠️ Invalid meals structure in meal plan');
      return recipeIds;
    }

    Object.entries(plan.meals).forEach(([day, dayMeals]) => {
      // Validate dayMeals is an object
      if (!dayMeals || typeof dayMeals !== 'object' || Array.isArray(dayMeals)) {
        console.warn(`⚠️ Invalid meal data for ${day}:`, typeof dayMeals);
        return;
      }

      Object.entries(dayMeals).forEach(([mealType, value]) => {
        // Use helper function to extract recipe ID from either format
        const recipeId = getRecipeIdFromSlot(value as MealSlot);
        if (recipeId && recipeId.trim().length > 0) {
          const trimmedId = recipeId.trim();
          if (!recipeIds.includes(trimmedId)) {
            recipeIds.push(trimmedId);
          }
        }
      });
    });

    return recipeIds;
  };

  const loadRecipes = async (plan: MealPlan) => {
    console.log('🔍 Loading recipes for meal plan:', plan.id);
    console.log('📅 Meal plan structure:', JSON.stringify(plan.meals, null, 2));

    const recipeMap: { [key: string]: Recipe } = {};

    // Clear any previous error
    if (isMountedRef.current) {
      setRecipeLoadError(null);
    }

    // Safely extract recipe IDs with type validation
    const recipeIds = extractRecipeIds(plan);

    console.log('📝 Found recipe IDs:', recipeIds);
    console.log('🔢 Total recipes to load:', recipeIds.length);

    if (recipeIds.length === 0) {
      console.log('ℹ️ No recipe IDs to load');
      setRecipes(recipeMap);
      return;
    }

    // Load all recipes (uses Promise.allSettled with retry logic)
    try {
      const loadedRecipes = await mealPlanService.getRecipes(recipeIds);
      console.log('✅ Loaded recipes:', loadedRecipes.length);

      loadedRecipes.forEach(recipe => {
        if (recipe && recipe.id) {
          console.log(`  - ${recipe.title} (${recipe.id})`);
          recipeMap[recipe.id] = recipe;
        } else {
          console.warn('⚠️ Received invalid recipe object:', recipe);
        }
      });

      // Log any missing recipes
      const loadedIds = loadedRecipes.map(r => r?.id).filter(Boolean);
      const missingIds = recipeIds.filter(id => !loadedIds.includes(id));
      if (missingIds.length > 0) {
        console.warn(`⚠️ Failed to load ${missingIds.length} recipe(s):`, missingIds);
        if (isMountedRef.current) {
          setRecipeLoadError(`${missingIds.length} recipe(s) failed to load. Tap to retry.`);
        }
      }

      if (isMountedRef.current) {
        setRecipes(recipeMap);
        // Load macro summary after recipes
        loadMacroSummary(plan.id);
      }
    } catch (error) {
      console.error('❌ Failed to load recipes:', error);
      if (isMountedRef.current) {
        setRecipes(recipeMap); // Set partial results even on error
        setRecipeLoadError('Failed to load recipes. Tap to retry.');
        // Still try to load macro summary
        loadMacroSummary(plan.id);
      }
    }
  };

  const loadMacroSummary = async (mealPlanId: string) => {
    try {
      console.log('📊 Loading macro summary for meal plan:', mealPlanId);
      const summary = await mealPlanService.getMacroSummary(mealPlanId);
      if (isMountedRef.current) {
        setMacroSummary(summary);
        console.log('✅ Macro summary loaded:', summary.weekly_summary.recipe_count, 'recipes');
      }
    } catch (error) {
      console.error('❌ Failed to load macro summary:', error);
    }
  };

  const toggleDayExpanded = (day: string) => {
    setExpandedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(day)) {
        newSet.delete(day);
      } else {
        newSet.add(day);
      }
      return newSet;
    });
  };

  const DAY_LABELS: { [key: string]: string } = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday'
  };

  const getCurrentDayOfWeek = (): DayOfWeek => {
    const days: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
    return days[today] as DayOfWeek;
  };

  const scrollToDay = (dayIndex: number) => {
    // Each day card is approximately 86px wide (70 minWidth + 16 margin)
    const cardWidth = 86;
    // Center the card by offsetting by half screen width minus half card width
    // Approximate screen width calculation, scroll to position
    const scrollPosition = Math.max(0, (dayIndex * cardWidth) - 100);

    // Clear any existing scroll timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        dayScrollRef.current?.scrollTo({ x: scrollPosition, animated: true });
      }
    }, 100);
  };

  const handleGenerateMealPlan = async () => {
    const weekLabel = weekOffset === 0 ? 'this week' : weekOffset === 1 ? 'next week' : `week ${weekOffset > 0 ? '+' : ''}${weekOffset}`;
    Alert.alert(
      'Generate Meal Plan',
      `This will create a full week of meals for ${weekLabel} based on your pantry and preferences. This may take a minute.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            try {
              setGenerating(true);

              // Use the week offset endpoint for generation
              const generateResponse = await mealPlanService.generateMealPlanForWeek(weekOffset);
              console.log('🆕 Generation response:', generateResponse);
              console.log('🆕 New meal plan ID from generation:', generateResponse.meal_plan_id);

              // Clear old state before loading new meal plan
              if (isMountedRef.current) {
                setMealPlan(null);
                setRecipes({});
              }

              // Poll for meal plan with exponential backoff (replaces hardcoded 500ms delay)
              console.log('🔄 Polling for newly generated meal plan...');
              const success = await pollForMealPlan();

              if (success && isMountedRef.current) {
                // Load the newly generated meal plan
                console.log('🔄 Now fetching current meal plan from API...');
                await loadMealPlan();
                Alert.alert('Success', 'Your meal plan has been generated!');
              } else if (isMountedRef.current) {
                Alert.alert(
                  'Partial Success',
                  'Meal plan was generated but took longer than expected to load. Please refresh.'
                );
              }
            } catch (error) {
              console.error('Failed to generate meal plan:', error);
              if (isMountedRef.current) {
                Alert.alert('Error', 'Failed to generate meal plan. Please try again.');
              }
            } finally {
              if (isMountedRef.current) {
                setGenerating(false);
              }
            }
          }
        }
      ]
    );
  };

  const handleRegenerateMeal = async (day: DayOfWeek, mealType: MealType) => {
    if (!mealPlan) return;

    const mealKey = `${day}-${mealType}`;

    // Prevent concurrent regenerations for the same meal (fixes race condition)
    if (regeneratingMealsRef.current.has(mealKey)) {
      console.log(`⚠️ Already regenerating ${mealKey}, ignoring duplicate request`);
      return;
    }

    try {
      // Lock this meal
      regeneratingMealsRef.current.add(mealKey);
      if (isMountedRef.current) {
        setRegeneratingMeal(mealKey);
      }

      const newRecipe = await mealPlanService.regenerateMeal(mealPlan.id, day, mealType);

      if (!isMountedRef.current) {
        console.log('⚠️ Component unmounted during regeneration, skipping state update');
        return;
      }

      // Update local state
      setRecipes(prev => ({ ...prev, [newRecipe.id]: newRecipe }));
      setMealPlan(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          meals: {
            ...prev.meals,
            [day]: {
              ...prev.meals[day],
              [mealType]: newRecipe.id
            }
          }
        };
      });

      // Reload macro summary to reflect the new meal
      loadMacroSummary(mealPlan.id);

      Alert.alert('Success', `${mealType} has been regenerated!`);
    } catch (error) {
      console.error('Failed to regenerate meal:', error);
      if (isMountedRef.current) {
        Alert.alert('Error', 'Failed to regenerate meal. Please try again.');
      }
    } finally {
      // Unlock this meal
      regeneratingMealsRef.current.delete(mealKey);
      if (isMountedRef.current) {
        setRegeneratingMeal(null);
      }
    }
  };

  const handleViewRecipe = (recipeId: string) => {
    const recipe = recipes[recipeId];
    if (recipe) {
      navigation.navigate('RecipeDetail', { recipe });
    }
  };

  const handleClearMealPlan = async () => {
    if (!mealPlan) return;

    Alert.alert(
      'Clear Meal Plan',
      `Are you sure you want to delete the meal plan for ${getWeekLabel().toLowerCase()}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await mealPlanService.deleteMealPlan(mealPlan.id);
              if (isMountedRef.current) {
                setMealPlan(null);
                setRecipes({});
                setMacroSummary(null);
                Alert.alert('Success', 'Meal plan has been deleted.');
              }
            } catch (error) {
              console.error('Failed to delete meal plan:', error);
              Alert.alert('Error', 'Failed to delete meal plan. Please try again.');
            }
          }
        }
      ]
    );
  };

  const getDaysOfWeek = (): Array<{ day: DayOfWeek; label: string; date: string; fullDate: Date }> => {
    const allDays: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    // Use selected_days from meal plan if available, otherwise show all 7 days
    const days: DayOfWeek[] = mealPlan?.selected_days || allDays;

    const today = new Date();
    const monday = new Date(today);
    // Get Monday of current week (weekday 0 = Sunday, 1 = Monday, etc)
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust for Sunday
    monday.setDate(today.getDate() + diff);
    // Apply week offset
    monday.setDate(monday.getDate() + (weekOffset * 7));

    return days.map((day) => {
      // Calculate the date for this specific day
      const dayIndex = allDays.indexOf(day);
      const date = new Date(monday);
      date.setDate(monday.getDate() + dayIndex);
      return {
        day,
        label: day.slice(0, 3).toUpperCase(),
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: date
      };
    });
  };

  const getWeekLabel = (): string => {
    if (weekOffset === 0) return 'This Week';
    if (weekOffset === 1) return 'Next Week';
    if (weekOffset === -1) return 'Last Week';
    return `${weekOffset > 0 ? '+' : ''}${weekOffset} Weeks`;
  };

  const getWeekDateRange = (): string => {
    const days = getDaysOfWeek();
    if (days.length === 0) return '';
    const start = days[0].fullDate;
    const end = days[days.length - 1].fullDate;
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const renderMealCard = (mealType: MealType) => {
    const dayMeals = mealPlan?.meals[selectedDay];
    const mealSlot = dayMeals?.[mealType] as MealSlot | undefined;
    const recipeId = getRecipeIdFromSlot(mealSlot);
    const recipe = recipeId ? recipes[recipeId] : null;
    const isRegenerating = regeneratingMeal === `${selectedDay}-${mealType}`;

    // Check if this is a repeat/leftover meal
    const isRepeat = isRepeatMeal(mealSlot);
    const originalDay = getOriginalDay(mealSlot);

    return (
      <View key={mealType} style={styles.mealCard}>
        <View style={styles.mealHeader}>
          <View style={styles.mealTypeContainer}>
            <Text style={styles.mealType}>{mealType.charAt(0).toUpperCase() + mealType.slice(1)}</Text>
            {isRepeat && (
              <View style={[styles.repeatBadge, originalDay ? styles.leftoverBadge : null]}>
                <Text style={styles.repeatBadgeText}>
                  {originalDay ? `Leftover` : 'Repeat'}
                </Text>
              </View>
            )}
          </View>
          {recipe && (
            <TouchableOpacity
              onPress={() => handleRegenerateMeal(selectedDay, mealType)}
              disabled={isRegenerating}
              style={styles.regenerateButton}
            >
              {isRegenerating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.regenerateText}>🔄</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {recipe ? (
          <TouchableOpacity
            style={styles.plannedMeal}
            onPress={() => handleViewRecipe(recipe.id)}
          >
            <View style={styles.mealImagePlaceholder}>
              <Text style={styles.mealEmoji}>🍽️</Text>
            </View>
            <View style={styles.mealInfo}>
              <Text style={styles.mealTitle}>{recipe.title}</Text>
              {originalDay && (
                <Text style={styles.leftoverHint}>
                  From {originalDay.charAt(0).toUpperCase() + originalDay.slice(1)}'s dinner
                </Text>
              )}
              {recipe.calories && (
                <View style={styles.macroPreview}>
                  <Text style={styles.macroText}>🔥 {recipe.calories} cal</Text>
                  {recipe.protein_grams && (
                    <Text style={styles.macroText}>💪 {recipe.protein_grams}g P</Text>
                  )}
                </View>
              )}
              <Text style={styles.mealSubtext}>View Recipe →</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.emptyMeal}
            onPress={() => handleRegenerateMeal(selectedDay, mealType)}
            disabled={isRegenerating}
          >
            {isRegenerating ? (
              <>
                <ActivityIndicator size="small" color={colors.primary} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyMealText}>Generating...</Text>
              </>
            ) : (
              <>
                <Text style={styles.generateMealIcon}>+</Text>
                <Text style={styles.emptyMealText}>Generate Meal</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading meal plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!mealPlan) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Meal Plan</Text>
        </View>
        {/* Week Navigation for empty state too */}
        <View style={styles.weekNavContainer}>
          <TouchableOpacity
            style={styles.weekNavButton}
            onPress={() => setWeekOffset(w => w - 1)}
          >
            <Text style={styles.weekNavArrow}>‹</Text>
          </TouchableOpacity>
          <View style={styles.weekNavInfo}>
            <Text style={styles.weekNavLabel}>{getWeekLabel()}</Text>
            <Text style={styles.weekNavDateRange}>{getWeekDateRange()}</Text>
          </View>
          <TouchableOpacity
            style={styles.weekNavButton}
            onPress={() => setWeekOffset(w => w + 1)}
          >
            <Text style={styles.weekNavArrow}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyTitle}>No Meal Plan</Text>
          <Text style={styles.emptyDescription}>
            {weekOffset === 0
              ? 'Create a personalized meal plan - let AI generate it or build it yourself!'
              : `No meal plan for ${getWeekLabel().toLowerCase()}. Create one now!`}
          </Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={() => navigation.navigate('DaySelection')}
          >
            <Text style={styles.generateButtonText}>Create a Meal Plan</Text>
            <Text style={styles.generateButtonArrow}>→</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const daysOfWeek = getDaysOfWeek();

  const loadingSteps = [
    'Analyzing your preferences...',
    'Selecting recipes...',
    'Calculating nutrition...',
    'Building your meal plan...',
    'Adding ingredients & instructions...',
    'Almost there...',
  ];

  // Loading overlay component with animations
  const renderLoadingOverlay = () => {
    const float1Y = floatAnim1.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -20],
    });
    const float2Y = floatAnim2.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -25],
    });
    const float3Y = floatAnim3.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -15],
    });
    const rotate = rotateAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });

    return (
      <Modal
        visible={generating}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.loadingOverlay}>
          {/* Floating food emojis */}
          <Animated.Text style={[
            styles.floatingEmoji,
            styles.floatingEmoji1,
            { transform: [{ translateY: float1Y }] }
          ]}>
            🥗
          </Animated.Text>
          <Animated.Text style={[
            styles.floatingEmoji,
            styles.floatingEmoji2,
            { transform: [{ translateY: float2Y }] }
          ]}>
            🍳
          </Animated.Text>
          <Animated.Text style={[
            styles.floatingEmoji,
            styles.floatingEmoji3,
            { transform: [{ translateY: float3Y }] }
          ]}>
            🥘
          </Animated.Text>
          <Animated.Text style={[
            styles.floatingEmoji,
            styles.floatingEmoji4,
            { transform: [{ translateY: float1Y }] }
          ]}>
            🍝
          </Animated.Text>
          <Animated.Text style={[
            styles.floatingEmoji,
            styles.floatingEmoji5,
            { transform: [{ translateY: float2Y }] }
          ]}>
            🥑
          </Animated.Text>

          <Animated.View style={[
            styles.loadingCard,
            { transform: [{ scale: pulseAnim }] }
          ]}>
            {/* Rotating ring behind spinner */}
            <View style={styles.spinnerContainer}>
              <Animated.View style={[
                styles.rotatingRing,
                { transform: [{ rotate }] }
              ]}>
                <View style={[styles.ringDot, { backgroundColor: colors.primary }]} />
                <View style={[styles.ringDot, styles.ringDot2, { backgroundColor: colors.secondary }]} />
                <View style={[styles.ringDot, styles.ringDot3, { backgroundColor: colors.primary, opacity: 0.5 }]} />
              </Animated.View>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>

            <Text style={styles.loadingTitle}>Generating Your Meal Plan</Text>

            {/* Animated step indicator */}
            <View style={styles.loadingStepContainer}>
              <Text style={styles.loadingStep}>{loadingSteps[loadingStep]}</Text>
            </View>

            {/* Progress dots */}
            <View style={styles.progressDots}>
              {loadingSteps.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.progressDot,
                    index === loadingStep && styles.progressDotActive,
                    { backgroundColor: index === loadingStep ? colors.primary : colors.border }
                  ]}
                />
              ))}
            </View>

            <Text style={styles.loadingSubtext}>
              Creating personalized recipes with full ingredients, instructions, and nutrition info
            </Text>
          </Animated.View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderLoadingOverlay()}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Meal Plan</Text>
        <View style={styles.headerButtons}>
          {mealPlan && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => navigation.navigate('MealPlanEdit', { mealPlan, recipes })}
              disabled={generating}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearMealPlan}
            disabled={generating || !mealPlan}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.regenerateAllButton}
            onPress={handleGenerateMealPlan}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator size="small" color={colors.buttonText} />
            ) : (
              <Text style={styles.regenerateAllButtonText}>Generate</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Week Navigation */}
      <View style={styles.weekNavContainer}>
        <TouchableOpacity
          style={styles.weekNavButton}
          onPress={() => setWeekOffset(w => w - 1)}
        >
          <Text style={styles.weekNavArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.weekNavInfo}>
          <Text style={styles.weekNavLabel}>{getWeekLabel()}</Text>
          <Text style={styles.weekNavDateRange}>{getWeekDateRange()}</Text>
        </View>
        <TouchableOpacity
          style={styles.weekNavButton}
          onPress={() => setWeekOffset(w => w + 1)}
        >
          <Text style={styles.weekNavArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView>
        {/* Week Day Selector */}
        <View style={styles.calendarContainer}>
          <ScrollView
            ref={dayScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayScrollContent}
          >
            {daysOfWeek.map(({ day, label, date, fullDate }) => {
              const today = new Date();
              const isToday = weekOffset === 0 && day === getCurrentDayOfWeek();
              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.dayCard,
                    selectedDay === day && styles.dayCardSelected,
                    isToday && selectedDay !== day && styles.dayCardToday,
                  ]}
                  onPress={() => setSelectedDay(day)}
                >
                  {isToday && (
                    <Text style={[
                      styles.todayLabel,
                      selectedDay === day && styles.todayLabelSelected,
                    ]}>TODAY</Text>
                  )}
                  <Text
                    style={[
                      styles.dayName,
                      selectedDay === day && styles.dayNameSelected,
                    ]}
                  >
                    {label}
                  </Text>
                  <Text
                    style={[
                      styles.dayDate,
                      selectedDay === day && styles.dayDateSelected,
                    ]}
                  >
                    {date}
                  </Text>
                  {mealPlan.meals[day] && Object.keys(mealPlan.meals[day] || {}).length > 0 && (
                    <View style={styles.planIndicator} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Recipe Load Error Banner */}
        {recipeLoadError && (
          <TouchableOpacity
            style={styles.errorBanner}
            onPress={() => {
              setRecipeLoadError(null);
              if (mealPlan) {
                loadRecipes(mealPlan);
              }
            }}
          >
            <Text style={styles.errorBannerText}>{recipeLoadError}</Text>
          </TouchableOpacity>
        )}

        {/* Meals for Selected Day */}
        <View style={styles.mealsContainer}>
          {renderMealCard('breakfast')}
          {renderMealCard('lunch')}
          {renderMealCard('dinner')}
        </View>

        {/* Weekly Macro Summary Toggle - Prominent Button */}
        <TouchableOpacity
          style={styles.macroToggleButton}
          onPress={() => setShowMacroSummary(!showMacroSummary)}
        >
          <View style={styles.macroToggleContent}>
            <Text style={styles.macroToggleEmoji}>📊</Text>
            <View style={styles.macroToggleTextContainer}>
              <Text style={styles.macroToggleTitle}>
                {macroSummary?.num_days && macroSummary.num_days !== 7
                  ? `${macroSummary.num_days}-Day Nutrition Summary`
                  : 'Weekly Nutrition Summary'}
              </Text>
              {macroSummary && !showMacroSummary && (
                <Text style={styles.macroTogglePreview}>
                  Avg: {Math.round(macroSummary.weekly_summary.daily_averages.calories)} cal/day
                </Text>
              )}
            </View>
          </View>
          <Text style={styles.macroToggleArrow}>{showMacroSummary ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {/* Weekly Macro Summary */}
        {showMacroSummary && macroSummary && (
          <View style={styles.macroSummaryContainer}>
            {/* Daily Averages - Now First */}
            <View style={styles.macroCardHighlight}>
              <Text style={styles.macroCardTitleLarge}>Daily Averages</Text>
              <View style={styles.macroGridCompact}>
                <View style={styles.macroItemLarge}>
                  <Text style={styles.macroValueLarge}>{Math.round(macroSummary.weekly_summary.daily_averages.calories)}</Text>
                  <Text style={styles.macroLabelSmall}>cal</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItemLarge}>
                  <Text style={styles.macroValueLarge}>{macroSummary.weekly_summary.daily_averages.protein_grams}g</Text>
                  <Text style={styles.macroLabelSmall}>protein</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItemLarge}>
                  <Text style={styles.macroValueLarge}>{macroSummary.weekly_summary.daily_averages.carbs_grams}g</Text>
                  <Text style={styles.macroLabelSmall}>carbs</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroItemLarge}>
                  <Text style={styles.macroValueLarge}>{macroSummary.weekly_summary.daily_averages.fat_grams}g</Text>
                  <Text style={styles.macroLabelSmall}>fat</Text>
                </View>
              </View>
            </View>

            {/* Target Comparison (if user has targets set) */}
            {macroSummary.target_comparison && (
              <View style={styles.macroCard}>
                <Text style={styles.macroCardTitle}>vs Your Targets</Text>
                {macroSummary.target_comparison.calorie_target && (
                  <View style={styles.targetRow}>
                    <Text style={styles.targetLabel}>Calories</Text>
                    <Text style={[
                      styles.targetValue,
                      macroSummary.target_comparison.calorie_on_target ? styles.targetOnTrack : styles.targetOff
                    ]}>
                      {macroSummary.target_comparison.calorie_daily_avg} / {macroSummary.target_comparison.calorie_target}
                      {macroSummary.target_comparison.calorie_on_target ? ' ✓' : ''}
                    </Text>
                  </View>
                )}
                {macroSummary.target_comparison.protein_target_grams && (
                  <View style={styles.targetRow}>
                    <Text style={styles.targetLabel}>Protein</Text>
                    <Text style={[
                      styles.targetValue,
                      macroSummary.target_comparison.protein_on_target ? styles.targetOnTrack : styles.targetOff
                    ]}>
                      {macroSummary.target_comparison.protein_daily_avg}g / {macroSummary.target_comparison.protein_target_grams}g
                      {macroSummary.target_comparison.protein_on_target ? ' ✓' : ''}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Period Overview */}
            <View style={styles.macroCard}>
              <Text style={styles.macroCardTitle}>
                {macroSummary.num_days && macroSummary.num_days !== 7
                  ? `${macroSummary.num_days}-Day Totals`
                  : 'Weekly Totals'}
              </Text>
              <View style={styles.macroGrid}>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{macroSummary.weekly_summary.weekly_totals.calories.toLocaleString()}</Text>
                  <Text style={styles.macroLabel}>Calories</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{macroSummary.weekly_summary.weekly_totals.protein_grams}g</Text>
                  <Text style={styles.macroLabel}>Protein</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{macroSummary.weekly_summary.weekly_totals.carbs_grams}g</Text>
                  <Text style={styles.macroLabel}>Carbs</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{macroSummary.weekly_summary.weekly_totals.fat_grams}g</Text>
                  <Text style={styles.macroLabel}>Fat</Text>
                </View>
              </View>
            </View>

            {/* Macro Distribution */}
            <View style={styles.macroCard}>
              <Text style={styles.macroCardTitle}>Macro Distribution</Text>
              <View style={styles.macroDistribution}>
                <View style={styles.macroBar}>
                  <View style={[styles.macroBarFill, styles.proteinBar, { flex: macroSummary.weekly_summary.macro_percentages.protein_pct }]} />
                  <View style={[styles.macroBarFill, styles.carbsBar, { flex: macroSummary.weekly_summary.macro_percentages.carbs_pct }]} />
                  <View style={[styles.macroBarFill, styles.fatBar, { flex: macroSummary.weekly_summary.macro_percentages.fat_pct }]} />
                </View>
                <View style={styles.macroLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, styles.proteinBar]} />
                    <Text style={styles.legendText}>Protein {macroSummary.weekly_summary.macro_percentages.protein_pct}%</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, styles.carbsBar]} />
                    <Text style={styles.legendText}>Carbs {macroSummary.weekly_summary.macro_percentages.carbs_pct}%</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, styles.fatBar]} />
                    <Text style={styles.legendText}>Fat {macroSummary.weekly_summary.macro_percentages.fat_pct}%</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Daily Breakdown Section */}
            <View style={styles.macroCard}>
              <Text style={styles.macroCardTitle}>Daily Breakdown</Text>
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                const dayData = macroSummary.daily_breakdown[day];
                const isExpanded = expandedDays.has(day);

                if (!dayData) return null;

                return (
                  <View key={day}>
                    <TouchableOpacity
                      style={styles.dayBreakdownHeader}
                      onPress={() => toggleDayExpanded(day)}
                    >
                      <Text style={styles.dayBreakdownTitle}>{DAY_LABELS[day]}</Text>
                      <View style={styles.dayBreakdownSummary}>
                        <Text style={styles.dayBreakdownCalories}>{dayData.totals.calories} cal</Text>
                        <Text style={styles.dayBreakdownArrow}>{isExpanded ? '▲' : '▼'}</Text>
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.dayBreakdownContent}>
                        <View style={styles.dayMacroRow}>
                          <View style={styles.dayMacroItem}>
                            <Text style={styles.dayMacroValue}>{dayData.totals.protein_grams}g</Text>
                            <Text style={styles.dayMacroLabel}>Protein</Text>
                          </View>
                          <View style={styles.dayMacroItem}>
                            <Text style={styles.dayMacroValue}>{dayData.totals.carbs_grams}g</Text>
                            <Text style={styles.dayMacroLabel}>Carbs</Text>
                          </View>
                          <View style={styles.dayMacroItem}>
                            <Text style={styles.dayMacroValue}>{dayData.totals.fat_grams}g</Text>
                            <Text style={styles.dayMacroLabel}>Fat</Text>
                          </View>
                          <View style={styles.dayMacroItem}>
                            <Text style={styles.dayMacroValue}>{dayData.meal_count}</Text>
                            <Text style={styles.dayMacroLabel}>Meals</Text>
                          </View>
                        </View>
                        <View style={styles.dayMacroBarSmall}>
                          <View style={[styles.macroBarFill, styles.proteinBar, { flex: dayData.macro_percentages.protein_pct }]} />
                          <View style={[styles.macroBarFill, styles.carbsBar, { flex: dayData.macro_percentages.carbs_pct }]} />
                          <View style={[styles.macroBarFill, styles.fatBar, { flex: dayData.macro_percentages.fat_pct }]} />
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Validation Warnings */}
            {macroSummary.validation_warnings.length > 0 && (
              <View style={styles.warningsCard}>
                <Text style={styles.warningsTitle}>Nutrition Notes</Text>
                {macroSummary.validation_warnings.slice(0, 3).map((warning, index) => (
                  <Text key={index} style={styles.warningText}>{warning}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textMuted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  emptyDescription: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 36,
    lineHeight: 24,
    fontWeight: '400',
  },
  generateButton: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 16,
    minWidth: 220,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  generateButtonText: {
    color: colors.buttonText,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  generateButtonArrow: {
    color: colors.buttonText,
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.card,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editButton: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  editButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  clearButton: {
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  clearButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  regenerateAllButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  regenerateAllButtonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '700',
  },
  // Week Navigation Styles
  weekNavContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  weekNavButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekNavArrow: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '600',
  },
  weekNavInfo: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  weekNavLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  weekNavDateRange: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 3,
    fontWeight: '500',
  },
  calendarContainer: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    marginBottom: 8,
  },
  dayScrollContent: {
    paddingHorizontal: 16,
  },
  dayCard: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    minWidth: 64,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  dayCardSelected: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  dayCardToday: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  todayLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  todayLabelSelected: {
    color: colors.buttonText,
  },
  dayName: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
    fontWeight: '600',
  },
  dayNameSelected: {
    color: colors.buttonText,
  },
  dayDate: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
  },
  dayDateSelected: {
    color: colors.buttonText,
  },
  planIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
    marginTop: 4,
  },
  mealsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  errorBanner: {
    backgroundColor: '#FFF3E0',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  errorBannerText: {
    color: '#E65100',
    fontSize: 14,
    fontWeight: '500',
  },
  mealCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  mealTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mealType: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  repeatBadge: {
    backgroundColor: colors.success + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  leftoverBadge: {
    backgroundColor: '#FFF3E0',
  },
  repeatBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  leftoverHint: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  regenerateButton: {
    padding: 4,
  },
  regenerateText: {
    fontSize: 18,
  },
  plannedMeal: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mealImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  mealEmoji: {
    fontSize: 30,
  },
  mealInfo: {
    flex: 1,
  },
  mealTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  macroPreview: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 4,
  },
  macroText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  mealSubtext: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  emptyMeal: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary + '40',
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: colors.primary + '08',
    minHeight: 80,
  },
  emptyMealText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  generateMealIcon: {
    fontSize: 28,
    color: colors.primary,
    fontWeight: '300',
    marginBottom: 4,
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    maxWidth: 340,
    width: '90%',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  spinnerContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rotatingRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.primary + '20',
  },
  ringDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    top: -5,
    left: '50%',
    marginLeft: -5,
  },
  ringDot2: {
    top: '50%',
    left: -5,
    marginLeft: 0,
    marginTop: -5,
  },
  ringDot3: {
    top: '100%',
    left: '50%',
    marginTop: -5,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 20,
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingStepContainer: {
    height: 24,
    justifyContent: 'center',
    marginBottom: 12,
  },
  loadingStep: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressDots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressDotActive: {
    width: 24,
    borderRadius: 4,
  },
  loadingSubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  floatingEmoji: {
    position: 'absolute',
    fontSize: 36,
    opacity: 0.6,
  },
  floatingEmoji1: {
    top: '15%',
    left: '10%',
  },
  floatingEmoji2: {
    top: '20%',
    right: '12%',
  },
  floatingEmoji3: {
    bottom: '25%',
    left: '15%',
  },
  floatingEmoji4: {
    bottom: '20%',
    right: '10%',
  },
  floatingEmoji5: {
    top: '45%',
    left: '5%',
  },
  // Macro Summary Styles - Prominent Button
  macroToggleButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    padding: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  macroToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  macroToggleEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  macroToggleTextContainer: {
    flex: 1,
  },
  macroToggleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.buttonText,
  },
  macroTogglePreview: {
    fontSize: 13,
    color: colors.buttonText,
    opacity: 0.85,
    marginTop: 2,
  },
  macroToggleArrow: {
    fontSize: 14,
    color: colors.buttonText,
    marginLeft: 8,
  },
  macroSummaryContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  macroCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  macroCardHighlight: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  macroCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  macroCardTitleLarge: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.buttonText,
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  macroGridCompact: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  macroItemLarge: {
    alignItems: 'center',
    flex: 1,
  },
  macroValueLarge: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.buttonText,
  },
  macroLabelSmall: {
    fontSize: 11,
    color: colors.buttonText,
    opacity: 0.85,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  macroDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.buttonText,
    opacity: 0.3,
  },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  macroItem: {
    width: '48%',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  macroValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  macroLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  macroDistribution: {
    marginTop: 8,
  },
  macroBar: {
    flexDirection: 'row',
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  macroBarFill: {
    height: '100%',
  },
  proteinBar: {
    backgroundColor: colors.proteinColor,
  },
  carbsBar: {
    backgroundColor: colors.carbsColor,
  },
  fatBar: {
    backgroundColor: colors.fatColor,
  },
  macroLegend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  targetLabel: {
    fontSize: 14,
    color: colors.text,
  },
  targetValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  targetOnTrack: {
    color: colors.proteinColor,
  },
  targetOff: {
    color: colors.textMuted,
  },
  warningsCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.carbsColor,
  },
  warningsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  // Daily Breakdown Styles
  dayBreakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayBreakdownTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  dayBreakdownSummary: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayBreakdownCalories: {
    fontSize: 14,
    color: colors.textMuted,
    marginRight: 8,
  },
  dayBreakdownArrow: {
    fontSize: 12,
    color: colors.textMuted,
  },
  dayBreakdownContent: {
    paddingVertical: 12,
    paddingLeft: 8,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  dayMacroRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  dayMacroItem: {
    alignItems: 'center',
  },
  dayMacroValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  dayMacroLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  dayMacroBarSmall: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
});
