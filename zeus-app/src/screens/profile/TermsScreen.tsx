import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore } from '../../store/themeStore';

export const TermsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useThemeStore();

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.lastUpdated}>Last Updated: January 2026</Text>

        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>
          By downloading, installing, or using the Zeus application ("App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the App.
        </Text>

        <Text style={styles.sectionTitle}>2. Description of Service</Text>
        <Text style={styles.paragraph}>
          Zeus is a meal planning application that uses artificial intelligence to generate personalized recipes and meal plans based on your dietary preferences, available ingredients, and nutritional goals.
        </Text>

        <Text style={styles.sectionTitle}>3. User Accounts</Text>
        <Text style={styles.paragraph}>
          To access certain features of the App, you must create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
        </Text>
        <Text style={styles.paragraph}>
          You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate, current, and complete.
        </Text>

        <Text style={styles.sectionTitle}>4. User Content</Text>
        <Text style={styles.paragraph}>
          You retain ownership of any content you submit to the App, including recipes, reviews, and preferences. By submitting content, you grant Zeus a non-exclusive, worldwide, royalty-free license to use, display, and distribute such content in connection with the App.
        </Text>

        <Text style={styles.sectionTitle}>5. AI-Generated Content</Text>
        <Text style={styles.paragraph}>
          The App uses artificial intelligence to generate recipes and meal plans. While we strive for accuracy, AI-generated content may contain errors or inaccuracies. You should always verify nutritional information, ingredient safety, and cooking instructions independently.
        </Text>
        <Text style={styles.paragraph}>
          Zeus is not responsible for any adverse reactions, allergies, or health issues that may result from following AI-generated recipes. Users with food allergies or medical dietary requirements should consult healthcare professionals.
        </Text>

        <Text style={styles.sectionTitle}>6. Prohibited Conduct</Text>
        <Text style={styles.paragraph}>
          You agree not to:{'\n'}
          • Use the App for any unlawful purpose{'\n'}
          • Interfere with or disrupt the App or servers{'\n'}
          • Attempt to gain unauthorized access to any portion of the App{'\n'}
          • Use automated means to access the App without permission{'\n'}
          • Share your account credentials with others
        </Text>

        <Text style={styles.sectionTitle}>7. Intellectual Property</Text>
        <Text style={styles.paragraph}>
          The App and its original content, features, and functionality are owned by Zeus and are protected by international copyright, trademark, and other intellectual property laws.
        </Text>

        <Text style={styles.sectionTitle}>8. Disclaimer of Warranties</Text>
        <Text style={styles.paragraph}>
          THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. ZEUS DOES NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
        </Text>

        <Text style={styles.sectionTitle}>9. Limitation of Liability</Text>
        <Text style={styles.paragraph}>
          IN NO EVENT SHALL ZEUS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE APP.
        </Text>

        <Text style={styles.sectionTitle}>10. Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We reserve the right to modify these Terms at any time. We will notify you of any changes by posting the new Terms on this page and updating the "Last Updated" date.
        </Text>

        <Text style={styles.sectionTitle}>11. Contact Us</Text>
        <Text style={styles.paragraph}>
          If you have any questions about these Terms, please contact us at:{'\n\n'}
          Email: legal@zeusapp.com{'\n'}
          Address: Zeus App Inc.
        </Text>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backButtonText: {
      fontSize: 28,
      color: colors.text,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    scrollView: {
      flex: 1,
    },
    contentContainer: {
      padding: 24,
    },
    lastUpdated: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 24,
      fontStyle: 'italic',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginTop: 24,
      marginBottom: 12,
    },
    paragraph: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 24,
      marginBottom: 12,
    },
    bottomSpacer: {
      height: 40,
    },
  });
