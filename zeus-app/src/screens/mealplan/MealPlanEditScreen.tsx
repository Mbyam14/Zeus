import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useThemeStore, ThemeColors } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { mealPlanService } from '../../services/mealPlanService';
import { recipeService } from '../../services/recipeService';
import { RecipeBrowser } from '../../components/RecipeBrowser';
import { MealGrid, MealAssignment } from '../../components/MealGrid';
import {
  MealPlan,
  Recipe,
  DayOfWeek,
  MealType,
  getRecipeIdFromSlot,
} from '../../types/mealplan';

interface MealPlanBuilderProps {
  navigation: any;
  route: {
    params: {
      // Edit mode: existing meal plan
      mealPlan?: MealPlan;
      recipes?: Record<string, Recipe>;
      // Build mode: selected days for new plan
      selectedDays?: DayOfWeek[];
    };
  };
}

export const MealPlanEditScreen: React.FC<MealPlanBuilderProps> = ({ navigation, route }) => {
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const styles = createStyles(colors);

  // Get user's dietary restrictions for filtering recipes
  const dietaryRestrictions = user?.profile_data?.preferences?.dietary_restrictions || [];

  const existingMealPlan = route.params.mealPlan;
  const existingRecipes = route.params.recipes;
  const isEditMode = !!existingMealPlan;

  // Determine selected days
  const selectedDays: DayOfWeek[] = isEditMode
    ? (existingMealPlan.selected_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
    : (route.params.selectedDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

  // Convert existing meal plan to assignment format (edit mode only)
  const convertToAssignments = (): Record<string, Record<string, MealAssignment | undefined>> => {
    const assignments: Record<string, Record<string, MealAssignment | undefined>> = {};

    for (const day of selectedDays) {
      assignments[day] = {
        breakfast: undefined,
        lunch: undefined,
        dinner: undefined,
        snack: undefined,
      };

      if (isEditMode && existingMealPlan.meals[day]) {
        const dayMeals = existingMealPlan.meals[day];
        const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];
        for (const mealType of mealTypes) {
          const slot = dayMeals[mealType];
          const recipeId = getRecipeIdFromSlot(slot);
          if (recipeId && existingRecipes?.[recipeId]) {
            assignments[day][mealType] = {
              recipe: existingRecipes[recipeId],
              isRepeat: typeof slot === 'object' && slot.is_repeat === true,
            };
          }
        }
      }
    }

    return assignments;
  };

  const [mealPlan, setMealPlan] = useState(convertToAssignments());
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [fillingWithAI, setFillingWithAI] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [loadingRecipes, setLoadingRecipes] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingRecipes(true);
        // Pass dietary restrictions to backend for server-side filtering
        const recipes = await recipeService.getAllRecipes(
          50, 0, undefined, undefined,
          dietaryRestrictions.length > 0 ? dietaryRestrictions : undefined
        );
        setAllRecipes(recipes);
      } catch (error) {
        console.error('Failed to load recipes:', error);
      } finally {
        setLoadingRecipes(false);
      }
    };
    load();
  }, []);

  const handleRecipeSelect = (recipe: Recipe | null) => {
    setSelectedRecipe(recipe);
  };

  const handleSlotPress = (day: DayOfWeek, mealType: MealType) => {
    if (selectedRecipe) {
      setMealPlan(prev => ({
        ...prev,
        [day]: {
          ...prev[day],
          [mealType]: {
            recipe: selectedRecipe,
            isRepeat: false,
          },
        },
      }));
      setHasChanges(true);
    } else {
      const currentAssignment = mealPlan[day]?.[mealType];
      if (currentAssignment?.recipe) {
        setMealPlan(prev => ({
          ...prev,
          [day]: {
            ...prev[day],
            [mealType]: undefined,
          },
        }));
        setHasChanges(true);
      }
    }
  };

  const getFilledSlotsCount = (): number => {
    let count = 0;
    for (const day of selectedDays) {
      const dayMeals = mealPlan[day];
      if (dayMeals) {
        if (dayMeals.breakfast?.recipe) count++;
        if (dayMeals.lunch?.recipe) count++;
        if (dayMeals.dinner?.recipe) count++;
      }
    }
    return count;
  };

  const getTotalSlotsCount = (): number => {
    return selectedDays.length * 3;
  };

  const convertToApiFormat = (): Record<string, Record<string, any>> => {
    const mealsForApi: Record<string, Record<string, any>> = {};

    for (const day of selectedDays) {
      const dayMeals = mealPlan[day];
      if (!dayMeals) continue;

      mealsForApi[day] = {};

      if (dayMeals.breakfast?.recipe) {
        mealsForApi[day].breakfast = {
          recipe_id: dayMeals.breakfast.recipe.id,
          is_repeat: dayMeals.breakfast.isRepeat || false,
        };
      }
      if (dayMeals.lunch?.recipe) {
        mealsForApi[day].lunch = {
          recipe_id: dayMeals.lunch.recipe.id,
          is_repeat: dayMeals.lunch.isRepeat || false,
        };
      }
      if (dayMeals.dinner?.recipe) {
        mealsForApi[day].dinner = {
          recipe_id: dayMeals.dinner.recipe.id,
          is_repeat: dayMeals.dinner.isRepeat || false,
        };
      }
    }

    return mealsForApi;
  };

  const getStartDate = (): string => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    return monday.toISOString().split('T')[0];
  };

  const handleSaveInternal = async () => {
    const mealsForApi = convertToApiFormat();

    if (isEditMode) {
      await mealPlanService.updateMealPlanMeals(existingMealPlan.id, mealsForApi);
    } else {
      const startDate = getStartDate();
      await mealPlanService.createManualMealPlan(startDate, selectedDays, mealsForApi);
    }
  };

  const handleSave = async () => {
    if (!isEditMode) {
      const filledCount = getFilledSlotsCount();
      if (filledCount === 0) {
        Alert.alert(
          'Empty Plan',
          'You haven\'t added any meals yet. Add some meals or use "Fill AI".',
        );
        return;
      }
    }

    setSaving(true);
    try {
      await handleSaveInternal();
      Alert.alert('Success', isEditMode ? 'Meal plan updated!' : 'Meal plan created!', [
        { text: 'OK', onPress: () => navigation.navigate('MealPlanMain') }
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save meal plan');
    } finally {
      setSaving(false);
    }
  };

  const handleFillWithAI = async () => {
    const filledCount = getFilledSlotsCount();
    const totalCount = getTotalSlotsCount();
    const emptyCount = totalCount - filledCount;

    if (emptyCount === 0) {
      Alert.alert('All Filled', 'All meal slots are already filled!');
      return;
    }

    Alert.alert(
      'Fill with AI',
      `AI will generate recipes for ${emptyCount} empty slot${emptyCount > 1 ? 's' : ''}. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Fill',
          onPress: async () => {
            setFillingWithAI(true);
            try {
              if (isEditMode) {
                await handleSaveInternal();
                await mealPlanService.fillRemainingWithAI(existingMealPlan.id);
              } else {
                const startDate = getStartDate();
                const mealsForApi = convertToApiFormat();
                const createdPlan = await mealPlanService.createManualMealPlan(
                  startDate,
                  selectedDays,
                  mealsForApi
                );
                await mealPlanService.fillRemainingWithAI(createdPlan.id);
              }

              Alert.alert('Success', 'Empty slots have been filled with AI-generated recipes!', [
                { text: 'OK', onPress: () => navigation.navigate('MealPlanMain') }
              ]);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to fill with AI');
            } finally {
              setFillingWithAI(false);
            }
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    if (hasChanges) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Building', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const filledCount = getFilledSlotsCount();
  const totalCount = getTotalSlotsCount();
  const canSave = isEditMode ? hasChanges : filledCount > 0;

  if (saving || fillingWithAI) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingFullscreen}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingFullscreenText}>
            {fillingWithAI ? 'AI is filling empty slots...' : 'Saving your meal plan...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Build Mode</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.fillButton, fillingWithAI && styles.fillButtonDisabled]}
            onPress={handleFillWithAI}
            disabled={fillingWithAI}
          >
            <Text style={styles.fillButtonText}>Fill AI</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveHeaderButton, !canSave && styles.saveHeaderButtonDisabled]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={styles.saveHeaderButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress indicator */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(filledCount / totalCount) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>{filledCount} / {totalCount} meals</Text>
      </View>

      {/* Recipe Browser + Selection Bar */}
      <View style={styles.browserSection}>
        <View style={styles.browserContent}>
          {loadingRecipes ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <RecipeBrowser
              recipes={allRecipes}
              selectedRecipe={selectedRecipe}
              onSelectRecipe={handleRecipeSelect}
              onSearchChange={() => {}}
            />
          )}
        </View>
        {selectedRecipe && (
          <View style={styles.selectionBar}>
            <Text style={styles.selectedRecipeName} numberOfLines={1}>
              {selectedRecipe.title}
            </Text>
            <TouchableOpacity
              style={styles.clearSelectionButton}
              onPress={() => setSelectedRecipe(null)}
            >
              <Text style={styles.clearSelectionText}>×</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Meal Grid */}
      <View style={styles.gridSection}>
        <MealGrid
          selectedDays={selectedDays}
          mealPlan={mealPlan}
          onSlotPress={handleSlotPress}
          selectedRecipe={selectedRecipe}
        />
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: colors.primary,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fillButton: {
    backgroundColor: colors.textMuted + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  fillButtonDisabled: {
    opacity: 0.6,
  },
  fillButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  saveHeaderButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  saveHeaderButtonDisabled: {
    opacity: 0.4,
  },
  saveHeaderButtonText: {
    color: colors.buttonText,
    fontSize: 13,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginRight: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  browserSection: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  browserContent: {
    height: 170,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary + '15',
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '30',
  },
  selectedRecipeName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  clearSelectionButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  clearSelectionText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '600',
  },
  gridSection: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  loadingFullscreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingFullscreenText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
});

export default MealPlanEditScreen;
