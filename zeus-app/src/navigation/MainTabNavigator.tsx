import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { ProfileNavigator } from './ProfileNavigator';
import { MealPlanScreen } from '../screens/mealplan/MealPlanScreen';
import { MealPlanEditScreen } from '../screens/mealplan/MealPlanEditScreen';
import { CreateScreen } from '../screens/create/CreateScreen';
import { PantryScreen } from '../screens/pantry/PantryScreen';
import { ImageReviewScreen } from '../screens/pantry/ImageReviewScreen';
import { IngredientSearchScreen } from '../screens/pantry/IngredientSearchScreen';
import { RecipeDetailScreen } from '../screens/recipe/RecipeDetailScreen';
import { RecipeHubScreen } from '../screens/recipes/RecipeHubScreen';
import { GroceryListScreen } from '../screens/grocerylist/GroceryListScreen';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DetectedPantryItem } from '../types/pantry';
import { useThemeStore } from '../store/themeStore';
import { ZeusAIChatBubble } from '../components/ZeusAIChatBubble';
import { ZeusAIChatPanel } from '../components/ZeusAIChatPanel';

export type RecipesStackParamList = {
  RecipeHubMain: undefined;
  RecipeDetail: { recipe: any };
  CreateRecipe: undefined;
};

export type MealPlanStackParamList = {
  MealPlanMain: undefined;
  RecipeDetail: { recipe: any };
  MealPlanEdit: { mealPlan?: any; recipes?: Record<string, any>; selectedDays?: string[]; weekOffset?: number };
};

export type PantryStackParamList = {
  PantryMain: undefined;
  IngredientSearch: undefined;
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
      <PantryStack.Screen name="IngredientSearch" component={IngredientSearchScreen} />
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
    </MealPlanStack.Navigator>
  );
};

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeStore();

  return (
    <View style={{ flex: 1 }}>
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
            height: 60 + Math.max(insets.bottom, 8),
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
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'basket' : 'basket-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="MealPlan"
          component={MealPlanStackNavigator}
          options={{
            tabBarLabel: 'Meal Plan',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Recipes"
          component={RecipesStackNavigator}
          options={{
            tabBarLabel: 'Recipes',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'book' : 'book-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="GroceryList"
          component={GroceryListScreen}
          options={{
            tabBarLabel: 'Grocery',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'cart' : 'cart-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileNavigator}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
      <ZeusAIChatBubble />
      <ZeusAIChatPanel />
    </View>
  );
};
