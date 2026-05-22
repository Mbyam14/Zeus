import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mealPlanService } from '../../services/mealPlanService';
import {
  MealPlan,
  Recipe,
  DayOfWeek,
  MealType,
  MacroSummaryResponse,
  MealSlot,
  MealTypeConfig,
  DEFAULT_MEAL_TYPES,
  getRecipeIdFromSlot,
  isRepeatMeal,
  getOriginalDay,
} from '../../types/mealplan';
import { useThemeStore, ThemeColors } from '../../store/themeStore';
import { useDataStore } from '../../store/dataStore';
import { useOnboardingStore } from '../../store/onboardingStore';
import { MealPlanSkeleton } from '../../components/SkeletonLoader';
import { EmptyState } from '../../components/EmptyState';
import { TabHeader } from '../../components/TabHeader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAY_CELL_WIDTH = (SCREEN_WIDTH - 32) / 7; // 7 days, 16px padding each side

interface MealPlanScreenProps {
  navigation: any;
}

const ALL_DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_ABBR: Record<string, string> = {
  monday: 'M', tuesday: 'T', wednesday: 'W', thursday: 'T',
  friday: 'F', saturday: 'S', sunday: 'S',
};
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

export const MealPlanScreen: React.FC<MealPlanScreenProps> = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('monday');
  const [regeneratingMeal, setRegeneratingMeal] = useState<string | null>(null);
  const [macroSummary, setMacroSummary] = useState<MacroSummaryResponse | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showMealOptions, setShowMealOptions] = useState<string | null>(null); // mealType key
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [selectedCreateDays, setSelectedCreateDays] = useState<Set<DayOfWeek>>(new Set(ALL_DAYS));
  const [generating, setGenerating] = useState(false);

  const insets = useSafeAreaInsets();
  const { colors } = useThemeStore();
  const styles = createStyles(colors);
  const isMountedRef = useRef(true);
  const regeneratingMealsRef = useRef(new Set<string>());

  useEffect(() => {
    isMountedRef.current = true;
    loadMealPlan();
    return () => { isMountedRef.current = false; };
  }, [weekOffset]);

  useFocusEffect(
    useCallback(() => {
      const dataStore = useDataStore.getState();
      const mondayKey = getMondayDateString(weekOffset);
      if (!dataStore.isFresh('mealPlan') || dataStore.getCachedWeekDate() !== mondayKey) {
        loadMealPlan();
      }
      return () => setShowMenu(false);
    }, [mealPlan?.id, weekOffset])
  );

  // ------- Helpers -------

  const getMondayDateString = (offset: number): string => {
    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7);
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const d = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // ------- Data Loading -------

  const loadMealPlan = async () => {
    // Capture weekOffset at call time to guard against stale async results
    const targetOffset = weekOffset;

    // Show cached data immediately if fresh and matching week
    const cached = useDataStore.getState();
    const mondayKey = getMondayDateString(targetOffset);
    if (cached.mealPlan && cached.isFresh('mealPlan') && cached.getCachedWeekDate() === mondayKey) {
      setMealPlan(cached.mealPlan);
      setRecipes(cached.mealPlanRecipes);
      setMacroSummary(cached.macroSummary);
      setLoading(false);
      return;
    }

    try {
      if (isMountedRef.current) setLoading(true);
      const plan = targetOffset === 0
        ? await mealPlanService.getCurrentWeekMealPlan()
        : await mealPlanService.getMealPlanByWeekOffset(targetOffset);

      // Discard result if the user navigated to a different week while this fetch was in-flight
      if (weekOffset !== targetOffset) return;

      if (plan) {
        if (isMountedRef.current) setMealPlan(plan);

        // Load recipes and macros, capture the fresh values to avoid stale closure in cache write
        const [freshRecipes, freshMacros] = await Promise.all([
          fetchRecipesForPlan(plan),
          fetchMacroSummary(plan.id),
        ]);

        if (weekOffset !== targetOffset) return;

        if (isMountedRef.current) {
          setRecipes(freshRecipes);
          setMacroSummary(freshMacros);
        }

        useDataStore.getState().setMealPlan(plan, freshRecipes, freshMacros);
        useDataStore.getState().setCachedWeekDate(getMondayDateString(targetOffset));

        // Advance onboarding when meal plan exists
        const onboarding = useOnboardingStore.getState();
        if (onboarding.isFirstRun && onboarding.currentStep === 'meal_plan') {
          onboarding.advanceStep();
        }

        // Select today or first day with meals
        const currentDay = getCurrentDayOfWeek();
        if (isMountedRef.current) {
          if (plan.meals[currentDay] && Object.keys(plan.meals[currentDay] || {}).length > 0) {
            setSelectedDay(currentDay);
          } else {
            const daysWithMeals = Object.keys(plan.meals) as DayOfWeek[];
            if (daysWithMeals.length > 0) setSelectedDay(daysWithMeals[0]);
          }
        }
      } else {
        if (isMountedRef.current) {
          setMealPlan(null);
          setRecipes({});
          setMacroSummary(null);
        }
      }
    } catch (error) {
      if (isMountedRef.current) {
        setMealPlan(null);
        setRecipes({});
        setLoadError('Failed to load meal plan. Check your connection and try again.');
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const fetchRecipesForPlan = async (plan: MealPlan): Promise<Record<string, Recipe>> => {
    const recipeIds: string[] = [];
    Object.values(plan.meals).forEach((dayMeals) => {
      if (!dayMeals || typeof dayMeals !== 'object') return;
      Object.values(dayMeals).forEach((slot) => {
        const id = getRecipeIdFromSlot(slot as MealSlot);
        if (id && !recipeIds.includes(id)) recipeIds.push(id);
      });
    });
    if (recipeIds.length === 0) return {};
    try {
      const loaded = await mealPlanService.getRecipes(recipeIds);
      const map: Record<string, Recipe> = {};
      loaded.forEach((r) => { if (r?.id) map[r.id] = r; });
      return map;
    } catch {
      return {};
    }
  };

  const fetchMacroSummary = async (mealPlanId: string): Promise<MacroSummaryResponse | null> => {
    try {
      return await mealPlanService.getMacroSummary(mealPlanId);
    } catch {
      return null;
    }
  };

  const loadMacroSummary = (mealPlanId: string) =>
    fetchMacroSummary(mealPlanId).then((s) => { if (isMountedRef.current) setMacroSummary(s); });

  // ------- Helpers -------

  const getCurrentDayOfWeek = (): DayOfWeek => {
    const days: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date().getDay()];
  };

  const getMealTypes = (): MealTypeConfig[] => {
    return mealPlan?.meal_types || DEFAULT_MEAL_TYPES;
  };

  const getDaysInfo = () => {
    const days = mealPlan?.selected_days || ALL_DAYS;
    const today = new Date();
    const monday = new Date(today);
    const dow = today.getDay();
    monday.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow) + weekOffset * 7);

    return ALL_DAYS.map((day) => {
      const idx = ALL_DAYS.indexOf(day);
      const date = new Date(monday);
      date.setDate(monday.getDate() + idx);
      const isInPlan = days.includes(day);
      const isToday = weekOffset === 0 && day === getCurrentDayOfWeek();
      const hasMeals = mealPlan?.meals[day] && Object.keys(mealPlan.meals[day] || {}).length > 0;
      return { day, dateNum: date.getDate(), isInPlan, isToday, hasMeals, fullDate: date };
    });
  };

  const getWeekLabel = (): string => {
    if (weekOffset === 0) return 'This Week';
    if (weekOffset === 1) return 'Next Week';
    if (weekOffset === -1) return 'Last Week';
    return `${weekOffset > 0 ? '+' : ''}${weekOffset} Weeks`;
  };

  const getWeekDateRange = (): string => {
    const info = getDaysInfo();
    const start = info[0].fullDate;
    const end = info[6].fullDate;
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  // ------- Daily Nutrition (for selected day) -------

  const getDayNutrition = () => {
    if (!macroSummary?.daily_breakdown?.[selectedDay]) return null;
    return macroSummary.daily_breakdown[selectedDay];
  };

  const getTargets = () => {
    const cal = macroSummary?.target_comparison?.calorie_target || 2000;
    const prot = macroSummary?.target_comparison?.protein_target_grams || 150;
    return { calories: cal, protein: prot, carbs: Math.round(cal * 0.4 / 4), fat: Math.round(cal * 0.3 / 9) };
  };

  // ------- Actions -------

  const handleRegenerateMeal = async (mealType: string) => {
    if (!mealPlan) return;
    const mealKey = `${selectedDay}-${mealType}`;
    if (regeneratingMealsRef.current.has(mealKey)) return;

    try {
      regeneratingMealsRef.current.add(mealKey);
      if (isMountedRef.current) setRegeneratingMeal(mealKey);
      const newRecipe = await mealPlanService.regenerateMeal(mealPlan.id, selectedDay, mealType as MealType);
      if (!isMountedRef.current) return;
      setRecipes((prev) => ({ ...prev, [newRecipe.id]: newRecipe }));
      setMealPlan((prev) => {
        if (!prev) return prev;
        return { ...prev, meals: { ...prev.meals, [selectedDay]: { ...prev.meals[selectedDay], [mealType]: newRecipe.id } } };
      });
      loadMacroSummary(mealPlan.id);
    } catch {
      if (isMountedRef.current) Alert.alert('Error', 'Failed to swap meal. Please try again.');
    } finally {
      regeneratingMealsRef.current.delete(mealKey);
      if (isMountedRef.current) setRegeneratingMeal(null);
    }
  };

  const handleRemoveMeal = async (mealType: string) => {
    if (!mealPlan) return;
    try {
      const updatedMeals = { ...mealPlan.meals };
      if (updatedMeals[selectedDay]) {
        const dayMeals = { ...updatedMeals[selectedDay] } as any;
        delete dayMeals[mealType];
        updatedMeals[selectedDay] = dayMeals;
      }
      await mealPlanService.updateMealPlanMeals(mealPlan.id, updatedMeals);
      setMealPlan((prev) => prev ? { ...prev, meals: updatedMeals } : prev);
      loadMacroSummary(mealPlan.id);
    } catch {
      Alert.alert('Error', 'Failed to remove meal.');
    }
  };

  const handleClearMealPlan = () => {
    if (!mealPlan) return;
    Alert.alert('Clear Meal Plan', 'Delete this meal plan? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await mealPlanService.deleteMealPlan(mealPlan.id);
            // Clear cached data so loadMealPlan doesn't restore the deleted plan
            useDataStore.getState().setMealPlan(null, {}, null);
            if (isMountedRef.current) { setMealPlan(null); setRecipes({}); setMacroSummary(null); }
          } catch { Alert.alert('Error', 'Failed to delete meal plan.'); }
        },
      },
    ]);
  };

  const handleCreateWithAI = async () => {
    if (selectedCreateDays.size === 0) return;
    setGenerating(true);
    try {
      const days = ALL_DAYS.filter((d) => selectedCreateDays.has(d));
      await mealPlanService.generateMealPlanForWeek(weekOffset, days);
      setShowCreateSheet(false);
      await loadMealPlan();
    } catch (err: any) {
      console.error('[Generate] error:', JSON.stringify(err?.response?.data), 'msg:', err?.message, 'code:', err?.code);
      const detail = err?.response?.data?.detail || err?.message || 'Please try again.';
      Alert.alert('Error', detail);
    } finally {
      setGenerating(false);
    }
  };

  const handleBuildManually = () => {
    const days = ALL_DAYS.filter((d) => selectedCreateDays.has(d));
    setShowCreateSheet(false);
    navigation.navigate('MealPlanEdit', { selectedDays: days, weekOffset });
  };

  // ------- Render -------

  if (loading) {
    return (
      <View style={styles.container}>
        <TabHeader title="Meal Plan" />
        <MealPlanSkeleton />
      </View>
    );
  }

  if (loadError && !mealPlan && !loading) {
    return (
      <View style={styles.container}>
        <TabHeader title="Meal Plan" />
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't Load Meal Plan"
          description={loadError}
          actionLabel="Try Again"
          onAction={() => { setLoadError(null); loadMealPlan(); }}
        />
      </View>
    );
  }

  if (!mealPlan) {
    return (
      <View style={styles.container}>
        <TabHeader title="Meal Plan" />
        <WeekNav weekOffset={weekOffset} setWeekOffset={setWeekOffset} getWeekLabel={getWeekLabel} getWeekDateRange={getWeekDateRange} colors={colors} />
        <EmptyState
          icon="calendar-outline"
          title="No Meal Plan"
          description={weekOffset < 0
            ? `No meal plan was created for ${getWeekLabel().toLowerCase()}.`
            : weekOffset === 0
            ? 'Create a meal plan powered by AI that fits your needs.'
            : `No meal plan for ${getWeekLabel().toLowerCase()}.`}
          actionLabel={weekOffset < 0 ? undefined : "Create Meal Plan"}
          onAction={weekOffset < 0 ? undefined : () => { setSelectedCreateDays(new Set(ALL_DAYS)); setShowCreateSheet(true); }}
        />
        {weekOffset >= 0 && renderCreateSheet()}
      </View>
    );
  }

  const daysInfo = getDaysInfo();
  const dayNutrition = getDayNutrition();
  const targets = getTargets();
  const mealTypes = getMealTypes();

  return (
    <View style={styles.container}>
      <TabHeader
        title="Meal Plan"
        secondaryActions={[
          {
            icon: 'ellipsis-horizontal',
            onPress: () => setShowMenu(!showMenu),
            accessibilityLabel: 'Meal plan options',
          },
        ]}
      />

      {/* Action Menu Dropdown */}
      {showMenu && (
        <>
          <TouchableOpacity style={styles.menuBackdrop} onPress={() => setShowMenu(false)} activeOpacity={1} />
          <View style={[styles.menuDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setSelectedCreateDays(new Set(ALL_DAYS)); setShowCreateSheet(true); }}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Create New Plan</Text>
            </TouchableOpacity>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); navigation.navigate('MealPlanEdit', { mealPlan, recipes }); }}>
              <Ionicons name="create-outline" size={18} color={colors.primary} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Edit Meal Plan</Text>
            </TouchableOpacity>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); handleClearMealPlan(); }}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={[styles.menuItemText, { color: colors.error }]}>Clear Meal Plan</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Week Navigation */}
      <WeekNav weekOffset={weekOffset} setWeekOffset={setWeekOffset} getWeekLabel={getWeekLabel} getWeekDateRange={getWeekDateRange} colors={colors} />

      {/* Day Strip — all 7 days visible */}
      <View style={styles.dayStrip}>
        {daysInfo.map(({ day, dateNum, isInPlan, isToday, hasMeals }) => (
          <TouchableOpacity
            key={day}
            style={[
              styles.dayCell,
              selectedDay === day && styles.dayCellSelected,
              !isInPlan && styles.dayCellDisabled,
            ]}
            onPress={() => isInPlan && setSelectedDay(day)}
            disabled={!isInPlan}
          >
            <Text style={[
              styles.dayAbbr,
              selectedDay === day && styles.dayAbbrSelected,
              !isInPlan && styles.dayAbbrDisabled,
            ]}>
              {DAY_LABELS[day]}
            </Text>
            <View style={[
              styles.dayNumCircle,
              selectedDay === day && { backgroundColor: colors.primary },
              isToday && selectedDay !== day && { backgroundColor: colors.primary + '20' },
            ]}>
              <Text style={[
                styles.dayNum,
                selectedDay === day && { color: '#FFF' },
                isToday && selectedDay !== day && { color: colors.primary },
                !isInPlan && styles.dayAbbrDisabled,
              ]}>
                {dateNum}
              </Text>
            </View>
            {hasMeals && selectedDay !== day && (
              <View style={[styles.dayDot, { backgroundColor: colors.primary }]} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Daily Nutrition Bar */}
        {dayNutrition && (
          <View style={styles.nutritionBar}>
            <NutritionProgress
              label="Calories"
              current={dayNutrition.totals.calories}
              target={targets.calories}
              unit="cal"
              color={colors.primary}
              colors={colors}
            />
            <View style={styles.macroRow}>
              <NutritionProgress
                label="Protein"
                current={dayNutrition.totals.protein_grams}
                target={targets.protein}
                unit="g"
                color={colors.proteinColor}
                compact
                colors={colors}
              />
              <NutritionProgress
                label="Carbs"
                current={dayNutrition.totals.carbs_grams}
                target={targets.carbs}
                unit="g"
                color={colors.carbsColor}
                compact
                colors={colors}
              />
              <NutritionProgress
                label="Fat"
                current={dayNutrition.totals.fat_grams}
                target={targets.fat}
                unit="g"
                color={colors.fatColor}
                compact
                colors={colors}
              />
            </View>
          </View>
        )}

        {/* Meal Cards */}
        <View style={styles.mealsContainer}>
          {mealTypes.map((mt) => {
            const dayMeals = mealPlan.meals[selectedDay] as any;
            const slot = dayMeals?.[mt.key] as MealSlot | undefined;
            const recipeId = getRecipeIdFromSlot(slot);
            const recipe = recipeId ? recipes[recipeId] : null;
            const isRegenerating = regeneratingMeal === `${selectedDay}-${mt.key}`;
            const isRepeat = isRepeatMeal(slot);
            const originalDay = getOriginalDay(slot);

            return (
              <TouchableOpacity
                key={mt.key}
                style={styles.mealCard}
                onPress={() => {
                  if (recipe) setShowMealOptions(mt.key);
                  else navigation.navigate('MealPlanEdit', { mealPlan, recipes });
                }}
                activeOpacity={0.7}
                disabled={isRegenerating}
              >
                {/* Meal Label Row */}
                <View style={styles.mealLabelRow}>
                  <Text style={styles.mealLabel}>{mt.label}</Text>
                  {mt.time && <Text style={styles.mealTime}>{mt.time}</Text>}
                  {isRepeat && (
                    <View style={[styles.repeatBadge, { backgroundColor: colors.primary + '15' }]}>
                      <Text style={[styles.repeatBadgeText, { color: colors.primary }]}>
                        {originalDay ? `Leftovers \u00B7 ${originalDay.charAt(0).toUpperCase() + originalDay.slice(1)}` : 'Same Recipe'}
                      </Text>
                    </View>
                  )}
                  {/* Quick-swap: one-tap swap, bypasses options sheet */}
                  {recipe && !isRepeat && !isRegenerating && (
                    <TouchableOpacity
                      style={[styles.swapBtn, { backgroundColor: colors.backgroundSecondary }]}
                      onPress={(e) => { e.stopPropagation(); handleRegenerateMeal(mt.key); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name='refresh-outline' size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {isRegenerating ? (
                  <View style={styles.mealLoadingRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.mealLoadingText}>Finding a new recipe…</Text>
                  </View>
                ) : recipe ? (
                  <View style={styles.mealContent}>
                    {recipe.image_url ? (
                      <Image source={{ uri: recipe.image_url }} style={styles.mealImage} />
                    ) : (
                      <View style={[styles.mealImagePlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                        <Ionicons name="restaurant-outline" size={24} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.mealInfo}>
                      <Text style={styles.mealTitle} numberOfLines={2}>{recipe.title}</Text>
                      {originalDay && (
                        <Text style={[styles.mealMeta, { color: colors.primary }]}>
                          From {originalDay.charAt(0).toUpperCase() + originalDay.slice(1)}
                        </Text>
                      )}
                      <View style={styles.mealStats}>
                        {recipe.cook_time != null && (
                          <Text style={styles.mealMeta}>{recipe.prep_time || recipe.cook_time} min</Text>
                        )}
                        {recipe.calories != null && (
                          <Text style={styles.mealMeta}>· {recipe.calories} cal</Text>
                        )}
                      </View>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.emptySlot, { borderColor: colors.border }]}
                    onPress={() => navigation.navigate('MealPlanEdit', { mealPlan, recipes })}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                    <Text style={[styles.emptySlotText, { color: colors.textSecondary }]}>Add a recipe</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Grocery List CTA */}
        <TouchableOpacity
          style={styles.groceryCta}
          onPress={() => navigation.getParent()?.navigate('GroceryList')}
          activeOpacity={0.7}
        >
          <Ionicons name="cart-outline" size={20} color={colors.primary} />
          <Text style={styles.groceryCtaText}>View Grocery List</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>

      {/* Meal Options Sheet */}
      {showMealOptions && (
        <Modal transparent animationType="slide" onRequestClose={() => setShowMealOptions(null)}>
          <TouchableOpacity style={styles.sheetBackdrop} onPress={() => setShowMealOptions(null)} activeOpacity={1}>
            <View style={[styles.optionsSheet, { backgroundColor: colors.card }]}>
              <View style={[styles.sheetHandle, { alignSelf: 'center', marginBottom: 8 }]} />
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  const mt = showMealOptions;
                  setShowMealOptions(null);
                  const dayMeals = mealPlan.meals[selectedDay] as any;
                  const rid = getRecipeIdFromSlot(dayMeals?.[mt]);
                  if (rid && recipes[rid]) navigation.navigate('RecipeDetail', { recipe: recipes[rid] });
                }}
              >
                <Ionicons name="eye-outline" size={20} color={colors.text} />
                <Text style={[styles.optionText, { color: colors.text }]}>View Recipe</Text>
              </TouchableOpacity>
              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  const mt = showMealOptions;
                  setShowMealOptions(null);
                  handleRegenerateMeal(mt);
                }}
              >
                <Ionicons name="refresh-outline" size={20} color={colors.text} />
                <Text style={[styles.optionText, { color: colors.text }]}>Swap Meal</Text>
              </TouchableOpacity>
              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setShowMealOptions(null);
                  navigation.navigate('MealPlanEdit', { mealPlan, recipes });
                }}
              >
                <Ionicons name="search-outline" size={20} color={colors.text} />
                <Text style={[styles.optionText, { color: colors.text }]}>Browse & Pick</Text>
              </TouchableOpacity>
              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  const mt = showMealOptions;
                  setShowMealOptions(null);
                  handleRemoveMeal(mt);
                }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
                <Text style={[styles.optionText, { color: colors.error }]}>Remove Meal</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Create Meal Plan Sheet */}
      {renderCreateSheet()}
    </View>
  );

  function renderCreateSheet() {
    return (
      <Modal visible={showCreateSheet} transparent animationType="slide" onRequestClose={() => setShowCreateSheet(false)}>
        <TouchableOpacity style={styles.sheetBackdrop} onPress={() => !generating && setShowCreateSheet(false)} activeOpacity={1}>
          <View style={[styles.createSheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.createSheetTitle}>Create Meal Plan</Text>
            <Text style={styles.createSheetSubtitle}>{getWeekLabel()} · {getWeekDateRange()}</Text>

            {/* Day Toggles */}
            <View style={styles.createDayRow}>
              {ALL_DAYS.map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.createDayChip,
                    selectedCreateDays.has(day) && { backgroundColor: colors.primary },
                    !selectedCreateDays.has(day) && { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, borderWidth: 1 },
                  ]}
                  onPress={() => {
                    setSelectedCreateDays((prev) => {
                      const next = new Set(prev);
                      if (next.has(day)) { if (next.size > 1) next.delete(day); }
                      else next.add(day);
                      return next;
                    });
                  }}
                >
                  <Text style={[
                    styles.createDayChipText,
                    selectedCreateDays.has(day) ? { color: '#FFF' } : { color: colors.textSecondary },
                  ]}>
                    {DAY_LABELS[day]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Presets */}
            <View style={styles.presetRow}>
              <TouchableOpacity
                style={[styles.presetChip, { borderColor: colors.border }]}
                onPress={() => setSelectedCreateDays(new Set(ALL_DAYS))}
              >
                <Text style={[styles.presetText, { color: colors.textSecondary }]}>Full Week</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.presetChip, { borderColor: colors.border }]}
                onPress={() => setSelectedCreateDays(new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as DayOfWeek[]))}
              >
                <Text style={[styles.presetText, { color: colors.textSecondary }]}>Weekdays</Text>
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: colors.primary }, generating && { opacity: 0.6 }]}
              onPress={handleCreateWithAI}
              disabled={generating}
            >
              {generating ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#FFF" />
                  <Text style={styles.createButtonText}>Building your plan…</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="sparkles" size={17} color="#FFF" />
                  <Text style={styles.createButtonText}>Generate Plan</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.createButtonSecondary, { borderColor: colors.border }]}
              onPress={handleBuildManually}
              disabled={generating}
            >
              <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.createButtonSecondaryText, { color: colors.text }]}>Build Manually</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  }
};

