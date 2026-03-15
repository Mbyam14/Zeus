import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useThemeStore, ThemeColors } from '../../store/themeStore';

interface DaySelectionScreenProps {
  navigation: any;
  route: {
    params?: {
      weekOffset?: number;
    };
  };
}

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

interface DayInfo {
  key: DayOfWeek;
  label: string;
  shortLabel: string;
}

const DAYS: DayInfo[] = [
  { key: 'monday', label: 'Monday', shortLabel: 'Mon' },
  { key: 'tuesday', label: 'Tuesday', shortLabel: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', shortLabel: 'Wed' },
  { key: 'thursday', label: 'Thursday', shortLabel: 'Thu' },
  { key: 'friday', label: 'Friday', shortLabel: 'Fri' },
  { key: 'saturday', label: 'Saturday', shortLabel: 'Sat' },
  { key: 'sunday', label: 'Sunday', shortLabel: 'Sun' },
];

const WEEKDAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const FULL_WEEK: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const DaySelectionScreen: React.FC<DaySelectionScreenProps> = ({ navigation, route }) => {
  const weekOffset = route.params?.weekOffset ?? 0;
  const [selectedDays, setSelectedDays] = useState<Set<DayOfWeek>>(new Set(FULL_WEEK));
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  const toggleDay = useCallback((day: DayOfWeek) => {
    setSelectedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(day)) {
        // Don't allow deselecting if it's the last day
        if (newSet.size > 1) {
          newSet.delete(day);
        }
      } else {
        newSet.add(day);
      }
      return newSet;
    });
  }, []);

  const selectPreset = useCallback((preset: 'weekdays' | 'fullWeek' | 'custom') => {
    if (preset === 'weekdays') {
      setSelectedDays(new Set(WEEKDAYS));
    } else if (preset === 'fullWeek') {
      setSelectedDays(new Set(FULL_WEEK));
    }
    // 'custom' doesn't change selection, just allows manual toggling
  }, []);

  const handleContinue = () => {
    const orderedDays = DAYS
      .filter(d => selectedDays.has(d.key))
      .map(d => d.key);

    navigation.navigate('CreateMealPlan', {
      selectedDays: orderedDays,
      weekOffset,
    });
  };

  const getPresetStatus = (): 'weekdays' | 'fullWeek' | 'custom' => {
    const selected = Array.from(selectedDays);
    const isWeekdays = WEEKDAYS.every(d => selectedDays.has(d)) &&
                       !selectedDays.has('saturday') &&
                       !selectedDays.has('sunday');
    const isFullWeek = FULL_WEEK.every(d => selectedDays.has(d));

    if (isFullWeek) return 'fullWeek';
    if (isWeekdays) return 'weekdays';
    return 'custom';
  };

  const currentPreset = getPresetStatus();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Days</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.heroSection}>
          <Text style={styles.heroIcon}>📅</Text>
          <Text style={styles.heroTitle}>Plan Your Week</Text>
          <Text style={styles.heroSubtitle}>
            Choose which days to include in your meal plan
          </Text>
        </View>

        {/* Quick Select Buttons */}
        <View style={styles.quickSelectSection}>
          <Text style={styles.sectionLabel}>Quick Select</Text>
          <View style={styles.quickSelectRow}>
            <TouchableOpacity
              style={[
                styles.quickSelectButton,
                currentPreset === 'weekdays' && styles.quickSelectButtonActive,
              ]}
              onPress={() => selectPreset('weekdays')}
            >
              <Text
                style={[
                  styles.quickSelectText,
                  currentPreset === 'weekdays' && styles.quickSelectTextActive,
                ]}
              >
                Weekdays
              </Text>
              <Text style={[
                styles.quickSelectSubtext,
                currentPreset === 'weekdays' && styles.quickSelectSubtextActive,
              ]}>
                Mon - Fri
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickSelectButton,
                currentPreset === 'fullWeek' && styles.quickSelectButtonActive,
              ]}
              onPress={() => selectPreset('fullWeek')}
            >
              <Text
                style={[
                  styles.quickSelectText,
                  currentPreset === 'fullWeek' && styles.quickSelectTextActive,
                ]}
              >
                Full Week
              </Text>
              <Text style={[
                styles.quickSelectSubtext,
                currentPreset === 'fullWeek' && styles.quickSelectSubtextActive,
              ]}>
                All 7 days
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Day Selection Grid */}
        <View style={styles.daySelectionSection}>
          <Text style={styles.sectionLabel}>Or Choose Specific Days</Text>
          <View style={styles.dayGrid}>
            {DAYS.map((day) => {
              const isSelected = selectedDays.has(day.key);
              return (
                <TouchableOpacity
                  key={day.key}
                  style={[
                    styles.dayButton,
                    isSelected && styles.dayButtonSelected,
                  ]}
                  onPress={() => toggleDay(day.key)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.dayCheckbox,
                    isSelected && styles.dayCheckboxSelected,
                  ]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[
                    styles.dayButtonText,
                    isSelected && styles.dayButtonTextSelected,
                  ]}>
                    {day.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

      </ScrollView>

      {/* Continue Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
          <Text style={styles.continueArrow}>→</Text>
        </TouchableOpacity>
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
    width: 60,
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
  },
  contentContainer: {
    padding: 20,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  heroIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  quickSelectSection: {
    marginBottom: 28,
  },
  quickSelectRow: {
    flexDirection: 'row',
    gap: 12,
  },
  quickSelectButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  quickSelectButtonActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  quickSelectText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  quickSelectTextActive: {
    color: colors.primary,
  },
  quickSelectSubtext: {
    fontSize: 13,
    color: colors.textMuted,
  },
  quickSelectSubtextActive: {
    color: colors.primary,
  },
  daySelectionSection: {
    marginBottom: 24,
  },
  dayGrid: {
    gap: 10,
  },
  dayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayButtonSelected: {
    backgroundColor: colors.primary + '10',
    borderColor: colors.primary,
  },
  dayCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCheckboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  dayButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  dayButtonTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    paddingBottom: 16,
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  continueArrow: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
});
