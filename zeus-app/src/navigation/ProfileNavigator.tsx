import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { EditPreferencesScreen } from '../screens/profile/EditPreferencesScreen';
import { ThemeScreen } from '../screens/profile/ThemeScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { HelpSupportScreen } from '../screens/profile/HelpSupportScreen';
import { TermsScreen } from '../screens/profile/TermsScreen';
import { PrivacyPolicyScreen } from '../screens/profile/PrivacyPolicyScreen';
import { NotificationsScreen } from '../screens/profile/NotificationsScreen';
import { BodyStatsScreen } from '../screens/profile/BodyStatsScreen';
import { AllergiesScreen } from '../screens/profile/AllergiesScreen';

export type ProfileStackParamList = {
  ProfileMain: undefined;
  EditPreferences: undefined;
  Theme: undefined;
  EditProfile: undefined;
  HelpSupport: undefined;
  Terms: undefined;
  PrivacyPolicy: undefined;
  Notifications: undefined;
  BodyStats: undefined;
  Allergies: undefined;
};

const Stack = createStackNavigator<ProfileStackParamList>();

export const ProfileNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="EditPreferences" component={EditPreferencesScreen} />
      <Stack.Screen name="Theme" component={ThemeScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="BodyStats" component={BodyStatsScreen} />
      <Stack.Screen name="Allergies" component={AllergiesScreen} />
    </Stack.Navigator>
  );
};
