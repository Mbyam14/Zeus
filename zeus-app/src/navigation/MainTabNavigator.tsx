import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FeedScreen } from '../screens/home/FeedScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { MealPlanScreen } from '../screens/mealplan/MealPlanScreen';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Placeholder screens for now

const CreateScreen = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderTitle}>Create Recipe</Text>
    <Text style={styles.placeholderText}>Coming soon!</Text>
  </View>
);

const SocialScreen = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderTitle}>Social</Text>
    <Text style={styles.placeholderText}>Coming soon!</Text>
  </View>
);

export type MainTabParamList = {
  Feed: undefined;
  MealPlan: undefined;
  Create: undefined;
  Social: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
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
        name="Feed" 
        component={FeedScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>🏠</Text>
          ),
        }}
      />
      <Tab.Screen 
        name="MealPlan" 
        component={MealPlanScreen}
        options={{
          tabBarLabel: 'Meal Plan',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>📅</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Create"
        component={CreateScreen}
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
        name="Social" 
        component={SocialScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>👥</Text>
          ),
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
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