// ------- Sub-Components -------

const WeekNav: React.FC<{
  weekOffset: number;
  setWeekOffset: (fn: (w: number) => number) => void;
  getWeekLabel: () => string;
  getWeekDateRange: () => string;
  colors: ThemeColors;
}> = ({ weekOffset, setWeekOffset, getWeekLabel, getWeekDateRange, colors }) => (
  <View style={weekNavStyles.container}>
    <TouchableOpacity onPress={() => setWeekOffset((w) => w - 1)} style={weekNavStyles.arrow}>
      <Text style={[weekNavStyles.arrowText, { color: colors.primary }]}>‹</Text>
    </TouchableOpacity>
    <View style={weekNavStyles.center}>
      <Text style={[weekNavStyles.label, { color: colors.text }]}>{getWeekLabel()}</Text>
      <Text style={[weekNavStyles.range, { color: colors.textMuted }]}>{getWeekDateRange()}</Text>
    </View>
    <TouchableOpacity onPress={() => setWeekOffset((w) => w + 1)} style={weekNavStyles.arrow}>
      <Text style={[weekNavStyles.arrowText, { color: colors.primary }]}>›</Text>
    </TouchableOpacity>
  </View>
);

const NutritionProgress: React.FC<{
  label: string;
  current: number;
  target: number;
  unit: string;
  color: string;
  compact?: boolean;
  colors: ThemeColors;
}> = ({ label, current, target, unit, color, compact, colors }) => {
  const pct = Math.min((current / target) * 100, 100);
  const isOver = current > target;

  if (compact) {
    return (
      <View style={nutritionStyles.compactContainer}>
        <View style={nutritionStyles.compactHeader}>
          <Text style={[nutritionStyles.compactLabel, { color: colors.textMuted }]}>{label}</Text>
          <Text style={[nutritionStyles.compactValue, { color: colors.text }]}>{Math.round(current)}{unit}</Text>
        </View>
        <View style={[nutritionStyles.barBg, { backgroundColor: colors.border }]}>
          <View style={[nutritionStyles.barFill, { width: `${pct}%`, backgroundColor: isOver ? colors.error : color }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={nutritionStyles.container}>
      <View style={nutritionStyles.header}>
        <Text style={[nutritionStyles.label, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[nutritionStyles.value, { color: colors.text }]}>
          <Text style={{ fontWeight: '700' }}>{Math.round(current)}</Text>
          <Text style={{ color: colors.textMuted }}> / {target} {unit}</Text>
        </Text>
      </View>
      <View style={[nutritionStyles.barBgLarge, { backgroundColor: colors.border }]}>
        <View style={[nutritionStyles.barFillLarge, { width: `${pct}%`, backgroundColor: isOver ? colors.error : color }]} />
      </View>
    </View>
  );
};

// ------- Styles -------

const weekNavStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  arrow: { padding: 8, width: 44, alignItems: 'center' },
  arrowText: { fontSize: 28, fontWeight: '300' },
  center: { alignItems: 'center', flex: 1 },
  label: { fontSize: 16, fontWeight: '600' },
  range: { fontSize: 13, marginTop: 2 },
});

const nutritionStyles = StyleSheet.create({
  container: { marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '500' },
  value: { fontSize: 14 },
  barBgLarge: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFillLarge: { height: 8, borderRadius: 4 },
  compactContainer: { flex: 1 },
  compactHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  compactLabel: { fontSize: 11, fontWeight: '500' },
  compactValue: { fontSize: 12, fontWeight: '600' },
  barBg: { height: 5, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    menuBackdrop: { ...StyleSheet.absoluteFillObject, zIndex: 99 },
    menuDropdown: {
      position: 'absolute', top: 56, right: 16, borderRadius: 14, borderWidth: 1, zIndex: 100,
      elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, minWidth: 210,
    },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
    menuItemIcon: { fontSize: 18 },
    menuItemText: { fontSize: 15, flex: 1 },
    menuDivider: { height: StyleSheet.hairlineWidth },

    // Day strip
    dayStrip: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'space-between' },
    dayCell: { alignItems: 'center', width: DAY_CELL_WIDTH, paddingVertical: 4 },
    dayCellSelected: {},
    dayCellDisabled: { opacity: 0.3 },
    dayAbbr: { fontSize: 12, fontWeight: '500', color: colors.textMuted, marginBottom: 4 },
    dayAbbrSelected: { color: colors.primary, fontWeight: '700' },
    dayAbbrDisabled: { color: colors.textMuted },
    dayNumCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    dayNum: { fontSize: 15, fontWeight: '600', color: colors.text },
    dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },

    // Nutrition
    nutritionBar: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
    macroRow: { flexDirection: 'row', gap: 12, marginTop: 4 },

    // Meals
    mealsContainer: { paddingHorizontal: 16, paddingTop: 0 },
    mealCard: {
      backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    },
    mealLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
    mealLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    mealTime: { fontSize: 12, color: colors.textMuted },
    repeatBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    repeatBadgeText: { fontSize: 11, fontWeight: '600' },
    swapBtn: { marginLeft: 'auto', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    mealContent: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    mealImage: { width: 64, height: 64, borderRadius: 12 },
    mealImagePlaceholder: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    mealInfo: { flex: 1 },
    mealTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 4 },
    mealStats: { flexDirection: 'row', gap: 4 },
    mealMeta: { fontSize: 13, color: colors.textMuted },
    mealLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    mealLoadingText: { fontSize: 14, color: colors.textMuted },
    emptySlot: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12,
      paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed',
    },
    emptySlotText: { fontSize: 14, fontWeight: '500' },

    // Grocery CTA
    groceryCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 8,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.primary,
      gap: 8,
    },
    groceryCtaText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.primary,
    },

    // Options sheet
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    optionsSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40, paddingTop: 12 },
    optionItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 14 },
    optionIcon: { fontSize: 20 },
    optionText: { fontSize: 16 },

    // Create sheet
    createSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
    createSheetTitle: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 4 },
    createSheetSubtitle: { fontSize: 14, color: colors.textMuted, marginBottom: 20 },
    createDayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    createDayChip: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    createDayChipText: { fontSize: 13, fontWeight: '600' },
    presetRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    presetChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
    presetText: { fontSize: 13 },
    createButton: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
    createButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    createButtonSecondary: { borderWidth: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
    createButtonSecondaryText: { fontSize: 16, fontWeight: '600' },
  });
