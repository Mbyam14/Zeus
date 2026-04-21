import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  FlatList,
  TextInput,
  Image,
  Modal,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore, ThemeColors } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { mealPlanService } from '../../services/mealPlanService';
import { recipeService } from '../../services/recipeService';
import {
  MealPlan,
  Recipe,
  DayOfWeek,
  MealType,
  MealTypeConfig,
  DEFAULT_MEAL_TYPES,
  getRecipeIdFromSlot,
} from '../../types/mealplan';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MealPlanBuilderProps {
  navigation: any;
  route: {
    params: {
      mealPlan?: MealPlan;
      recipes?: Record<string, Recipe>;
      selectedDays?: DayOfWeek[];
      weekOffset?: number;
    };
  };
}

const ALL_DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

export const MealPlanEditScreen: React.FC<MealPlanBuilderProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const styles = createStyles(colors);

  const existingMealPlan = route.params.mealPlan;
  const existingRecipes = route.params.recipes;
  const isEditMode = !!existingMealPlan;

  const selectedDays: DayOfWeek[] = isEditMode
    ? (existingMealPlan.selected_days || ALL_DAYS)
    : (route.params.selectedDays || ALL_DAYS);

  const mealTypes: MealTypeConfig[] = existingMealPlan?.meal_types || DEFAULT_MEAL_TYPES;
  const weekOffset = route.params.weekOffset ?? 0;

  // Compute date numbers for the day strip
  const getDayDates = () => {
    const today = new Date();
    const monday = new Date(today);
    const dow = today.getDay();
    monday.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow) + weekOffset * 7);

    return ALL_DAYS.map((day, idx) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + idx);
      return {
        day,
        dateNum: date.getDate(),
        isInPlan: selectedDays.includes(day),
        hasMeals: mealTypes.some((mt) => false), // updated dynamically below
      };
    });
  };

  // State: day -> mealKey -> recipe
  const [assignments, setAssignments] = useState<Record<string, Record<string, Recipe | null>>>(() => {
    const init: Record<string, Record<string, Recipe | null>> = {};
    for (const day of selectedDays) {
      init[day] = {};
      for (const mt of mealTypes) {
        let recipe: Recipe | null = null;
        if (isEditMode && existingMealPlan.meals[day]) {
          const slot = (existingMealPlan.meals[day] as any)?.[mt.key];
          const rid = getRecipeIdFromSlot(slot);
          if (rid && existingRecipes?.[rid]) recipe = existingRecipes[rid];
        }
        init[day][mt.key] = recipe;
      }
    }
    return init;
  });

  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(selectedDays[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMealKey, setPickerMealKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fillingWithAI, setFillingWithAI] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const RECIPE_FILTERS = [
    { key: null, label: 'All' },
    { key: 'Breakfast', label: 'Breakfast' },
    { key: 'Lunch', label: 'Lunch' },
    { key: 'Dinner', label: 'Dinner' },
    { key: 'Snack', label: 'Snack' },
  ];

  // Load recipes for the picker
  const loadRecipes = useCallback(async (query?: string, mealType?: string | null) => {
    setLoadingRecipes(true);
    try {
      const dietaryRestrictions = user?.profile_data?.preferences?.dietary_restrictions || [];
      const recipes = await recipeService.getAllRecipes(
        50, 0, query || undefined, mealType || undefined,
        dietaryRestrictions.length > 0 ? dietaryRestrictions : undefined,
      );
      setAllRecipes(recipes);
    } catch { /* silent */ }
    finally { setLoadingRecipes(false); }
  }, [user]);

  useEffect(() => { loadRecipes(); }, []);

  // ------- Helpers -------

  const getFilledCount = () => {
    let count = 0;
    for (const day of selectedDays) {
      for (const mt of mealTypes) {
        if (assignments[day]?.[mt.key]) count++;
      }
    }
    return count;
  };

  const getTotalCount = () => selectedDays.length * mealTypes.length;

  // ------- Actions -------

  const openPicker = (mealKey: string) => {
    setPickerMealKey(mealKey);
    setSearchQuery('');
    // Auto-set filter based on the meal slot type
    const mealLabel = mealTypes.find((mt) => mt.key === mealKey)?.label || null;
    const matchingFilter = RECIPE_FILTERS.find((f) => f.key && f.key.toLowerCase() === mealLabel?.toLowerCase());
    const autoFilter = matchingFilter?.key || null;
    setActiveFilter(autoFilter);
    setPickerOpen(true);
    loadRecipes('', autoFilter);
  };

  const assignRecipe = (recipe: Recipe) => {
    if (!pickerMealKey) return;
    setAssignments((prev) => ({
      ...prev,
      [selectedDay]: { ...prev[selectedDay], [pickerMealKey]: recipe },
    }));
    setHasChanges(true);
    setPickerOpen(false);
    setPickerMealKey(null);
  };

  const removeRecipe = (mealKey: string) => {
    setAssignments((prev) => ({
      ...prev,
      [selectedDay]: { ...prev[selectedDay], [mealKey]: null },
    }));
    setHasChanges(true);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    loadRecipes(text, activeFilter);
  };

  const handleFilter = (filterKey: string | null) => {
    setActiveFilter(filterKey);
    loadRecipes(searchQuery, filterKey);
  };

  const getStartDate = (): string => {
    const weekOffset = route.params.weekOffset ?? 0;
    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7);
    return monday.toISOString().split('T')[0];
  };

  const convertToApiFormat = () => {
    const mealsForApi: Record<string, Record<string, any>> = {};
    for (const day of selectedDays) {
      mealsForApi[day] = {};
      for (const mt of mealTypes) {
        const recipe = assignments[day]?.[mt.key];
        if (recipe) {
          mealsForApi[day][mt.key] = { recipe_id: recipe.id, is_repeat: false };
        }
      }
    }
    return mealsForApi;
  };

  const handleSave = async () => {
    const filledCount = getFilledCount();
    if (!isEditMode && filledCount === 0) {
      Alert.alert('Empty Plan', 'Add at least one meal before saving.');
      return;
    }
    setSaving(true);
    try {
      const mealsForApi = convertToApiFormat();
      if (isEditMode) {
        await mealPlanService.updateMealPlanMeals(existingMealPlan.id, mealsForApi);
      } else {
        await mealPlanService.createManualMealPlan(getStartDate(), selectedDays, mealsForApi);
      }
      Alert.alert('Success', isEditMode ? 'Meal plan updated!' : 'Meal plan created!', [
        { text: 'OK', onPress: () => navigation.navigate('MealPlanMain') },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save meal plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleFillWithAI = () => {
    const emptyCount = getTotalCount() - getFilledCount();
    if (emptyCount === 0) { Alert.alert('All Filled', 'All slots have recipes!'); return; }

    Alert.alert('Fill with AI', `AI will generate recipes for ${emptyCount} empty slot${emptyCount > 1 ? 's' : ''}. Continue?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Fill', onPress: async () => {
          setFillingWithAI(true);
          try {
            const mealsForApi = convertToApiFormat();
            if (isEditMode) {
              await mealPlanService.updateMealPlanMeals(existingMealPlan.id, mealsForApi);
              await mealPlanService.fillRemainingWithAI(existingMealPlan.id);
            } else {
              const created = await mealPlanService.createManualMealPlan(getStartDate(), selectedDays, mealsForApi);
              await mealPlanService.fillRemainingWithAI(created.id);
            }
            Alert.alert('Success', 'Empty slots filled!', [
              { text: 'OK', onPress: () => navigation.navigate('MealPlanMain') },
            ]);
          } catch { Alert.alert('Error', 'Failed to fill with AI.'); }
          finally { setFillingWithAI(false); }
        },
      },
    ]);
  };

  const handleCancel = () => {
    if (hasChanges) {
      Alert.alert('Discard Changes?', 'You have unsaved changes.', [
        { text: 'Keep Building', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  };

  // ------- Full-screen loading -------

  if (saving || fillingWithAI) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>
          {fillingWithAI ? 'AI is filling empty slots...' : 'Saving your meal plan...'}
        </Text>
      </View>
    );
  }

  const filledCount = getFilledCount();
  const totalCount = getTotalCount();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditMode ? 'Edit Plan' : 'Build Plan'}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.fillBtn} onPress={handleFillWithAI}>
            <Text style={styles.fillBtnText}>Fill AI</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, (filledCount === 0 && !isEditMode) && { opacity: 0.4 }]}
            onPress={handleSave}
            disabled={filledCount === 0 && !isEditMode}
          >
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.progressRow}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${totalCount > 0 ? (filledCount / totalCount) * 100 : 0}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{filledCount} / {totalCount} meals</Text>
      </View>

      {/* Day Strip */}
      <View style={styles.dayStrip}>
        {getDayDates().map(({ day, dateNum, isInPlan }) => {
          const dayFilled = mealTypes.filter((mt) => assignments[day]?.[mt.key]).length;
          const isSelected = selectedDay === day;
          return (
            <TouchableOpacity
              key={day}
              style={[styles.dayCell, !isInPlan && styles.dayCellDisabled]}
              onPress={() => isInPlan && setSelectedDay(day)}
              disabled={!isInPlan}
            >
              <Text style={[
                styles.dayAbbr,
                isSelected && styles.dayAbbrSelected,
                !isInPlan && styles.dayAbbrDisabled,
              ]}>
                {DAY_LABELS[day]}
              </Text>
              <View style={[
                styles.dayNumCircle,
                isSelected && { backgroundColor: colors.primary },
              ]}>
                <Text style={[
                  styles.dayNum,
                  isSelected && { color: '#FFF' },
                  !isInPlan && styles.dayAbbrDisabled,
                ]}>
                  {dateNum}
                </Text>
              </View>
              {dayFilled > 0 && !isSelected && (
                <View style={[styles.dayDot, { backgroundColor: colors.primary }]} />
              )}
              {isSelected && dayFilled > 0 && (
                <View style={[styles.dayDot, { backgroundColor: colors.primary }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Meal Slots for Selected Day */}
      <ScrollView style={styles.slotsContainer} contentContainerStyle={{ paddingBottom: 40 }}>
        {mealTypes.map((mt) => {
          const recipe = assignments[selectedDay]?.[mt.key];
          return (
            <View key={mt.key} style={styles.slotCard}>
              <Text style={styles.slotLabel}>{mt.label}{mt.time ? ` · ${mt.time}` : ''}</Text>
              {recipe ? (
                <View style={styles.slotFilled}>
                  <TouchableOpacity
                    style={styles.slotRecipeRow}
                    onPress={() => openPicker(mt.key)}
                    activeOpacity={0.7}
                  >
                    {recipe.image_url ? (
                      <Image source={{ uri: recipe.image_url }} style={styles.slotImage} />
                    ) : (
                      <View style={[styles.slotImagePlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                        <Text style={{ fontSize: 20 }}>🍽️</Text>
                      </View>
                    )}
                    <View style={styles.slotRecipeInfo}>
                      <Text style={styles.slotRecipeTitle} numberOfLines={1}>{recipe.title}</Text>
                      <View style={styles.slotRecipeStats}>
                        {recipe.calories != null && <Text style={styles.slotRecipeMeta}>{recipe.calories} cal</Text>}
                        {recipe.cook_time != null && <Text style={styles.slotRecipeMeta}> · {recipe.cook_time} min</Text>}
                      </View>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeRecipe(mt.key)} style={styles.slotRemoveBtn}>
                    <Text style={styles.slotRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.slotEmpty} onPress={() => openPicker(mt.key)}>
                  <Text style={styles.slotEmptyPlus}>+</Text>
                  <Text style={styles.slotEmptyText}>Tap to add a recipe</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Recipe Picker Modal */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.pickerContainer, { paddingTop: insets.top }]}>
          {/* Fixed top section: header + search + filters */}
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setPickerOpen(false)}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Choose Recipe</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.pickerSearchRow}>
            <TextInput
              style={styles.pickerSearchInput}
              placeholder="Search recipes..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={handleSearch}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>

          <View style={styles.filterRowContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {RECIPE_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.label}
                  style={[
                    styles.filterChip,
                    activeFilter === f.key && styles.filterChipActive,
                  ]}
                  onPress={() => handleFilter(f.key)}
                >
                  <Text style={[
                    styles.filterChipText,
                    activeFilter === f.key && styles.filterChipTextActive,
                  ]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Recipe List — takes remaining space */}
          {loadingRecipes ? (
            <View style={styles.pickerLoading}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={allRecipes}
              keyExtractor={(item) => item.id}
              style={styles.pickerList}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickerRecipeRow} onPress={() => assignRecipe(item)}>
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.pickerRecipeImage} />
                  ) : (
                    <View style={[styles.pickerRecipeImagePlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                      <Text style={{ fontSize: 22 }}>🍽️</Text>
                    </View>
                  )}
                  <View style={styles.pickerRecipeInfo}>
                    <Text style={styles.pickerRecipeTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={styles.pickerRecipeStats}>
                      {item.calories != null && <Text style={styles.pickerRecipeMeta}>{item.calories} cal</Text>}
                      {item.cook_time != null && <Text style={styles.pickerRecipeMeta}> · {item.cook_time} min</Text>}
                      {item.cuisine_type && <Text style={styles.pickerRecipeMeta}> · {item.cuisine_type}</Text>}
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmpty}>No recipes found. Try a different search.</Text>
              }
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

export default MealPlanEditScreen;

// ------- Styles -------

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    backBtnText: { fontSize: 28, color: colors.primary, fontWeight: '300' },
    headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    headerActions: { flexDirection: 'row', gap: 8 },
    fillBtn: { backgroundColor: colors.textMuted + '20', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
    fillBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
    saveBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
    saveBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
    loadingText: { marginTop: 16, fontSize: 16, color: colors.textSecondary },

    // Progress
    progressRow: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    progressBarBg: { flex: 1, height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden', marginRight: 10 },
    progressBarFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
    progressLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },

    // Day Strip (calendar style)
    dayStrip: {
      flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'space-between',
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    dayCell: { alignItems: 'center', flex: 1, paddingVertical: 4 },
    dayCellDisabled: { opacity: 0.3 },
    dayAbbr: { fontSize: 12, fontWeight: '500', color: colors.textMuted, marginBottom: 4 },
    dayAbbrSelected: { color: colors.primary, fontWeight: '700' },
    dayAbbrDisabled: { color: colors.textMuted },
    dayNumCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    dayNum: { fontSize: 15, fontWeight: '600', color: colors.text },
    dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },

    // Slots
    slotsContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    slotCard: {
      backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    },
    slotLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    slotFilled: { flexDirection: 'row', alignItems: 'center' },
    slotRecipeRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
    slotImage: { width: 52, height: 52, borderRadius: 10 },
    slotImagePlaceholder: { width: 52, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    slotRecipeInfo: { flex: 1 },
    slotRecipeTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    slotRecipeStats: { flexDirection: 'row', marginTop: 2 },
    slotRecipeMeta: { fontSize: 13, color: colors.textMuted },
    slotRemoveBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.error + '15', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
    slotRemoveText: { fontSize: 14, color: colors.error, fontWeight: '600' },
    slotEmpty: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
    slotEmptyPlus: { fontSize: 22, color: colors.primary, fontWeight: '300' },
    slotEmptyText: { fontSize: 14, color: colors.textMuted },

    // Picker
    pickerContainer: { flex: 1, backgroundColor: colors.background },
    pickerHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    pickerCancel: { fontSize: 16, color: colors.primary },
    pickerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    pickerSearchRow: { paddingHorizontal: 16, paddingVertical: 10 },
    pickerSearchInput: {
      backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text,
    },
    filterRowContainer: {
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    pickerList: { flex: 1 },
    filterChip: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border,
    },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    filterChipTextActive: { color: '#FFF' },
    pickerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    pickerRecipeRow: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12,
    },
    pickerRecipeImage: { width: 56, height: 56, borderRadius: 10 },
    pickerRecipeImagePlaceholder: { width: 56, height: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    pickerRecipeInfo: { flex: 1 },
    pickerRecipeTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    pickerRecipeStats: { flexDirection: 'row', marginTop: 2 },
    pickerRecipeMeta: { fontSize: 13, color: colors.textMuted },
    pickerEmpty: { textAlign: 'center', color: colors.textMuted, fontSize: 15, paddingTop: 40 },
  });
