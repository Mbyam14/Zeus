import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { mealPlanService } from '../../services/mealPlanService';
import { groceryListService } from '../../services/groceryListService';
import {
  MealPlan,
  DayOfWeek,
  MealType,
  DEFAULT_MEAL_TYPES,
  getRecipeIdFromSlot,
} from '../../types/mealplan';
import { Recipe } from '../../types/recipe';
import { TabHeader } from '../../components/TabHeader';
import { AddToMealPlanSheet } from '../../components/AddToMealPlanSheet';

const DAY_NAMES: DayOfWeek[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];
const DAY_LABELS: Record<DayOfWeek, string> = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
};

const todayKey = (): DayOfWeek => DAY_NAMES[new Date().getDay()];
const tomorrowKey = (): DayOfWeek => DAY_NAMES[(new Date().getDay() + 1) % 7];

const greeting = (): string => {
  const hr = new Date().getHours();
  if (hr < 12) return 'Good morning';
  if (hr < 17) return 'Good afternoon';
  return 'Good evening';
};

const formatDate = (): string =>
  new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const styles = createStyles(colors);

  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const [needCount, setNeedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerState, setPickerState] = useState<{
    visible: boolean;
    recipe: Recipe | null;
    day: DayOfWeek;
    slot: MealType;
  }>({ visible: false, recipe: null, day: todayKey(), slot: 'dinner' });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedPlan = await mealPlanService.getCurrentWeekMealPlan();
      setPlan(fetchedPlan);

      if (fetchedPlan) {
        const ids = new Set<string>();
        Object.values(fetchedPlan.meals || {}).forEach((day: any) => {
          if (!day) return;
          Object.values(day).forEach((slot: any) => {
            const id = getRecipeIdFromSlot(slot);
            if (id) ids.add(id);
          });
        });

        if (ids.size > 0) {
          const fetched = await mealPlanService.getRecipes(Array.from(ids));
          const map: Record<string, Recipe> = {};
          fetched.forEach((r) => { if (r?.id) map[r.id] = r as unknown as Recipe; });
          setRecipes(map);
        } else {
          setRecipes({});
        }

        try {
          const list = await groceryListService.getGroceryListByMealPlan(fetchedPlan.id);
          if (list && list.items) {
            const missing = list.items.filter((i: any) => !i.already_have && !i.purchased).length;
            setNeedCount(missing);
          } else {
            setNeedCount(null);
          }
        } catch {
          setNeedCount(null);
        }
      } else {
        setRecipes({});
        setNeedCount(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const today = todayKey();
  const tomorrow = tomorrowKey();
  const todayMeals: Record<string, any> = ((plan?.meals as any) || {})[today] || {};
  const tomorrowMeals: Record<string, any> = ((plan?.meals as any) || {})[tomorrow] || {};
  const mealTypes = plan?.meal_types?.length ? plan.meal_types : DEFAULT_MEAL_TYPES;

  const openSlotPicker = (slotKey: MealType, recipe: Recipe | null = null) => {
    // Use a placeholder recipe shape if no existing recipe — AddToMealPlanSheet needs a recipe to commit.
    // For empty slot adds from Home, route to Recipes browse instead.
    if (!recipe) {
      navigation.navigate('Recipes');
      return;
    }
    setPickerState({ visible: true, recipe, day: today, slot: slotKey });
  };

  const renderSlotCard = (slotKey: MealType, label: string) => {
    const slot = todayMeals[slotKey];
    const recipeId = getRecipeIdFromSlot(slot);
    const recipe = recipeId ? recipes[recipeId] : null;

    if (!recipe) {
      return (
        <TouchableOpacity
          key={slotKey}
          style={styles.emptySlot}
          onPress={() => navigation.navigate('Recipes')}
          activeOpacity={0.7}
        >
          <View style={styles.emptySlotIcon}>
            <Ionicons name="add" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.slotLabel}>{label}</Text>
            <Text style={styles.emptySlotText}>Add a recipe</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={slotKey}
        style={styles.slotCard}
        onPress={() => navigation.navigate('RecipeDetail', { recipe })}
        activeOpacity={0.85}
      >
        {recipe.image_url ? (
          <Image source={{ uri: recipe.image_url }} style={styles.slotImage} />
        ) : (
          <View style={[styles.slotImage, { backgroundColor: colors.background }]}>
            <Ionicons name="restaurant-outline" size={22} color={colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.slotLabel}>{label}</Text>
          <Text style={styles.slotTitle} numberOfLines={2}>{recipe.title}</Text>
        </View>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); openSlotPicker(slotKey, recipe); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.slotEditBtn}
        >
          <Ionicons name="swap-horizontal" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const tomorrowSummary = (): string => {
    const ids = mealTypes
      .map((mt) => getRecipeIdFromSlot(tomorrowMeals[mt.key]))
      .filter(Boolean) as string[];
    if (!ids.length) return 'Nothing planned';
    const titles = ids.map((id) => recipes[id]?.title).filter(Boolean) as string[];
    return titles.slice(0, 2).join(', ') + (titles.length > 2 ? '…' : '');
  };

  return (
    <View style={styles.container}>
      <TabHeader title="Today" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>
            {greeting()}{user?.username ? `, ${user.username}` : ''}
          </Text>
          <Text style={styles.date}>{formatDate()}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Today's meals</Text>
          {loading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.slotList}>
              {mealTypes
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((mt) => renderSlotCard(mt.key, mt.label))}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.tomorrowCard}
          onPress={() => navigation.navigate('MealPlan')}
          activeOpacity={0.85}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.tomorrowLabel}>{DAY_LABELS[tomorrow]} preview</Text>
            <Text style={styles.tomorrowText} numberOfLines={1}>
              {loading ? '…' : tomorrowSummary()}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.groceryPill}
          onPress={() => navigation.navigate('GroceryList')}
          activeOpacity={0.85}
        >
          <Ionicons name="cart" size={20} color={colors.primary} />
          <Text style={styles.groceryText}>
            {needCount === null
              ? 'No grocery list yet'
              : needCount === 0
                ? 'Grocery list up to date'
                : `${needCount} item${needCount === 1 ? '' : 's'} needed`}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.navigate('MealPlan')}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={22} color={colors.primary} />
            <Text style={styles.quickActionText}>Plan week</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.navigate('Recipes')}
            activeOpacity={0.7}
          >
            <Ionicons name="book-outline" size={22} color={colors.primary} />
            <Text style={styles.quickActionText}>Browse recipes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.navigate('Pantry')}
            activeOpacity={0.7}
          >
            <Ionicons name="basket-outline" size={22} color={colors.primary} />
            <Text style={styles.quickActionText}>Add to pantry</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {pickerState.recipe && (
        <AddToMealPlanSheet
          visible={pickerState.visible}
          recipe={pickerState.recipe}
          initialDay={pickerState.day}
          initialSlot={pickerState.slot}
          onClose={() => setPickerState((s) => ({ ...s, visible: false }))}
          onAdded={() => {
            setPickerState((s) => ({ ...s, visible: false }));
            loadAll();
          }}
        />
      )}
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 20, paddingBottom: 40 },
    greetingBlock: { marginBottom: 24 },
    greeting: { fontSize: 22, fontWeight: '700', color: colors.text },
    date: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
    section: { marginBottom: 20 },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 10,
    },
    loadingBlock: { paddingVertical: 24, alignItems: 'center' },
    slotList: { gap: 10 },
    slotCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 14,
      padding: 12,
      gap: 12,
    },
    slotImage: {
      width: 52,
      height: 52,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    slotLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    slotTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 2 },
    slotEditBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptySlot: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 14,
      padding: 12,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    emptySlotIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptySlotText: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
    tomorrowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
    },
    tomorrowLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    tomorrowText: { fontSize: 15, color: colors.text, marginTop: 4 },
    groceryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
      marginBottom: 20,
    },
    groceryText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    quickActions: { flexDirection: 'row', gap: 10 },
    quickAction: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 14,
      paddingVertical: 18,
      alignItems: 'center',
      gap: 6,
    },
    quickActionText: { fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'center' },
  });

export default HomeScreen;
