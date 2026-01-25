import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { FeedScreen } from '../screens/home/FeedScreen';
import { ProfileNavigator } from './ProfileNavigator';
import { MealPlanScreen } from '../screens/mealplan/MealPlanScreen';
import { CreateScreen } from '../screens/create/CreateScreen';
import { AIScreen } from '../screens/create/AIScreen';
import { PantryScreen } from '../screens/pantry/PantryScreen';
import { ImageReviewScreen } from '../screens/pantry/ImageReviewScreen';
import { RecipeDetailScreen } from '../screens/recipe/RecipeDetailScreen';
import { GroceryListScreen } from '../screens/grocerylist/GroceryListScreen';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetectedPantryItem } from '../types/pantry';

export type CreateStackParamList = {
  CreateMain: undefined;
  AIRecipe: undefined;
  RecipeDetail: { recipe: any };
};

export type MealPlanStackParamList = {
  MealPlanMain: undefined;
  RecipeDetail: { recipe: any };
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
      <CreateStack.Screen name="AIRecipe" component={AIScreen} />
      <CreateStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
    </CreateStack.Navigator>
  );
};

const MealPlanStackNavigator = () => {
  return (
    <MealPlanStack.Navigator screenOptions={{ headerShown: false }}>
      <MealPlanStack.Screen name="MealPlanMain" component={MealPlanScreen} />
      <MealPlanStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
    </MealPlanStack.Navigator>
  );
};

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      initialRouteName="MealPlan"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E1E8ED',
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          height: 70 + Math.max(insets.bottom, 0),
          paddingHorizontal: 8,
        },
        tabBarActiveTintColor: '#FF6B35',
        tabBarInactiveTintColor: '#7F8C8D',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 4,
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
          tabBarIcon: ({ color }) => (
            <View style={[styles.createButton, { borderColor: color }]}>
              <Text style={[styles.createIcon, { color }]}>+</Text>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: 2,
  },
  createIcon: {
    fontSize: 24,
    fontWeight: 'bold',
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