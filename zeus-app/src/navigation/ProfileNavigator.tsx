import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { LikedRecipesScreen } from '../screens/profile/LikedRecipesScreen';
import { SavedRecipesScreen } from '../screens/profile/SavedRecipesScreen';

export type ProfileStackParamList = {
  ProfileMain: undefined;
  LikedRecipes: undefined;
  SavedRecipes: undefined;
  MyRecipes: undefined;
};

const Stack = createStackNavigator<ProfileStackParamList>();

export const ProfileNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="LikedRecipes" component={LikedRecipesScreen} />
      <Stack.Screen name="SavedRecipes" component={SavedRecipesScreen} />
    </Stack.Navigator>
  );
};
