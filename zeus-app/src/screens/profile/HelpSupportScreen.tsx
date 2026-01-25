import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeStore } from '../../store/themeStore';

const FAQ_ITEMS = [
  {
    question: 'How do I generate a meal plan?',
    answer: 'Go to the Meal Plan tab and tap "Generate New Plan". Select your preferences and the AI will create a personalized weekly meal plan for you.',
  },
  {
    question: 'How do I add items to my pantry?',
    answer: 'Navigate to the Pantry tab and tap the "+" button. You can manually enter items or scan barcodes to quickly add products.',
  },
  {
    question: 'Can I customize recipes?',
    answer: 'Yes! When viewing a recipe, you can regenerate individual meals, adjust serving sizes, and save modified versions to your collection.',
  },
  {
    question: 'How do I set dietary restrictions?',
    answer: 'Go to Profile > Meal Preferences. Here you can set dietary restrictions, allergies, cuisine preferences, and nutrition goals.',
  },
  {
    question: 'Is my data secure?',
    answer: 'Yes, we use industry-standard encryption to protect your data. Your personal information is never shared with third parties without your consent.',
  },
];

export const HelpSupportScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useThemeStore();
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@zeusapp.com?subject=Zeus App Support Request').catch(() => {
      Alert.alert('Error', 'Could not open email client. Please contact us at support@zeusapp.com');
    });
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Contact Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CONTACT US</Text>
          <TouchableOpacity style={styles.contactCard} onPress={handleContactSupport}>
            <View style={styles.contactLeft}>
              <Text style={styles.contactIcon}>📧</Text>
              <View>
                <Text style={styles.contactTitle}>Email Support</Text>
                <Text style={styles.contactSubtitle}>support@zeusapp.com</Text>
              </View>
            </View>
            <Text style={styles.contactArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* FAQ Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FREQUENTLY ASKED QUESTIONS</Text>
          <View style={styles.faqContainer}>
            {FAQ_ITEMS.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.faqItem,
                  index === FAQ_ITEMS.length - 1 && styles.faqItemLast,
                ]}
                onPress={() => setExpandedIndex(expandedIndex === index ? null : index)}
              >
                <View style={styles.faqQuestion}>
                  <Text style={styles.faqQuestionText}>{item.question}</Text>
                  <Text style={styles.faqArrow}>
                    {expandedIndex === index ? '−' : '+'}
                  </Text>
                </View>
                {expandedIndex === index && (
                  <Text style={styles.faqAnswer}>{item.answer}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appVersion}>Zeus v1.0.0</Text>
          <Text style={styles.appCopyright}>© 2026 Zeus App. All rights reserved.</Text>
        </View>
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
    section: {
      marginTop: 24,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
      marginBottom: 8,
      marginLeft: 24,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    contactCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.backgroundSecondary,
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    contactLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    contactIcon: {
      fontSize: 32,
      marginRight: 16,
    },
    contactTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 2,
    },
    contactSubtitle: {
      fontSize: 14,
      color: colors.textMuted,
    },
    contactArrow: {
      fontSize: 28,
      color: colors.textMuted,
    },
    faqContainer: {
      backgroundColor: colors.backgroundSecondary,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    faqItem: {
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    faqItemLast: {
      borderBottomWidth: 0,
    },
    faqQuestion: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    faqQuestionText: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
      flex: 1,
      paddingRight: 16,
    },
    faqArrow: {
      fontSize: 24,
      color: colors.primary,
      fontWeight: '300',
    },
    faqAnswer: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 12,
      lineHeight: 22,
    },
    appInfo: {
      alignItems: 'center',
      paddingVertical: 32,
    },
    appVersion: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 4,
    },
    appCopyright: {
      fontSize: 12,
      color: colors.textMuted,
    },
  });
