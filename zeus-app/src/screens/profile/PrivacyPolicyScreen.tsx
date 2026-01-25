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

export const PrivacyPolicyScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useThemeStore();

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.lastUpdated}>Last Updated: January 2026</Text>

        <Text style={styles.intro}>
          At Zeus, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application.
        </Text>

        <Text style={styles.sectionTitle}>Information We Collect</Text>

        <Text style={styles.subTitle}>Personal Information</Text>
        <Text style={styles.paragraph}>
          When you create an account, we collect:{'\n'}
          • Email address{'\n'}
          • Username{'\n'}
          • Password (encrypted){'\n'}
          • Profile information you choose to provide
        </Text>

        <Text style={styles.subTitle}>Usage Information</Text>
        <Text style={styles.paragraph}>
          We automatically collect:{'\n'}
          • Device information (type, operating system){'\n'}
          • App usage data and preferences{'\n'}
          • Meal plans and recipes you create or save{'\n'}
          • Pantry inventory data{'\n'}
          • Dietary preferences and restrictions
        </Text>

        <Text style={styles.sectionTitle}>How We Use Your Information</Text>
        <Text style={styles.paragraph}>
          We use your information to:{'\n'}
          • Provide and maintain our service{'\n'}
          • Generate personalized meal plans and recipes{'\n'}
          • Improve and optimize the App{'\n'}
          • Send you updates and notifications (with your consent){'\n'}
          • Respond to your inquiries and support requests{'\n'}
          • Detect and prevent fraud or abuse
        </Text>

        <Text style={styles.sectionTitle}>AI and Data Processing</Text>
        <Text style={styles.paragraph}>
          Zeus uses artificial intelligence to generate personalized content. Your dietary preferences, pantry items, and meal history are processed by AI systems to create customized recommendations. This data is processed securely and is not shared with third parties for advertising purposes.
        </Text>

        <Text style={styles.sectionTitle}>Data Sharing</Text>
        <Text style={styles.paragraph}>
          We do not sell your personal information. We may share data with:{'\n'}
          • Service providers who assist in operating the App{'\n'}
          • Analytics partners to improve our services{'\n'}
          • Law enforcement when required by law{'\n\n'}
          All third-party providers are bound by confidentiality agreements.
        </Text>

        <Text style={styles.sectionTitle}>Data Security</Text>
        <Text style={styles.paragraph}>
          We implement industry-standard security measures including:{'\n'}
          • Encryption of data in transit and at rest{'\n'}
          • Secure authentication systems{'\n'}
          • Regular security audits{'\n'}
          • Access controls and monitoring
        </Text>

        <Text style={styles.sectionTitle}>Your Rights</Text>
        <Text style={styles.paragraph}>
          You have the right to:{'\n'}
          • Access your personal data{'\n'}
          • Correct inaccurate data{'\n'}
          • Delete your account and data{'\n'}
          • Export your data{'\n'}
          • Opt out of marketing communications{'\n\n'}
          To exercise these rights, contact us at privacy@zeusapp.com
        </Text>

        <Text style={styles.sectionTitle}>Data Retention</Text>
        <Text style={styles.paragraph}>
          We retain your data for as long as your account is active or as needed to provide services. If you delete your account, we will delete your personal data within 30 days, except where we are required to retain it by law.
        </Text>

        <Text style={styles.sectionTitle}>Children's Privacy</Text>
        <Text style={styles.paragraph}>
          Zeus is not intended for children under 13. We do not knowingly collect information from children under 13. If you believe we have collected such information, please contact us immediately.
        </Text>

        <Text style={styles.sectionTitle}>Changes to This Policy</Text>
        <Text style={styles.paragraph}>
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last Updated" date.
        </Text>

        <Text style={styles.sectionTitle}>Contact Us</Text>
        <Text style={styles.paragraph}>
          If you have questions about this Privacy Policy, please contact us:{'\n\n'}
          Email: privacy@zeusapp.com{'\n'}
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
      marginBottom: 16,
      fontStyle: 'italic',
    },
    intro: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 24,
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginTop: 24,
      marginBottom: 12,
    },
    subTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
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
