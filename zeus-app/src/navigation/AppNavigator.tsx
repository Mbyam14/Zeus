import React, { useEffect, useCallback, useRef } from 'react';
import { NavigationContainer, NavigationState } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { PreferencesSetupScreen } from '../screens/auth/PreferencesSetupScreen';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';
import { mealPlanService } from '../services/mealPlanService';
import { pantryService } from '../services/pantryService';
import { recipeService } from '../services/recipeService';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

const SetupStack = createStackNavigator();

/** Extract the deepest active route from navigation state */
function getActiveRoute(state: NavigationState | Partial<NavigationState>): any {
  if (!state?.routes) return null;
  const route = state.routes[state.index ?? 0];
  if (route?.state) return getActiveRoute(route.state as NavigationState);
  return route;
}

export const AppNavigator: React.FC = () => {
  const { isAuthenticated, isLoading, hasCompletedSetup, checkAuthStatus } = useAuthStore();
  const chatHydrated = useRef(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Hydrate chat store once when authenticated
  useEffect(() => {
    if (isAuthenticated && hasCompletedSetup && !chatHydrated.current) {
      chatHydrated.current = true;
      useChatStore.persist.rehydrate();
    }
  }, [isAuthenticated, hasCompletedSetup]);

  // Prefetch all tab data in background once authenticated
  useEffect(() => {
    if (!isAuthenticated || !hasCompletedSetup) return;

    const prefetch = async () => {
      const dataStore = useDataStore.getState();

      // Load all in parallel — fire and forget, don't block UI
      const tasks: Promise<void>[] = [];

      if (!dataStore.isFresh('mealPlan')) {
        tasks.push(
          mealPlanService.getCurrentWeekMealPlan().then(plan => {
            if (plan) useDataStore.getState().setMealPlan(plan);
          }).catch(() => {})
        );
      }

      if (!dataStore.isFresh('pantry')) {
        tasks.push(
          pantryService.getPantryItems().then(items => {
            useDataStore.getState().setPantryItems(items);
          }).catch(() => {})
        );
      }

      // Prefetch recipe feed (first page) silently
      tasks.push(
        recipeService.getAllRecipes(20, 0).then(() => {}).catch(() => {})
      );

      await Promise.allSettled(tasks);
    };

    prefetch();
  }, [isAuthenticated, hasCompletedSetup]);

  // Track screen changes via NavigationContainer callback
  const handleStateChange = useCallback((state: NavigationState | undefined) => {
    if (!state) return;
    const route = getActiveRoute(state);
    if (!route) return;

    const context: any = { screen: route.name };
    if (route.name === 'RecipeDetail' && route.params?.recipe) {
      context.recipe_id = route.params.recipe.id;
      context.recipe_title = route.params.recipe.title;
    }
    useChatStore.getState().setScreenContext(context);
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingTitle}>Zeus</Text>
        <ActivityIndicator size="large" color="#FF6B35" style={styles.spinner} />
        <Text style={styles.loadingText}>Loading your culinary journey...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer onStateChange={handleStateChange}>
      {!isAuthenticated ? (
        <AuthNavigator />
      ) : !hasCompletedSetup ? (
        <SetupStack.Navigator screenOptions={{ headerShown: false }}>
          <SetupStack.Screen name="PreferencesSetup" component={PreferencesSetupScreen} />
        </SetupStack.Navigator>
      ) : (
        <MainTabNavigator />
      )}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingTitle: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FF6B35',
    marginBottom: 32,
  },
  spinner: {
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#7F8C8D',
  },
});