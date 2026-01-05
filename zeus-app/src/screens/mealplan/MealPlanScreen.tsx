import React, { useState, useEffect } from 'react';
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
import { MealPlan, Recipe, DayOfWeek, MealType } from '../../types/mealplan';

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

  useEffect(() => {
    loadMealPlan();
  }, []);

  const loadMealPlan = async () => {
    try {
      setLoading(true);
      console.log('📱 Loading current meal plan...');
      const plan = await mealPlanService.getCurrentWeekMealPlan();

      if (plan) {
        console.log('✅ Meal plan loaded:', plan.plan_name);
        console.log('📊 Meal plan ID:', plan.id);
        console.log('📅 Has meals data:', Object.keys(plan.meals).length > 0);
        setMealPlan(plan);
        await loadRecipes(plan);

        // Set selected day to first day with meals
        const daysWithMeals = Object.keys(plan.meals) as DayOfWeek[];
        console.log('📅 Days with meals:', daysWithMeals);
        if (daysWithMeals.length > 0) {
          setSelectedDay(daysWithMeals[0]);
        }
      } else {
        console.log('ℹ️ No meal plan found');
      }
    } catch (error) {
      console.error('❌ Failed to load meal plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecipes = async (plan: MealPlan) => {
    console.log('🔍 Loading recipes for meal plan:', plan.id);
    console.log('📅 Meal plan structure:', JSON.stringify(plan.meals, null, 2));

    const recipeMap: { [key: string]: Recipe } = {};
    const recipeIds: string[] = [];

    // Collect all recipe IDs
    Object.values(plan.meals).forEach(dayMeals => {
      if (dayMeals) {
        Object.values(dayMeals).forEach(recipeId => {
          if (recipeId && !recipeIds.includes(recipeId)) {
            recipeIds.push(recipeId);
          }
        });
      }
    });

    console.log('📝 Found recipe IDs:', recipeIds);
    console.log('🔢 Total recipes to load:', recipeIds.length);

    // Load all recipes
    try {
      const loadedRecipes = await mealPlanService.getRecipes(recipeIds);
      console.log('✅ Loaded recipes:', loadedRecipes.length);
      loadedRecipes.forEach(recipe => {
        console.log(`  - ${recipe.title} (${recipe.id})`);
        recipeMap[recipe.id] = recipe;
      });
      setRecipes(recipeMap);
    } catch (error) {
      console.error('❌ Failed to load recipes:', error);
    }
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
              setMealPlan(null);
              setRecipes({});

              // Add a small delay to ensure database has committed
              await new Promise(resolve => setTimeout(resolve, 500));

              // Load the newly generated meal plan
              console.log('🔄 Now fetching current meal plan from API...');
              await loadMealPlan();

              Alert.alert('Success', 'Your meal plan has been generated!');
            } catch (error) {
              console.error('Failed to generate meal plan:', error);
              Alert.alert('Error', 'Failed to generate meal plan. Please try again.');
            } finally {
              setGenerating(false);
            }
          }
        }
      ]
    );
  };

  const handleRegenerateMeal = async (day: DayOfWeek, mealType: MealType) => {
    if (!mealPlan) return;

    try {
      setRegeneratingMeal(`${day}-${mealType}`);
      const newRecipe = await mealPlanService.regenerateMeal(mealPlan.id, day, mealType);

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
      Alert.alert('Error', 'Failed to regenerate meal. Please try again.');
    } finally {
      setRegeneratingMeal(null);
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
                <ActivityIndicator size="small" color="#FF6B35" />
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
          <ActivityIndicator size="large" color="#FF6B35" />
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
              <ActivityIndicator color="#FFFFFF" />
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
          <ActivityIndicator size="large" color="#FF6B35" />
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
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.regenerateAllButtonText}>🔄 New Week</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView>
        {/* Week Day Selector */}
        <View style={styles.calendarContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {daysOfWeek.map(({ day, label, date }) => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayCard,
                  selectedDay === day && styles.dayCardSelected,
                ]}
                onPress={() => setSelectedDay(day)}
              >
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
            ))}
          </ScrollView>
        </View>

        {/* Meals for Selected Day */}
        <View style={styles.mealsContainer}>
          {renderMealCard('breakfast')}
          {renderMealCard('lunch')}
          {renderMealCard('dinner')}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#7F8C8D',
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
    color: '#2C3E50',
    marginBottom: 12,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#7F8C8D',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  generateButton: {
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  regenerateAllButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  regenerateAllButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  calendarContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  dayCard: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    minWidth: 70,
  },
  dayCardSelected: {
    backgroundColor: '#FF6B35',
  },
  dayName: {
    fontSize: 12,
    color: '#7F8C8D',
    marginBottom: 4,
    fontWeight: '600',
  },
  dayNameSelected: {
    color: '#FFFFFF',
  },
  dayDate: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  dayDateSelected: {
    color: '#FFFFFF',
  },
  planIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#004E89',
    marginTop: 4,
  },
  mealsContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  mealCard: {
    backgroundColor: '#FFFFFF',
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
    color: '#2C3E50',
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
    backgroundColor: '#F8F9FA',
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
    color: '#2C3E50',
    marginBottom: 4,
  },
  macroPreview: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  macroText: {
    fontSize: 12,
    color: '#7F8C8D',
  },
  mealSubtext: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '500',
  },
  emptyMeal: {
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E1E8ED',
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  emptyMealText: {
    fontSize: 14,
    color: '#7F8C8D',
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
    backgroundColor: '#FFFFFF',
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
    color: '#2C3E50',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 15,
    color: '#7F8C8D',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  loadingHint: {
    fontSize: 13,
    color: '#FF6B35',
    fontWeight: '600',
    textAlign: 'center',
  },
});
