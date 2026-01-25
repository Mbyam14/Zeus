import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { PreferencesSetupScreen } from '../screens/auth/PreferencesSetupScreen';
import { useAuthStore } from '../store/authStore';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

const SetupStack = createStackNavigator();

export const AppNavigator: React.FC = () => {
  const { isAuthenticated, isLoading, hasCompletedSetup, checkAuthStatus } = useAuthStore();

  useEffect(() => {
    checkAuthStatus();
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
    <NavigationContainer>
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