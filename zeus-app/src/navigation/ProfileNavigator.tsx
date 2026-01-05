import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { MyRecipesScreen } from '../screens/profile/MyRecipesScreen';
import { SettingsScreen } from '../screens/profile/SettingsScreen';
import { EditPreferencesScreen } from '../screens/profile/EditPreferencesScreen';

export type ProfileStackParamList = {
  ProfileMain: undefined;
  MyRecipes: undefined;
  Settings: undefined;
  EditPreferences: undefined;
};

const Stack = createStackNavigator<ProfileStackParamList>();

export const ProfileNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="MyRecipes" component={MyRecipesScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="EditPreferences" component={EditPreferencesScreen} />
    </Stack.Navigator>
  );
};
