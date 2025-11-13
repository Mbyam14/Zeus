import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { useAuthStore } from '../store/authStore';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

export const AppNavigator: React.FC = () => {
  // AUTHENTICATION DISABLED FOR TESTING
  // const { isAuthenticated, isLoading, checkAuthStatus } = useAuthStore();

  // useEffect(() => {
  //   checkAuthStatus();
  // }, []);

  // if (isLoading) {
  //   return (
  //     <View style={styles.loadingContainer}>
  //       <Text style={styles.loadingTitle}>Zeus</Text>
  //       <ActivityIndicator size="large" color="#FF6B35" style={styles.spinner} />
  //       <Text style={styles.loadingText}>Loading your culinary journey...</Text>
  //     </View>
  //   );
  // }

  return (
    <NavigationContainer>
      <MainTabNavigator />
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