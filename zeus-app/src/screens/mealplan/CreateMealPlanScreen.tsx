import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useThemeStore, ThemeColors } from '../../store/themeStore';
import { mealPlanService } from '../../services/mealPlanService';
import { DayOfWeek } from '../../types/mealplan';

interface CreateMealPlanScreenProps {
  navigation: any;
  route: {
    params: {
      selectedDays: DayOfWeek[];
      weekOffset?: number;
    };
  };
}

export const CreateMealPlanScreen: React.FC<CreateMealPlanScreenProps> = ({
  navigation,
  route,
}) => {
  const { selectedDays, weekOffset = 0 } = route.params;
  const [generating, setGenerating] = useState(false);
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  const formatDaysList = (days: DayOfWeek[]): string => {
    if (days.length === 7) return 'Full Week';
    if (days.length === 5 &&
        days.includes('monday') &&
        days.includes('tuesday') &&
        days.includes('wednesday') &&
        days.includes('thursday') &&
        days.includes('friday') &&
        !days.includes('saturday') &&
        !days.includes('sunday')) {
      return 'Weekdays (Mon-Fri)';
    }
    return `${days.length} days`;
  };

  const handleGenerateWithAI = async () => {
    try {
      setGenerating(true);

      // Get the start date (Monday of target week, applying weekOffset)
      const today = new Date();
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      monday.setDate(monday.getDate() + (weekOffset * 7));
      const startDate = monday.toISOString().split('T')[0];

      // Generate meal plan with AI
      const result = await mealPlanService.generateMealPlan(startDate, selectedDays);

      // Navigate back to meal plan screen which will reload with the new plan
      navigation.navigate('MealPlanMain');
    } catch (error: any) {
      console.error('Failed to generate meal plan:', error);
      Alert.alert(
        'Generation Failed',
        error.message || 'Failed to generate meal plan. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleBuildManually = () => {
    navigation.navigate('MealPlanEdit', {
      selectedDays,
      weekOffset,
    });
  };

  if (generating) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingTitle}>Generating Your Meal Plan</Text>
          <Text style={styles.loadingSubtitle}>
            AI is crafting personalized recipes for your {selectedDays.length} days...
          </Text>
          <View style={styles.loadingTips}>
            <Text style={styles.loadingTip}>
              Taking into account your dietary preferences
            </Text>
            <Text style={styles.loadingTip}>
              Using items from your pantry
            </Text>
            <Text style={styles.loadingTip}>
              Optimizing for batch cooking
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Plan</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.content}>
        {/* Summary Badge */}
        <View style={styles.summaryBadge}>
          <Text style={styles.summaryBadgeIcon}>📅</Text>
          <Text style={styles.summaryBadgeText}>{formatDaysList(selectedDays)}</Text>
        </View>

        <Text style={styles.questionTitle}>How do you want to build it?</Text>
        <Text style={styles.questionSubtitle}>
          Choose AI for quick generation, or build manually for full control
        </Text>

        {/* AI Option */}
        <TouchableOpacity
          style={styles.optionCard}
          onPress={handleGenerateWithAI}
          activeOpacity={0.7}
        >
          <View style={styles.optionIconContainer}>
            <Text style={styles.optionIcon}>🤖</Text>
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>Generate with AI</Text>
            <Text style={styles.optionDescription}>
              Automatically create a complete meal plan based on your preferences, pantry items, and nutrition goals
            </Text>
          </View>
          <Text style={styles.optionArrow}>→</Text>
        </TouchableOpacity>

        {/* Manual Option */}
        <TouchableOpacity
          style={styles.optionCard}
          onPress={handleBuildManually}
          activeOpacity={0.7}
        >
          <View style={styles.optionIconContainer}>
            <Text style={styles.optionIcon}>📝</Text>
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>Build Manually</Text>
            <Text style={styles.optionDescription}>
              Browse your recipes and assign them to specific meals. You can always have AI fill in the rest later
            </Text>
          </View>
          <Text style={styles.optionArrow}>→</Text>
        </TouchableOpacity>

        {/* Info Note */}
        <View style={styles.infoNote}>
          <Text style={styles.infoNoteIcon}>💡</Text>
          <Text style={styles.infoNoteText}>
            Building manually? You can use "Fill with AI" anytime to generate meals for empty slots
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  backButton: {
    width: 70,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primary + '15',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 24,
  },
  summaryBadgeIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  summaryBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  questionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  questionSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  optionCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  optionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionIcon: {
    fontSize: 28,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  optionBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: colors.primary,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  optionBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.buttonText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionArrow: {
    fontSize: 20,
    color: colors.textMuted,
    marginLeft: 8,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primary + '10',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  infoNoteIcon: {
    fontSize: 18,
    marginRight: 12,
    marginTop: 2,
  },
  infoNoteText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginTop: 24,
    marginBottom: 8,
  },
  loadingSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  loadingTips: {
    alignItems: 'center',
  },
  loadingTip: {
    fontSize: 14,
    color: colors.textMuted,
    marginVertical: 4,
  },
});
