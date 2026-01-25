import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { mealPlanService } from '../../services/mealPlanService';
import { MealPlan, Recipe, DayOfWeek, MealType, MacroSummaryResponse } from '../../types/mealplan';
import { useThemeStore } from '../../store/themeStore';

interface MealPlanScreenProps {
  navigation: any;
}

export const MealPlanScreen: React.FC<MealPlanScreenProps> = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [recipes, setRecipes] = useState<{ [key: string]: Recipe }>({});
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('monday');
  const [regeneratingMeal, setRegeneratingMeal] = useState<string | null>(null);
  const [macroSummary, setMacroSummary] = useState<MacroSummaryResponse | null>(null);
  const [showMacroSummary, setShowMacroSummary] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  // Refs to prevent race conditions
  const isMountedRef = useRef(true);
  const regeneratingMealsRef = useRef(new Set<string>());
  const dayScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    isMountedRef.current = true;
    loadMealPlan();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadMealPlan = async () => {
    try {
      if (isMountedRef.current) {
        setLoading(true);
      }
      console.log('📱 Loading current meal plan...');
      const plan = await mealPlanService.getCurrentWeekMealPlan();

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
        console.log('ℹ️ No meal plan found');
      }
    } catch (error) {
      console.error('❌ Failed to load meal plan:', error);
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
   * Handles edge cases: null values, non-string values, empty strings
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
        // Validate value is a non-empty string (recipe ID)
        if (typeof value === 'string' && value.trim().length > 0) {
          const trimmedId = value.trim();
          if (!recipeIds.includes(trimmedId)) {
            recipeIds.push(trimmedId);
          }
        } else if (value !== null && value !== undefined) {
          console.warn(`⚠️ Invalid recipe ID for ${day}.${mealType}:`, typeof value, value);
        }
      });
    });

    return recipeIds;
  };

  const loadRecipes = async (plan: MealPlan) => {
    console.log('🔍 Loading recipes for meal plan:', plan.id);
    console.log('📅 Meal plan structure:', JSON.stringify(plan.meals, null, 2));

    const recipeMap: { [key: string]: Recipe } = {};

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

    setTimeout(() => {
      dayScrollRef.current?.scrollTo({ x: scrollPosition, animated: true });
    }, 100);
  };

  const handleGenerateMealPlan = async () => {
    Alert.alert(
      'Generate Meal Plan',
      'This will create a full week of meals based on your pantry and preferences. This may take a minute.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            try {
              setGenerating(true);
              const today = new Date();
              const monday = new Date(today);
              monday.setDate(today.getDate() - today.getDay() + 1);
              const startDate = monday.toISOString().split('T')[0];

              const generateResponse = await mealPlanService.generateMealPlan(startDate);
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

  const getDaysOfWeek = (): Array<{ day: DayOfWeek; label: string; date: string }> => {
    const days: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);

    return days.map((day, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return {
        day,
        label: day.slice(0, 3).toUpperCase(),
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      };
    });
  };

  const renderMealCard = (mealType: MealType) => {
    const dayMeals = mealPlan?.meals[selectedDay];
    const recipeId = dayMeals?.[mealType];
    const recipe = recipeId ? recipes[recipeId] : null;
    const isRegenerating = regeneratingMeal === `${selectedDay}-${mealType}`;

    return (
      <View key={mealType} style={styles.mealCard}>
        <View style={styles.mealHeader}>
          <Text style={styles.mealType}>{mealType.charAt(0).toUpperCase() + mealType.slice(1)}</Text>
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
          <View style={styles.emptyMeal}>
            <Text style={styles.emptyMealText}>No meal planned</Text>
          </View>
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
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Meal Plan Yet</Text>
          <Text style={styles.emptyDescription}>
            Generate your first AI-powered meal plan based on your pantry and preferences!
          </Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={handleGenerateMealPlan}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color={colors.buttonText} />
            ) : (
              <Text style={styles.generateButtonText}>Generate Meal Plan</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const daysOfWeek = getDaysOfWeek();

  // Loading overlay component
  const renderLoadingOverlay = () => (
    <Modal
      visible={generating}
      transparent={true}
      animationType="fade"
    >
      <View style={styles.loadingOverlay}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingTitle}>Generating Your Meal Plan</Text>
          <Text style={styles.loadingSubtext}>
            Creating 21 delicious recipes with ingredients, instructions, and nutrition info...
          </Text>
          <Text style={styles.loadingHint}>This may take up to a minute</Text>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderLoadingOverlay()}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Meal Plan</Text>
        <TouchableOpacity
          style={styles.regenerateAllButton}
          onPress={handleGenerateMealPlan}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator size="small" color={colors.buttonText} />
          ) : (
            <Text style={styles.regenerateAllButtonText}>New Week</Text>
          )}
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
            {daysOfWeek.map(({ day, label, date }) => {
              const isToday = day === getCurrentDayOfWeek();
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
              <Text style={styles.macroToggleTitle}>Weekly Nutrition Summary</Text>
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

            {/* Weekly Overview */}
            <View style={styles.macroCard}>
              <Text style={styles.macroCardTitle}>Weekly Totals</Text>
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
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  emptyDescription: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  generateButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  generateButtonText: {
    color: colors.buttonText,
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  regenerateAllButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  regenerateAllButtonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '600',
  },
  calendarContainer: {
    backgroundColor: colors.card,
    paddingVertical: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayScrollContent: {
    paddingHorizontal: 12,
  },
  dayCard: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.background,
    minWidth: 70,
  },
  dayCardSelected: {
    backgroundColor: colors.primary,
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
    marginBottom: 16,
  },
  mealCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mealType: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
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
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  mealEmoji: {
    fontSize: 28,
  },
  mealInfo: {
    flex: 1,
  },
  mealTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  macroPreview: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  macroText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  mealSubtext: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  emptyMeal: {
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  emptyMealText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  loadingHint: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    textAlign: 'center',
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
    backgroundColor: '#4ECDC4',
  },
  carbsBar: {
    backgroundColor: '#FFE66D',
  },
  fatBar: {
    backgroundColor: '#FF6B6B',
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
    color: '#4ECDC4',
  },
  targetOff: {
    color: colors.textMuted,
  },
  warningsCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FFE66D',
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
