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

interface MealPlanEditScreenProps {
  navigation: any;
  route: {
    params: {
      mealPlan: MealPlan;
      recipes: Record<string, Recipe>;
    };
  };
}

export const MealPlanEditScreen: React.FC<MealPlanEditScreenProps> = ({ navigation, route }) => {
  const { colors } = useThemeStore();
  const styles = createStyles(colors);
  const { mealPlan: initialMealPlan, recipes: initialRecipes } = route.params;

  // Get selected days from meal plan or default to all 7
  const selectedDays: DayOfWeek[] = initialMealPlan.selected_days ||
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  // Convert initial meal plan to MealAssignment format
  const convertToAssignments = (): Record<DayOfWeek, Record<MealType, MealAssignment | undefined>> => {
    const assignments: Record<DayOfWeek, Record<MealType, MealAssignment | undefined>> = {} as any;

    for (const day of selectedDays) {
      assignments[day] = {
        breakfast: undefined,
        lunch: undefined,
        dinner: undefined,
        snack: undefined,
      };

      const dayMeals = initialMealPlan.meals[day];
      if (dayMeals) {
        const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];
        for (const mealType of mealTypes) {
          const slot = dayMeals[mealType];
          const recipeId = getRecipeIdFromSlot(slot);
          if (recipeId && initialRecipes[recipeId]) {
            assignments[day][mealType] = {
              recipe: initialRecipes[recipeId],
              isRepeat: typeof slot === 'object' && slot.is_repeat === true,
            };
          }
        }
      }
    }

    return assignments;
  };

  const [mealPlan, setMealPlan] = useState<Record<DayOfWeek, Record<MealType, MealAssignment | undefined>>>(
    convertToAssignments()
  );
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [fillingWithAI, setFillingWithAI] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [loadingRecipes, setLoadingRecipes] = useState(true);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      setLoadingRecipes(true);
      const recipes = await recipeService.getAllRecipes();
      setAllRecipes(recipes);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoadingRecipes(false);
    }
  };

  const handleRecipeSelect = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
  };

  const handleSlotPress = (day: DayOfWeek, mealType: MealType) => {
    if (selectedRecipe) {
      // Assign selected recipe to this slot
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
      // Keep recipe selected for batch assignment
    } else {
      // If no recipe selected and slot has a recipe, remove it
      const currentAssignment = mealPlan[day]?.[mealType];
      if (currentAssignment?.recipe) {
        Alert.alert(
          'Remove Meal',
          `Remove ${currentAssignment.recipe.title} from this slot?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () => {
                setMealPlan(prev => ({
                  ...prev,
                  [day]: {
                    ...prev[day],
                    [mealType]: undefined,
                  },
                }));
                setHasChanges(true);
              },
            },
          ]
        );
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
    return selectedDays.length * 3; // 3 meals per day
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
              // First save current changes
              await handleSaveInternal();

              // Then fill remaining slots with AI
              await mealPlanService.fillRemainingWithAI(initialMealPlan.id);

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

  const handleSaveInternal = async () => {
    const mealsForApi = convertToApiFormat();
    await mealPlanService.updateMealPlanMeals(initialMealPlan.id, mealsForApi);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await handleSaveInternal();
      Alert.alert('Success', 'Meal plan updated successfully!', [
        { text: 'OK', onPress: () => navigation.navigate('MealPlanMain') }
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save meal plan');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const filledCount = getFilledSlotsCount();
  const totalCount = getTotalSlotsCount();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Plan</Text>
        <TouchableOpacity
          style={[styles.fillButton, fillingWithAI && styles.fillButtonDisabled]}
          onPress={handleFillWithAI}
          disabled={fillingWithAI}
        >
          {fillingWithAI ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.fillButtonText}>Fill AI</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Progress indicator */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(filledCount / totalCount) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>{filledCount} / {totalCount} meals</Text>
      </View>

      {/* Recipe Browser */}
      <View style={styles.browserSection}>
        {loadingRecipes ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Loading recipes...</Text>
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

      {/* Selection Bar - only show when a recipe is selected */}
      {selectedRecipe && (
        <View style={styles.selectionBar}>
          <View style={styles.selectedRecipeInfo}>
            <Text style={styles.selectedRecipeLabel}>Selected:</Text>
            <Text style={styles.selectedRecipeName} numberOfLines={1}>
              {selectedRecipe.title}
            </Text>
            {selectedRecipe.calories && (
              <Text style={styles.selectedRecipeCalories}>
                {selectedRecipe.calories} cal
              </Text>
            )}
            <TouchableOpacity
              style={styles.clearSelectionButton}
              onPress={() => setSelectedRecipe(null)}
            >
              <Text style={styles.clearSelectionText}>×</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Meal Grid */}
      <View style={styles.gridSection}>
        <MealGrid
          selectedDays={selectedDays}
          mealPlan={mealPlan}
          onSlotPress={handleSlotPress}
          selectedRecipe={selectedRecipe}
        />
      </View>

      {/* Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, (!hasChanges || saving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!hasChanges || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  backButton: {
    paddingVertical: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  fillButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  fillButtonDisabled: {
    opacity: 0.6,
  },
  fillButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    marginRight: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  browserSection: {
    height: 240,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textMuted,
  },
  selectionBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 50,
    justifyContent: 'center',
  },
  selectedRecipeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedRecipeLabel: {
    fontSize: 13,
    color: colors.textMuted,
    marginRight: 8,
  },
  selectedRecipeName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  selectedRecipeCalories: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
    marginLeft: 8,
  },
  clearSelectionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  clearSelectionText: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: '600',
  },
  selectionHint: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  gridSection: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  footer: {
    padding: 16,
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});

export default MealPlanEditScreen;
