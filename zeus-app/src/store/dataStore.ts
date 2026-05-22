import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MealPlan, Recipe, MacroSummaryResponse } from '../types/mealplan';
import { Recipe as FeedRecipe } from '../types/recipe';
import { PantryItem } from '../types/pantry';
import { GroceryList } from '../types/grocerylist';

interface RecipeCollectionCache {
  recipes: FeedRecipe[];
  fetchedAt: number;
}

interface DataState {
  // Cached data
  mealPlan: MealPlan | null;
  mealPlanRecipes: Record<string, Recipe>;
  macroSummary: MacroSummaryResponse | null;
  pantryItems: PantryItem[];
  groceryList: GroceryList | null;
  recipeFeed: FeedRecipe[];
  // Keyed cache of named scenario collections (quick_weeknight, one_pot, etc.)
  recipeCollections: Record<string, RecipeCollectionCache>;

  // Timestamps for staleness checks (ms since epoch)
  mealPlanFetchedAt: number | null;
  pantryFetchedAt: number | null;
  groceryListFetchedAt: number | null;
  recipeFeedFetchedAt: number | null;

  // Date-based meal plan cache key (ISO YYYY-MM-DD Monday of the cached week)
  cachedWeekDate: string | null;

  // Network state
  isOffline: boolean;
  lastSyncedAt: number | null;

  // Hydration state
  _hasHydrated: boolean;

  // Actions
  setMealPlan: (plan: MealPlan | null, recipes?: Record<string, Recipe>, macros?: MacroSummaryResponse | null) => void;
  setPantryItems: (items: PantryItem[]) => void;
  setGroceryList: (list: GroceryList | null) => void;
  setRecipeFeed: (recipes: FeedRecipe[]) => void;
  setRecipeCollection: (key: string, recipes: FeedRecipe[]) => void;
  isFresh: (key: 'mealPlan' | 'pantry' | 'groceryList' | 'recipeFeed', maxAgeMs?: number) => boolean;
  isCollectionFresh: (key: string, maxAgeMs?: number) => boolean;
  invalidate: (key: 'mealPlan' | 'pantry' | 'groceryList' | 'recipeFeed' | 'recipeCollections' | 'all') => void;
  // Full reset — called on logout / login (account switch). Wipes both the
  // in-memory state AND the persisted copy so User B never sees User A's data.
  resetAll: () => void;
  getCachedWeekDate: () => string | null;
  setCachedWeekDate: (date: string) => void;
  setOffline: (offline: boolean) => void;
  markSynced: () => void;
}

// Default staleness thresholds (in ms)
const STALE_THRESHOLDS = {
  mealPlan: 2 * 60 * 1000,   // 2 minutes
  pantry: 10 * 60 * 1000,     // 10 minutes
  groceryList: 5 * 60 * 1000, // 5 minutes
  recipeFeed: 5 * 60 * 1000,  // 5 minutes
  recipeCollection: 10 * 60 * 1000, // 10 minutes per collection
};

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      // Initial state
      mealPlan: null,
      mealPlanRecipes: {},
      macroSummary: null,
      pantryItems: [],
      groceryList: null,
      recipeFeed: [],
      recipeCollections: {},
      mealPlanFetchedAt: null,
      pantryFetchedAt: null,
      groceryListFetchedAt: null,
      recipeFeedFetchedAt: null,
      cachedWeekDate: null,
      isOffline: false,
      lastSyncedAt: null,
      _hasHydrated: false,

      setMealPlan: (plan, recipes, macros) =>
        set({
          mealPlan: plan,
          mealPlanRecipes: recipes ?? get().mealPlanRecipes,
          macroSummary: macros !== undefined ? macros : get().macroSummary,
          mealPlanFetchedAt: Date.now(),
          lastSyncedAt: Date.now(),
        }),

      setPantryItems: (items) =>
        set({
          pantryItems: items,
          pantryFetchedAt: Date.now(),
          lastSyncedAt: Date.now(),
        }),

      setGroceryList: (list) =>
        set({
          groceryList: list,
          groceryListFetchedAt: Date.now(),
          lastSyncedAt: Date.now(),
        }),

      setRecipeFeed: (recipes) =>
        set({
          recipeFeed: recipes,
          recipeFeedFetchedAt: Date.now(),
          lastSyncedAt: Date.now(),
        }),

      setRecipeCollection: (key, recipes) =>
        set((state) => ({
          recipeCollections: {
            ...state.recipeCollections,
            [key]: { recipes, fetchedAt: Date.now() },
          },
          lastSyncedAt: Date.now(),
        })),

      isCollectionFresh: (key, maxAgeMs) => {
        const entry = get().recipeCollections[key];
        if (!entry) return false;
        const threshold = maxAgeMs ?? STALE_THRESHOLDS.recipeCollection;
        return Date.now() - entry.fetchedAt < threshold;
      },

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
          case 'recipeFeed':
            fetchedAt = state.recipeFeedFetchedAt;
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
            recipeFeedFetchedAt: null,
            recipeCollections: {},
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
            case 'recipeFeed':
              set({ recipeFeedFetchedAt: null });
              break;
            case 'recipeCollections':
              set({ recipeCollections: {} });
              break;
          }
        }
      },

      getCachedWeekDate: () => get().cachedWeekDate,
      setCachedWeekDate: (date) => set({ cachedWeekDate: date }),
      setOffline: (offline) => set({ isOffline: offline }),
      markSynced: () => set({ lastSyncedAt: Date.now() }),

      resetAll: () => {
        set({
          mealPlan: null,
          mealPlanRecipes: {},
          macroSummary: null,
          pantryItems: [],
          groceryList: null,
          recipeFeed: [],
          recipeCollections: {},
          mealPlanFetchedAt: null,
          pantryFetchedAt: null,
          groceryListFetchedAt: null,
          recipeFeedFetchedAt: null,
          cachedWeekDate: null,
          lastSyncedAt: null,
        });
      },
    }),
    {
      name: 'zeus-data-store',
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      partialize: (state) => ({
        mealPlan: state.mealPlan,
        mealPlanRecipes: state.mealPlanRecipes,
        macroSummary: state.macroSummary,
        pantryItems: state.pantryItems,
        groceryList: state.groceryList,
        mealPlanFetchedAt: state.mealPlanFetchedAt,
        pantryFetchedAt: state.pantryFetchedAt,
        groceryListFetchedAt: state.groceryListFetchedAt,
        recipeFeed: state.recipeFeed,
        recipeFeedFetchedAt: state.recipeFeedFetchedAt,
        recipeCollections: state.recipeCollections,
        cachedWeekDate: state.cachedWeekDate,
        lastSyncedAt: state.lastSyncedAt,
      }),
      onRehydrateStorage: () => {
        return () => {
          useDataStore.setState({ _hasHydrated: true });
        };
      },
    }
  )
);
