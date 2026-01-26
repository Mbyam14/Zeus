import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useThemeStore, ThemeColors } from '../store/themeStore';
import { Recipe } from '../types/recipe';
import { DayOfWeek, MealType } from '../types/mealplan';

interface MealSlotData {
  recipe?: Recipe;
  isRepeat?: boolean;
  originalDay?: DayOfWeek;
}

interface MealPlanData {
  [day: string]: {
    breakfast?: MealSlotData;
    lunch?: MealSlotData;
    dinner?: MealSlotData;
  };
}

interface MealGridProps {
  selectedDays: DayOfWeek[];
  mealPlan: MealPlanData;
  onSlotPress: (day: DayOfWeek, mealType: MealType) => void;
  highlightedSlot?: { day: DayOfWeek; mealType: MealType } | null;
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'B',
  lunch: 'L',
  dinner: 'D',
  snack: 'S',
};
const MEAL_ICONS: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

export const MealGrid: React.FC<MealGridProps> = ({
  selectedDays,
  mealPlan,
  onSlotPress,
  highlightedSlot,
}) => {
  const { colors } = useThemeStore();
  const styles = createStyles(colors, selectedDays.length);

  const renderSlot = (day: DayOfWeek, mealType: MealType) => {
    const slot = mealPlan[day]?.[mealType];
    const isHighlighted = highlightedSlot?.day === day && highlightedSlot?.mealType === mealType;
    const hasMeal = slot?.recipe;

    return (
      <TouchableOpacity
        key={`${day}-${mealType}`}
        style={[
          styles.slot,
          hasMeal && styles.slotFilled,
          isHighlighted && styles.slotHighlighted,
        ]}
        onPress={() => onSlotPress(day, mealType)}
        activeOpacity={0.7}
      >
        {hasMeal ? (
          <View style={styles.slotContent}>
            <Text style={styles.slotTitle} numberOfLines={2}>
              {slot.recipe!.title}
            </Text>
            {slot.isRepeat && (
              <View style={styles.repeatBadge}>
                <Text style={styles.repeatBadgeText}>↩</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptySlot}>
            <Text style={styles.emptySlotIcon}>+</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.outerContainer}
      contentContainerStyle={styles.outerContent}
      showsVerticalScrollIndicator={true}
      nestedScrollEnabled={true}
    >
      <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled={true}
        >
          <View style={styles.grid}>
            {/* Header Row - Day labels */}
            <View style={styles.headerRow}>
              <View style={styles.mealTypeCell} />
              {selectedDays.map((day) => (
                <View key={day} style={styles.dayHeader}>
                  <Text style={styles.dayHeaderText}>{DAY_LABELS[day]}</Text>
                </View>
              ))}
            </View>

            {/* Meal Rows */}
            {MEAL_TYPES.map((mealType) => (
              <View key={mealType} style={styles.mealRow}>
                <View style={styles.mealTypeCell}>
                  <Text style={styles.mealTypeIcon}>{MEAL_ICONS[mealType]}</Text>
                  <Text style={styles.mealTypeText}>{MEAL_LABELS[mealType]}</Text>
                </View>
                {selectedDays.map((day) => renderSlot(day, mealType))}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
            <Text style={styles.legendText}>Empty</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>Filled</Text>
          </View>
          <View style={styles.legendItem}>
            <Text style={styles.legendIcon}>↩</Text>
            <Text style={styles.legendText}>Repeat</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (colors: ThemeColors, numDays: number) => {
  // Calculate slot width based on number of days
  const slotWidth = Math.max(70, Math.min(90, 340 / numDays));

  return StyleSheet.create({
    outerContainer: {
      flex: 1,
    },
    outerContent: {
      flexGrow: 1,
    },
    container: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 12,
    },
    grid: {
      flexDirection: 'column',
    },
    headerRow: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    mealTypeCell: {
      width: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dayHeader: {
      width: slotWidth,
      paddingVertical: 8,
      marginHorizontal: 3,
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 8,
    },
    dayHeaderText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    mealRow: {
      flexDirection: 'row',
      marginBottom: 6,
    },
    mealTypeIcon: {
      fontSize: 14,
      marginBottom: 2,
    },
    mealTypeText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
    },
    slot: {
      width: slotWidth,
      height: 60,
      marginHorizontal: 3,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: 'dashed',
      overflow: 'hidden',
    },
    slotFilled: {
      borderStyle: 'solid',
      borderColor: colors.primary + '50',
      backgroundColor: colors.primary + '10',
    },
    slotHighlighted: {
      borderColor: colors.primary,
      borderWidth: 3,
      borderStyle: 'solid',
    },
    slotContent: {
      flex: 1,
      padding: 6,
      justifyContent: 'center',
    },
    slotTitle: {
      fontSize: 10,
      fontWeight: '500',
      color: colors.text,
      lineHeight: 13,
    },
    repeatBadge: {
      position: 'absolute',
      top: 2,
      right: 2,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.textMuted,
      justifyContent: 'center',
      alignItems: 'center',
    },
    repeatBadgeText: {
      fontSize: 10,
      color: '#FFFFFF',
    },
    emptySlot: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptySlotIcon: {
      fontSize: 20,
      color: colors.textMuted,
      fontWeight: '300',
    },
    legend: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 12,
      gap: 16,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 6,
    },
    legendIcon: {
      fontSize: 12,
      marginRight: 4,
      color: colors.textMuted,
    },
    legendText: {
      fontSize: 11,
      color: colors.textMuted,
    },
  });
};
