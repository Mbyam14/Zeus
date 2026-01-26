import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useThemeStore, ThemeColors } from '../../store/themeStore';
import { RecipeBrowser } from '../../components/RecipeBrowser';
import { MealGrid } from '../../components/MealGrid';
import { Recipe } from '../../types/recipe';
import { DayOfWeek, MealType } from '../../types/mealplan';
import { mealPlanService } from '../../services/mealPlanService';

interface MealSlotData {
  recipe?: Recipe;
  isRepeat?: boolean;
  originalDay?: DayOfWeek;
}

interface MealPlanData {
  [day: string]: {
    breakfast?: MealSlotData;
    lunch?: MealSlotData;
    dinner?: MealSlotData;
  };
}

interface ManualMealPlanBuilderProps {
  navigation: any;
  route: {
    params: {
      selectedDays: DayOfWeek[];
    };
  };
}

export const ManualMealPlanBuilder: React.FC<ManualMealPlanBuilderProps> = ({
  navigation,
  route,
}) => {
  const { selectedDays } = route.params;
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [mealPlan, setMealPlan] = useState<MealPlanData>({});
  const [highlightedSlot, setHighlightedSlot] = useState<{ day: DayOfWeek; mealType: MealType } | null>(null);
  const [saving, setSaving] = useState(false);
  const [fillingWithAI, setFillingWithAI] = useState(false);

  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  const handleSelectRecipe = useCallback((recipe: Recipe) => {
    setSelectedRecipe(recipe);
  }, []);

  const handleSlotPress = useCallback((day: DayOfWeek, mealType: MealType) => {
    if (selectedRecipe) {
      // Add recipe to slot
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
      setHighlightedSlot(null);
    } else {
      // Toggle highlight or remove existing meal
      const existingMeal = mealPlan[day]?.[mealType];
      if (existingMeal?.recipe) {
        // Remove meal
        Alert.alert(
          'Remove Meal',
          `Remove "${existingMeal.recipe.title}" from ${day} ${mealType}?`,
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
              },
            },
          ]
        );
      } else {
        // Highlight slot
        setHighlightedSlot({ day, mealType });
      }
    }
  }, [selectedRecipe, mealPlan]);

  const getFilledSlotsCount = (): number => {
    let count = 0;
    for (const day of selectedDays) {
      const dayMeals = mealPlan[day] || {};
      if (dayMeals.breakfast?.recipe) count++;
      if (dayMeals.lunch?.recipe) count++;
      if (dayMeals.dinner?.recipe) count++;
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
              const startDate = getStartDate();
              const mealsForApi = convertMealPlanToApiFormat();

              // First create the meal plan with manual selections
              const createdPlan = await mealPlanService.createManualMealPlan(
                startDate,
                selectedDays,
                mealsForApi
              );

              // Then fill remaining slots with AI
              await mealPlanService.fillRemainingWithAI(createdPlan.id);

              navigation.navigate('MealPlanMain');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to generate meals');
            } finally {
              setFillingWithAI(false);
            }
          },
        },
      ]
    );
  };

  const getStartDate = (): string => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    return monday.toISOString().split('T')[0];
  };

  const convertMealPlanToApiFormat = (): Record<string, Record<string, any>> => {
    const mealsForApi: Record<string, Record<string, any>> = {};

    for (const day of selectedDays) {
      const dayMeals = mealPlan[day] || {};
      mealsForApi[day] = {};

      if (dayMeals.breakfast?.recipe) {
        mealsForApi[day].breakfast = {
          recipe_id: dayMeals.breakfast.recipe.id,
          is_repeat: false,
        };
      }
      if (dayMeals.lunch?.recipe) {
        mealsForApi[day].lunch = {
          recipe_id: dayMeals.lunch.recipe.id,
          is_repeat: false,
        };
      }
      if (dayMeals.dinner?.recipe) {
        mealsForApi[day].dinner = {
          recipe_id: dayMeals.dinner.recipe.id,
          is_repeat: false,
        };
      }
    }

    return mealsForApi;
  };

  const handleSavePlan = async () => {
    const filledCount = getFilledSlotsCount();

    if (filledCount === 0) {
      Alert.alert(
        'Empty Plan',
        'You haven\'t added any meals yet. Add some meals or use "Fill with AI".',
        [{ text: 'OK' }]
      );
      return;
    }

    setSaving(true);
    try {
      const startDate = getStartDate();
      const mealsForApi = convertMealPlanToApiFormat();

      await mealPlanService.createManualMealPlan(startDate, selectedDays, mealsForApi);
      navigation.navigate('MealPlanMain');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save meal plan');
    } finally {
      setSaving(false);
    }
  };

  const filledCount = getFilledSlotsCount();
  const totalCount = getTotalSlotsCount();

  if (saving || fillingWithAI) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Build Meal Plan</Text>
        <TouchableOpacity onPress={handleFillWithAI} style={styles.headerButton}>
          <Text style={styles.headerButtonTextPrimary}>Fill AI</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={100}
      >
        {/* Recipe Browser Section */}
        <View style={styles.browserSection}>
          <Text style={styles.sectionTitle}>Browse Your Recipes</Text>
          <RecipeBrowser
            onSelectRecipe={handleSelectRecipe}
            selectedRecipe={selectedRecipe}
          />
        </View>

        {/* Selection Bar */}
        <View style={styles.selectionBar}>
          {selectedRecipe ? (
            <>
              <View style={styles.selectedRecipeInfo}>
                <Text style={styles.selectedLabel}>Selected:</Text>
                <Text style={styles.selectedTitle} numberOfLines={1}>
                  {selectedRecipe.title}
                </Text>
                {selectedRecipe.calories && (
                  <Text style={styles.selectedMeta}>{selectedRecipe.calories} cal</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.clearSelectionButton}
                onPress={() => setSelectedRecipe(null)}
              >
                <Text style={styles.clearSelectionText}>✕</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.selectionHint}>
              Select a recipe above, then tap slots below to add
            </Text>
          )}
        </View>

        {/* Meal Grid Section */}
        <View style={styles.gridSection}>
          <View style={styles.gridHeader}>
            <Text style={styles.sectionTitle}>Your Meal Plan</Text>
            <Text style={styles.progressText}>
              {filledCount}/{totalCount} meals
            </Text>
          </View>
          <MealGrid
            selectedDays={selectedDays}
            mealPlan={mealPlan}
            onSlotPress={handleSlotPress}
            highlightedSlot={highlightedSlot}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.saveButton,
            filledCount === 0 && styles.saveButtonDisabled,
          ]}
          onPress={handleSavePlan}
          disabled={filledCount === 0}
        >
          <Text style={styles.saveButtonText}>
            Save Plan ({filledCount} meals)
          </Text>
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
  headerButton: {
    minWidth: 60,
  },
  headerButtonText: {
    fontSize: 16,
    color: colors.primary,
  },
  headerButtonTextPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  content: {
    flex: 1,
  },
  browserSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 12,
    backgroundColor: colors.primary + '15',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  selectedRecipeInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  selectedTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  selectedMeta: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  clearSelectionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.textMuted + '30',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  clearSelectionText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  selectionHint: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    flex: 1,
  },
  gridSection: {
    flex: 1,
    paddingHorizontal: 16,
    minHeight: 250,
  },
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  footer: {
    padding: 16,
    paddingBottom: 12,
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    backgroundColor: colors.textMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
});
