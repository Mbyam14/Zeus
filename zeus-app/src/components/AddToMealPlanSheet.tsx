import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Recipe, DayOfWeek, MealType } from '../types/mealplan';
import { mealPlanService } from '../services/mealPlanService';
import { groceryListService } from '../services/groceryListService';
import { useThemeStore } from '../store/themeStore';
import { useDataStore } from '../store/dataStore';
import { getMondayDateString } from '../utils/dateHelpers';

interface AddToMealPlanSheetProps {
  visible: boolean;
  recipe: Recipe;
  onClose: () => void;
  onAdded: (day: DayOfWeek, slot: MealType) => void;
  initialDay?: DayOfWeek;
  initialSlot?: MealType;
}

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
];

const SLOTS: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];

const todayKey = (): DayOfWeek => {
  const idx = new Date().getDay();
  const map: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return map[idx];
};

export const AddToMealPlanSheet: React.FC<AddToMealPlanSheetProps> = ({
  visible,
  recipe,
  onClose,
  onAdded,
  initialDay,
  initialSlot,
}) => {
  const { colors } = useThemeStore();
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(initialDay ?? todayKey());
  const [selectedSlot, setSelectedSlot] = useState<MealType>(initialSlot ?? 'dinner');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed defaults when the caller passes new initial values (e.g., Home re-opens for a different slot)
  React.useEffect(() => {
    if (visible) {
      setSelectedDay(initialDay ?? todayKey());
      setSelectedSlot(initialSlot ?? 'dinner');
    }
  }, [visible, initialDay, initialSlot]);

  const reset = () => {
    setSubmitting(false);
    setError(null);
    setSelectedDay(initialDay ?? todayKey());
    setSelectedSlot(initialSlot ?? 'dinner');
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleAdd = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const plan = await mealPlanService.getCurrentWeekMealPlan();
      const slotData = { recipe_id: recipe.id };

      let updatedPlan;
      if (!plan) {
        updatedPlan = await mealPlanService.createManualMealPlan(
          getMondayDateString(0),
          [selectedDay],
          { [selectedDay]: { [selectedSlot]: slotData } }
        );
      } else {
        const existingDay = (plan.meals as any)[selectedDay] || {};
        const nextMeals = {
          ...plan.meals,
          [selectedDay]: { ...existingDay, [selectedSlot]: slotData },
        };
        updatedPlan = await mealPlanService.updateMealPlanMeals(plan.id, nextMeals);
      }

      // Regenerate grocery list in the background; meal plan update is the source of truth.
      groceryListService.generateGroceryList(updatedPlan.id).catch(() => {});

      useDataStore.getState().setMealPlan(updatedPlan);

      onAdded(selectedDay, selectedSlot);
      reset();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not add to meal plan. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>Add to meal plan</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {recipe.title}
          </Text>

          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Day</Text>
          <View style={styles.chipRow}>
            {DAYS.map((d) => {
              const active = d.key === selectedDay;
              return (
                <TouchableOpacity
                  key={d.key}
                  onPress={() => setSelectedDay(d.key)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.background,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, { color: active ? '#FFF' : colors.text }]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 16 }]}>Meal</Text>
          <View style={styles.chipRow}>
            {SLOTS.map((s) => {
              const active = s.key === selectedSlot;
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => setSelectedSlot(s.key)}
                  style={[
                    styles.slotChip,
                    {
                      backgroundColor: active ? colors.primary : colors.background,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, { color: active ? '#FFF' : colors.text }]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {error && <Text style={[styles.errorText, { color: colors.error || '#FF3B30' }]}>{error}</Text>}

          <TouchableOpacity
            style={[
              styles.addBtn,
              { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 },
            ]}
            onPress={handleAdd}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.addBtnText}>Add to plan</Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 52,
    alignItems: 'center',
  },
  slotChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    flexGrow: 1,
    alignItems: 'center',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  addBtn: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AddToMealPlanSheet;
