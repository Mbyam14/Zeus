import { create } from 'zustand';
import { MealPlan, Recipe, MacroSummaryResponse } from '../types/mealplan';
import { PantryItem } from '../types/pantry';
import { GroceryList } from '../types/grocerylist';

interface DataState {
  // Cached data
  mealPlan: MealPlan | null;
  mealPlanRecipes: Record<string, Recipe>;
  macroSummary: MacroSummaryResponse | null;
  pantryItems: PantryItem[];
  groceryList: GroceryList | null;

  // Timestamps for staleness checks (ms since epoch)
  mealPlanFetchedAt: number | null;
  pantryFetchedAt: number | null;
  groceryListFetchedAt: number | null;

  // Week offset for meal plan cache invalidation
  cachedWeekOffset: number | null;

  // Actions
  setMealPlan: (plan: MealPlan | null, recipes?: Record<string, Recipe>, macros?: MacroSummaryResponse | null) => void;
  setPantryItems: (items: PantryItem[]) => void;
  setGroceryList: (list: GroceryList | null) => void;
  isFresh: (key: 'mealPlan' | 'pantry' | 'groceryList', maxAgeMs?: number) => boolean;
  invalidate: (key: 'mealPlan' | 'pantry' | 'groceryList' | 'all') => void;
  getCachedWeekOffset: () => number | null;
  setCachedWeekOffset: (offset: number) => void;
}

// Default staleness thresholds (in ms)
const STALE_THRESHOLDS = {
  mealPlan: 2 * 60 * 1000,   // 2 minutes
  pantry: 10 * 60 * 1000,     // 10 minutes
  groceryList: 5 * 60 * 1000, // 5 minutes
};

export const useDataStore = create<DataState>((set, get) => ({
  // Initial state
  mealPlan: null,
  mealPlanRecipes: {},
  macroSummary: null,
  pantryItems: [],
  groceryList: null,
  mealPlanFetchedAt: null,
  pantryFetchedAt: null,
  groceryListFetchedAt: null,
  cachedWeekOffset: null,

  setMealPlan: (plan, recipes, macros) =>
    set({
      mealPlan: plan,
      mealPlanRecipes: recipes ?? get().mealPlanRecipes,
      macroSummary: macros !== undefined ? macros : get().macroSummary,
      mealPlanFetchedAt: Date.now(),
    }),

  setPantryItems: (items) =>
    set({
      pantryItems: items,
      pantryFetchedAt: Date.now(),
    }),

  setGroceryList: (list) =>
    set({
      groceryList: list,
      groceryListFetchedAt: Date.now(),
    }),

  isFresh: (key, maxAgeMs) => {
    const state = get();
    const threshold = maxAgeMs ?? STALE_THRESHOLDS[key];
    let fetchedAt: number | null = null;

    switch (key) {
      case 'mealPlan':
        fetchedAt = state.mealPlanFetchedAt;
        break;
      case 'pantry':
        fetchedAt = state.pantryFetchedAt;
        break;
      case 'groceryList':
        fetchedAt = state.groceryListFetchedAt;
        break;
    }

    if (!fetchedAt) return false;
    return Date.now() - fetchedAt < threshold;
  },

  invalidate: (key) => {
    if (key === 'all') {
      set({
        mealPlanFetchedAt: null,
        pantryFetchedAt: null,
        groceryListFetchedAt: null,
      });
    } else {
      switch (key) {
        case 'mealPlan':
          set({ mealPlanFetchedAt: null });
          break;
        case 'pantry':
          set({ pantryFetchedAt: null });
          break;
        case 'groceryList':
          set({ groceryListFetchedAt: null });
          break;
      }
    }
  },

  getCachedWeekOffset: () => get().cachedWeekOffset,
  setCachedWeekOffset: (offset) => set({ cachedWeekOffset: offset }),
}));
