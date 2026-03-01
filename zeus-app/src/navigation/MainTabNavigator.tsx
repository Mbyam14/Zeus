import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { ProfileNavigator } from './ProfileNavigator';
import { MealPlanScreen } from '../screens/mealplan/MealPlanScreen';
import { MealPlanEditScreen } from '../screens/mealplan/MealPlanEditScreen';
import { DaySelectionScreen } from '../screens/mealplan/DaySelectionScreen';
import { CreateMealPlanScreen } from '../screens/mealplan/CreateMealPlanScreen';
import { ManualMealPlanBuilder } from '../screens/mealplan/ManualMealPlanBuilder';
import { CreateScreen } from '../screens/create/CreateScreen';
import { PantryScreen } from '../screens/pantry/PantryScreen';
import { ImageReviewScreen } from '../screens/pantry/ImageReviewScreen';
import { RecipeDetailScreen } from '../screens/recipe/RecipeDetailScreen';
import { RecipeHubScreen } from '../screens/recipes/RecipeHubScreen';
import { GroceryListScreen } from '../screens/grocerylist/GroceryListScreen';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetectedPantryItem } from '../types/pantry';
import { useThemeStore } from '../store/themeStore';

export type RecipesStackParamList = {
  RecipeHubMain: undefined;
  RecipeDetail: { recipe: any };
  CreateRecipe: undefined;
};

export type MealPlanStackParamList = {
  MealPlanMain: undefined;
  RecipeDetail: { recipe: any };
  MealPlanEdit: { mealPlan: any; recipes: Record<string, any> };
  DaySelection: undefined;
  CreateMealPlan: { selectedDays: string[] };
  ManualMealPlanBuilder: { selectedDays: string[] };
};

export type PantryStackParamList = {
  PantryMain: undefined;
  ImageReview: {
    detectedItems: DetectedPantryItem[];
    imageUri: string;
    analysisNotes?: string;
  };
};

export type MainTabParamList = {
  Pantry: undefined;
  MealPlan: undefined;
  Recipes: undefined;
  GroceryList: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const RecipesStack = createStackNavigator<RecipesStackParamList>();
const MealPlanStack = createStackNavigator<MealPlanStackParamList>();
const PantryStack = createStackNavigator<PantryStackParamList>();

const PantryStackNavigator = () => {
  return (
    <PantryStack.Navigator screenOptions={{ headerShown: false }}>
      <PantryStack.Screen name="PantryMain" component={PantryScreen} />
      <PantryStack.Screen name="ImageReview" component={ImageReviewScreen} />
    </PantryStack.Navigator>
  );
};

const RecipesStackNavigator = () => {
  return (
    <RecipesStack.Navigator screenOptions={{ headerShown: false }}>
      <RecipesStack.Screen name="RecipeHubMain" component={RecipeHubScreen} />
      <RecipesStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
      <RecipesStack.Screen name="CreateRecipe" component={CreateScreen} />
    </RecipesStack.Navigator>
  );
};

const MealPlanStackNavigator = () => {
  return (
    <MealPlanStack.Navigator screenOptions={{ headerShown: false }}>
      <MealPlanStack.Screen name="MealPlanMain" component={MealPlanScreen} />
      <MealPlanStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
      <MealPlanStack.Screen name="MealPlanEdit" component={MealPlanEditScreen} />
      <MealPlanStack.Screen name="DaySelection" component={DaySelectionScreen} />
      <MealPlanStack.Screen name="CreateMealPlan" component={CreateMealPlanScreen} />
      <MealPlanStack.Screen name="ManualMealPlanBuilder" component={ManualMealPlanBuilder} />
    </MealPlanStack.Navigator>
  );
};

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeStore();

  return (
    <Tab.Navigator
      initialRouteName="MealPlan"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBarBackground,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          height: 64 + Math.max(insets.bottom, 0),
          paddingHorizontal: 4,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Pantry"
        component={PantryStackNavigator}
        options={{
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>🥫</Text>
          ),
        }}
      />
      <Tab.Screen
        name="MealPlan"
        component={MealPlanStackNavigator}
        options={{
          tabBarLabel: 'Meal Plan',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>📅</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Recipes"
        component={RecipesStackNavigator}
        options={{
          tabBarLabel: 'Recipes',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>🍳</Text>
          ),
        }}
      />
      <Tab.Screen
        name="GroceryList"
        component={GroceryListScreen}
        options={{
          tabBarLabel: 'Grocery',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>🛒</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>👤</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabIcon: {
    fontSize: 26,
    marginTop: 2,
  },
});
