import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { FeedScreen } from '../screens/home/FeedScreen';
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
import { GroceryListScreen } from '../screens/grocerylist/GroceryListScreen';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetectedPantryItem } from '../types/pantry';
import { useThemeStore } from '../store/themeStore';

export type CreateStackParamList = {
  CreateMain: undefined;
  RecipeDetail: { recipe: any };
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
  Create: undefined;
  GroceryList: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const CreateStack = createStackNavigator<CreateStackParamList>();
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

const CreateStackNavigator = () => {
  return (
    <CreateStack.Navigator screenOptions={{ headerShown: false }}>
      <CreateStack.Screen name="CreateMain" component={CreateScreen} />
      <CreateStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
    </CreateStack.Navigator>
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
        name="Create"
        component={CreateStackNavigator}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => (
            <View style={[styles.createButton, { backgroundColor: focused ? colors.primary : colors.primary + 'DD' }]}>
              <Text style={styles.createIcon}>+</Text>
            </View>
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
  createButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -8,
  },
  createIcon: {
    fontSize: 28,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 16,
    color: '#7F8C8D',
  },
});