import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { ProfileNavigator } from './ProfileNavigator';
import { HomeScreen } from '../screens/home/HomeScreen';
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
import { useOnboardingStore } from '../store/onboardingStore';
import { ZeusAIChatBubble } from '../components/ZeusAIChatBubble';
import { ZeusAIChatPanel } from '../components/ZeusAIChatPanel';
import { OnboardingCoachMark } from '../components/OnboardingCoachMark';

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

export type HomeStackParamList = {
  HomeMain: undefined;
  RecipeDetail: { recipe: any };
};

export type MainTabParamList = {
  Home: undefined;
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
const HomeStack = createStackNavigator<HomeStackParamList>();

const HomeStackNavigator = () => {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
    </HomeStack.Navigator>
  );
};

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
      <MealPlanStack.Screen name="MealPlanEdit" component={MealPlanEditScreen as any} />
    </MealPlanStack.Navigator>
  );
};

const COACH_MARKS: Record<string, { tabIndex: number; title: string; message: string } | null> = {
  pantry: {
    tabIndex: 1,
    title: 'Stock your kitchen',
    message: 'Tap Pantry to add what you have at home — Zeus uses it to plan meals around what you already own.',
  },
  meal_plan: {
    tabIndex: 2,
    title: "Let's plan the week",
    message: 'Open Meal Plan to generate a week of meals from your pantry and preferences.',
  },
  grocery: {
    tabIndex: 4,
    title: 'Your shopping list is ready',
    message: "Tap Grocery to see what you'll need this week, cross-referenced with your pantry.",
  },
  complete: null,
};
const TAB_COUNT = 6;

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeStore();
  const isFirstRun = useOnboardingStore((s) => s.isFirstRun);
  const onboardingStep = useOnboardingStore((s) => s.currentStep);
  const dismissed = useOnboardingStore((s) => s.dismissed);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const tabBarHeight = 60 + Math.max(insets.bottom, 8);

  const coachMark = isFirstRun && !dismissed ? COACH_MARKS[onboardingStep] : null;

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        initialRouteName="Home"
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
          name="Home"
          component={HomeStackNavigator}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
            ),
          }}
        />
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
      {coachMark && (
        <OnboardingCoachMark
          visible
          title={coachMark.title}
          message={coachMark.message}
          tabIndex={coachMark.tabIndex}
          tabCount={TAB_COUNT}
          bottomOffset={tabBarHeight}
          onSkipAll={completeOnboarding}
        />
      )}
      <ZeusAIChatBubble />
      <ZeusAIChatPanel />
    </View>
  );
};
