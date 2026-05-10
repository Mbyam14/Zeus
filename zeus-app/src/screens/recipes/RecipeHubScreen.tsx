import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  Dimensions,
  RefreshControl,
  Modal,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Recipe } from '../../types/recipe';
import { recipeService } from '../../services/recipeService';
import { mealPlanService } from '../../services/mealPlanService';
import { getRecipeIdFromSlot, DEFAULT_MEAL_TYPES } from '../../types/mealplan';
import { useThemeStore, ThemeColors } from '../../store/themeStore';
import { useDataStore } from '../../store/dataStore';
import { useAuthStore } from '../../store/authStore';

const { width: screenWidth } = Dimensions.get('window');

type MainTab = 'browse' | 'myRecipes';
type MyRecipesTab = 'liked' | 'saved' | 'created';
type SortOption = 'popular' | 'newest' | 'quick';

const MEAL_TYPES = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'];
const CUISINES = ['All', 'Italian', 'Mexican', 'Asian', 'Mediterranean', 'American', 'Indian', 'Japanese', 'Thai', 'Korean', 'Greek'];
const LIMIT = 30;

// ─────────────────────────────────────────────────────────────
// Time formatting helper
// ─────────────────────────────────────────────────────────────
const formatTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
};

// ─────────────────────────────────────────────────────────────
// Reusable Recipe Card
// ─────────────────────────────────────────────────────────────
const RecipeCard: React.FC<{
  recipe: Recipe;
  onPress: () => void;
  compact?: boolean;
  colors: ThemeColors;
  showActions?: boolean;
  onLikeChange?: (recipeId: string, liked: boolean) => void;
  onSaveChange?: (recipeId: string, saved: boolean) => void;
}> = ({ recipe, onPress, compact, colors, showActions = false, onLikeChange, onSaveChange }) => {
  const cardWidth = compact ? 180 : (screenWidth - 48) / 2;
  const imageHeight = compact ? 110 : 120;

  // Sync local state with recipe prop when it changes
  const [isLiked, setIsLiked] = useState(recipe.is_liked || false);
  const [isSaved, setIsSaved] = useState(recipe.is_saved || false);

  useEffect(() => {
    setIsLiked(recipe.is_liked || false);
    setIsSaved(recipe.is_saved || false);
  }, [recipe.is_liked, recipe.is_saved]);

  const handleLike = async () => {
    const newState = !isLiked;
    setIsLiked(newState);
    try {
      if (newState) await recipeService.likeRecipe(recipe.id);
      else await recipeService.unlikeRecipe(recipe.id);
      onLikeChange?.(recipe.id, newState);
    } catch { setIsLiked(!newState); }
  };

  const handleSave = async () => {
    const newState = !isSaved;
    setIsSaved(newState);
    try {
      if (newState) await recipeService.saveRecipe(recipe.id);
      else await recipeService.unsaveRecipe(recipe.id);
      onSaveChange?.(recipe.id, newState);
    } catch { setIsSaved(!newState); }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        cardStyles(colors).card,
        { width: cardWidth, marginRight: compact ? 12 : 0 },
      ]}
    >
      <View style={[cardStyles(colors).imageContainer, { height: imageHeight }]}>
        {recipe.image_url ? (
          <Image source={{ uri: recipe.image_url }} style={cardStyles(colors).image} />
        ) : (
          <View style={cardStyles(colors).imagePlaceholder}>
            <Ionicons name="restaurant-outline" size={32} color={colors.textMuted} />
          </View>
        )}
        {recipe.is_ai_generated && (
          <View style={cardStyles(colors).aiBadge}>
            <Text style={cardStyles(colors).aiBadgeText}>AI</Text>
          </View>
        )}
      </View>
      <View style={cardStyles(colors).info}>
        <Text style={cardStyles(colors).title} numberOfLines={2}>
          {recipe.title}
        </Text>
        <View style={cardStyles(colors).meta}>
          {recipe.calories != null && (
            <Text style={cardStyles(colors).calorieText}>
              {Math.round(recipe.calories)} cal
            </Text>
          )}
          {(recipe.prep_time != null || recipe.cook_time != null) && (
            <Text style={cardStyles(colors).metaText}>
              {formatTime((recipe.prep_time || 0) + (recipe.cook_time || 0))}
            </Text>
          )}
        </View>
      </View>
      {showActions && (
        <View style={cardStyles(colors).actionRow}>
          <TouchableOpacity onPress={handleLike} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={20} color={isLiked ? '#EF4444' : colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={20} color={isSaved ? colors.primary : colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
};

const cardStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 14,
      marginBottom: 12,
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
        },
        android: { elevation: 2 },
      }),
    },
    imageContainer: {
      backgroundColor: colors.border,
    },
    image: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    imagePlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    aiBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: colors.secondary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    aiBadgeText: {
      color: colors.buttonText,
      fontSize: 10,
      fontWeight: '700',
    },
    info: {
      padding: 10,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
      lineHeight: 19,
    },
    meta: {
      flexDirection: 'row',
      gap: 8,
    },
    calorieText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    metaText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingBottom: 8,
      paddingTop: 2,
    },
  });

// ─────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────
export const RecipeHubScreen: React.FC = () => {
  const { colors } = useThemeStore();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors);
  const cachedRecipeFeed = useDataStore((s) => s.recipeFeed);
  const recipeFeedFresh = useDataStore((s) => s.isFresh('recipeFeed'));
  const user = useAuthStore((s) => s.user);
  const cookingSkill = user?.profile_data?.preferences?.cooking_skill || 'intermediate';

  // Main tab
  const [mainTab, setMainTab] = useState<MainTab>('browse');

  // ── Browse state ──
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [mealTypeFilter, setMealTypeFilter] = useState<string>('All');
  const [cuisineFilter, setCuisineFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filter modal
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Today's Menu
  const [todayMeals, setTodayMeals] = useState<{ mealType: string; recipe: Recipe | null }[]>([]);
  const [todayMenuLoading, setTodayMenuLoading] = useState(false);

  // Collapsible sections
  const [showTodayMenu, setShowTodayMenu] = useState(true);
  const [showDailyPick, setShowDailyPick] = useState(false);
  const [showSeasonal, setShowSeasonal] = useState(false);

  // Featured / Daily Pick
  const [dailyPick, setDailyPick] = useState<Recipe | null>(null);
  const [seasonalPicks, setSeasonalPicks] = useState<Recipe[]>([]);

  // ── My Recipes state ──
  const [myRecipesTab, setMyRecipesTab] = useState<MyRecipesTab>('liked');
  const [likedRecipes, setLikedRecipes] = useState<Recipe[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([]);
  const [createdRecipes, setCreatedRecipes] = useState<Recipe[]>([]);
  const [myRecipesLoading, setMyRecipesLoading] = useState(false);

  // ── Browse loaders ──

  const loadRecipes = useCallback(async (reset = false) => {
    // Check cache first for default browse (no filters, no search, popular sort)
    if (reset && !search && mealTypeFilter === 'All' && cuisineFilter === 'All' && sortBy === 'popular') {
      if (recipeFeedFresh && cachedRecipeFeed.length > 0) {
        setRecipes(cachedRecipeFeed);
        setLoading(false);
        return;
      }
    }

    const newOffset = reset ? 0 : offset;
    if (reset) { setLoading(true); setOffset(0); }
    else { setLoadingMore(true); }

    try {
      const mealType = mealTypeFilter !== 'All' ? mealTypeFilter : undefined;
      const cuisine = cuisineFilter !== 'All' ? cuisineFilter : undefined;

      // Map cooking skill to max difficulty for backend filtering
      const maxDiff = cookingSkill === 'beginner' ? 'Easy' : cookingSkill === 'intermediate' ? 'Medium' : undefined;

      let results = await recipeService.getAllRecipes(
        LIMIT, newOffset, search || undefined, mealType, undefined, cuisine, maxDiff
      );

      // Client-side sorting
      if (sortBy === 'newest') {
        results = results.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });
      } else if (sortBy === 'quick') {
        results = results.sort((a, b) => {
          const timeA = (a.prep_time || 0) + (a.cook_time || 0);
          const timeB = (b.prep_time || 0) + (b.cook_time || 0);
          return timeA - timeB;
        });
      }
      // 'popular' is the default backend sort (by likes_count)

      if (reset) setRecipes(results);
      else setRecipes(prev => [...prev, ...results]);

      // Cache default browse results for offline access
      if (reset && !search && mealTypeFilter === 'All' && cuisineFilter === 'All') {
        useDataStore.getState().setRecipeFeed(results);
      }

      setHasMore(results.length === LIMIT);
      setOffset(newOffset + LIMIT);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [offset, search, mealTypeFilter, cuisineFilter, sortBy, cookingSkill]);

  // Reload when filters change
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      loadRecipes(true);
      return;
    }
    loadRecipes(true);
  }, [search, mealTypeFilter, cuisineFilter, sortBy]);

  // ── My Recipes loader ──

  const loadMyRecipes = async () => {
    setMyRecipesLoading(true);
    try {
      const [liked, saved, created] = await Promise.all([
        recipeService.getLikedRecipes(30, 0),
        recipeService.getSavedRecipes(30, 0),
        recipeService.getMyRecipes(30, 0),
      ]);
      setLikedRecipes(liked);
      setSavedRecipes(saved);
      setCreatedRecipes(created.filter(r => !r.is_ai_generated));
    } catch {
      /* silent */
    } finally {
      setMyRecipesLoading(false);
    }
  };

  // ── Today's Menu loader ──

  const getTodayDayOfWeek = (): string => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date().getDay()];
  };

  const loadTodayMenu = async () => {
    setTodayMenuLoading(true);
    try {
      const plan = await mealPlanService.getCurrentWeekMealPlan();
      if (!plan || !plan.meals) { setTodayMeals([]); return; }

      const today = getTodayDayOfWeek();
      const todayData = (plan.meals as any)[today];
      if (!todayData) { setTodayMeals([]); return; }

      // Get recipe IDs for today
      const mealTypes = plan.meal_types || DEFAULT_MEAL_TYPES;
      const recipeIds: string[] = [];
      const mealEntries: { mealType: string; recipeId: string | null }[] = [];

      for (const mt of mealTypes) {
        const slot = todayData[mt.key as keyof typeof todayData] as any;
        const recipeId = slot ? getRecipeIdFromSlot(slot) : null;
        mealEntries.push({ mealType: mt.label, recipeId: recipeId || null });
        if (recipeId) recipeIds.push(recipeId);
      }

      if (recipeIds.length === 0) { setTodayMeals([]); return; }

      // Fetch recipes
      const recipesData = await mealPlanService.getRecipes(recipeIds);
      const recipeMap: Record<string, any> = {};
      recipesData.forEach((r: any) => { if (r?.id) recipeMap[r.id] = r; });

      setTodayMeals(
        mealEntries
          .filter(m => m.recipeId && recipeMap[m.recipeId])
          .map(m => ({ mealType: m.mealType, recipe: recipeMap[m.recipeId!] }))
      );
    } catch {
      setTodayMeals([]);
    } finally {
      setTodayMenuLoading(false);
    }
  };

  // ── Featured / Seasonal loader ──

  const SEASONAL_KEYWORDS: Record<string, string[]> = {
    spring: ['salad', 'asparagus', 'pea', 'lemon', 'herb', 'light', 'fresh', 'spring'],
    summer: ['grill', 'bbq', 'watermelon', 'corn', 'tomato', 'berry', 'summer', 'cold', 'ice'],
    fall: ['pumpkin', 'apple', 'squash', 'cinnamon', 'harvest', 'maple', 'autumn', 'fall', 'sweet potato'],
    winter: ['stew', 'soup', 'roast', 'comfort', 'chili', 'winter', 'warm', 'hearty', 'hot chocolate'],
  };

  const getCurrentSeason = (): string => {
    const month = new Date().getMonth(); // 0-11
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  };

  const loadFeatured = async () => {
    try {
      // Daily pick: deterministic based on date so it's consistent all day
      const dateStr = new Date().toISOString().split('T')[0];
      const seed = dateStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

      // Get a page of popular recipes
      const popular = await recipeService.getAllRecipes(50, 0);
      if (popular.length > 0) {
        setDailyPick(popular[seed % popular.length]);
      }

      // Seasonal: filter by keywords in title/description
      const season = getCurrentSeason();
      const keywords = SEASONAL_KEYWORDS[season];
      const seasonal = popular.filter(r => {
        const text = ((r.title || '') + ' ' + (r.description || '')).toLowerCase();
        return keywords.some(kw => text.includes(kw));
      }).slice(0, 6);
      setSeasonalPicks(seasonal);
    } catch { /* silent */ }
  };

  useFocusEffect(
    useCallback(() => {
      if (mainTab === 'browse') {
        loadRecipes(true);
        loadTodayMenu();
        loadFeatured();
      } else {
        loadMyRecipes();
      }
    }, [mainTab]),
  );

  // ── Search debounce ──

  const handleSearchChange = (text: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (text.trim().length === 0) {
      setSearch('');
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      setSearch(text.trim());
    }, 400);
  };

  const [searchText, setSearchText] = useState('');
  const onSearchTextChange = (text: string) => {
    setSearchText(text);
    handleSearchChange(text);
  };

  const clearSearch = () => {
    setSearchText('');
    setSearch('');
  };

  const activeFilterCount =
    (mealTypeFilter !== 'All' ? 1 : 0) +
    (cuisineFilter !== 'All' ? 1 : 0) +
    (sortBy !== 'popular' ? 1 : 0);

  // ── Refresh ──

  const onRefresh = async () => {
    setRefreshing(true);
    if (mainTab === 'browse') {
      await loadRecipes(true);
    } else {
      await loadMyRecipes();
    }
    setRefreshing(false);
  };

  // ── Navigation ──

  const goToRecipe = (recipe: Recipe) => {
    navigation.navigate('RecipeDetail', { recipe });
  };

  const goToCreate = () => {
    navigation.navigate('CreateRecipe');
  };

  // ── Load more ──

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && !loading) {
      loadRecipes(false);
    }
  };

  // ── My Recipes derived data ──

  const activeMyRecipes =
    myRecipesTab === 'liked'
      ? likedRecipes
      : myRecipesTab === 'saved'
        ? savedRecipes
        : createdRecipes;

  // ── Filter chip renderer ──

  const renderFilterChips = (
    items: string[],
    selected: string,
    onSelect: (item: string) => void,
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterChipRow}
    >
      {items.map(item => {
        const isActive = selected === item;
        return (
          <TouchableOpacity
            key={item}
            activeOpacity={0.7}
            onPress={() => onSelect(item)}
            style={[styles.filterChip, isActive && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
              {item}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  // ── Sort pills ──

  const renderSortRow = () => {
    const sortOptions: { key: SortOption; label: string }[] = [
      { key: 'popular', label: 'Popular' },
      { key: 'newest', label: 'Newest' },
      { key: 'quick', label: 'Quick to Make' },
    ];

    return (
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort by</Text>
        {sortOptions.map(opt => {
          const isActive = sortBy === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              activeOpacity={0.7}
              onPress={() => setSortBy(opt.key)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // ── Browse header (rendered above the FlatList) ──

  const renderBrowseHeader = () => (
    <View>
      {/* Today's Menu */}
      {todayMeals.length > 0 && (
        <View style={styles.todayMenuSection}>
          <TouchableOpacity style={styles.sectionHeaderRow} onPress={() => setShowTodayMenu(!showTodayMenu)} activeOpacity={0.7}>
            <Ionicons name="restaurant" size={20} color={colors.primary} />
            <Text style={styles.sectionHeaderText}>Today's Menu</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name={showTodayMenu ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
          {showTodayMenu && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {todayMeals.map((meal, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.todayMealCard}
                  onPress={() => meal.recipe && goToRecipe(meal.recipe)}
                  activeOpacity={0.8}
                >
                  {meal.recipe?.image_url ? (
                    <Image source={{ uri: meal.recipe.image_url }} style={styles.todayMealImage} />
                  ) : (
                    <View style={[styles.todayMealImage, styles.todayMealImagePlaceholder]}>
                      <Ionicons name="restaurant-outline" size={24} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={styles.todayMealInfo}>
                    <Text style={styles.todayMealType}>{meal.mealType}</Text>
                    <Text style={styles.todayMealTitle} numberOfLines={2}>{meal.recipe?.title || 'No recipe'}</Text>
                    {meal.recipe?.calories != null && (
                      <Text style={styles.todayMealCal}>{Math.round(meal.recipe.calories)} cal</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Daily Pick */}
      {dailyPick && (
        <View style={styles.featuredSection}>
          <TouchableOpacity style={styles.sectionHeaderRow} onPress={() => setShowDailyPick(!showDailyPick)} activeOpacity={0.7}>
            <Ionicons name="star" size={20} color="#F59E0B" />
            <Text style={styles.sectionHeaderText}>Today's Pick</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name={showDailyPick ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
          {showDailyPick && (
            <TouchableOpacity
              style={styles.dailyPickCard}
              onPress={() => goToRecipe(dailyPick)}
              activeOpacity={0.85}
            >
              {dailyPick.image_url ? (
                <Image source={{ uri: dailyPick.image_url }} style={styles.dailyPickImage} />
              ) : null}
              <View style={styles.dailyPickOverlay}>
                <Text style={styles.dailyPickTitle}>{dailyPick.title}</Text>
                <View style={styles.dailyPickMeta}>
                  {dailyPick.calories != null && (
                    <Text style={styles.dailyPickMetaText}>{Math.round(dailyPick.calories)} cal</Text>
                  )}
                  {(dailyPick.prep_time != null || dailyPick.cook_time != null) && (
                    <Text style={styles.dailyPickMetaText}>{formatTime((dailyPick.prep_time || 0) + (dailyPick.cook_time || 0))}</Text>
                  )}
                  {dailyPick.difficulty && (
                    <Text style={styles.dailyPickMetaText}>{dailyPick.difficulty}</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Seasonal Picks */}
      {seasonalPicks.length > 0 && (
        <View style={styles.featuredSection}>
          <TouchableOpacity style={styles.sectionHeaderRow} onPress={() => setShowSeasonal(!showSeasonal)} activeOpacity={0.7}>
            <Ionicons name="leaf" size={20} color="#22C55E" />
            <Text style={styles.sectionHeaderText}>
              {getCurrentSeason().charAt(0).toUpperCase() + getCurrentSeason().slice(1)} Favorites
            </Text>
            <View style={{ flex: 1 }} />
            <Ionicons name={showSeasonal ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
          {showSeasonal && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {seasonalPicks.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} onPress={() => goToRecipe(recipe)} compact colors={colors} />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Filter & Sort button */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilterModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="options-outline" size={18} color={activeFilterCount > 0 ? colors.primary : colors.textMuted} />
          <Text style={[styles.filterButtonText, activeFilterCount > 0 && { color: colors.primary }]}>
            Filter & Sort
          </Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        {/* Active filter pills (quick summary) */}
        {mealTypeFilter !== 'All' && (
          <TouchableOpacity style={styles.activeFilterPill} onPress={() => setMealTypeFilter('All')}>
            <Text style={styles.activeFilterPillText}>{mealTypeFilter}</Text>
            <Ionicons name="close" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
        {cuisineFilter !== 'All' && (
          <TouchableOpacity style={styles.activeFilterPill} onPress={() => setCuisineFilter('All')}>
            <Text style={styles.activeFilterPillText}>{cuisineFilter}</Text>
            <Ionicons name="close" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ── Browse grid footer ──

  const renderBrowseFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    return <View style={{ height: 100 }} />;
  };

  // ── Browse empty state ──

  const renderBrowseEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="search-outline" size={48} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>No recipes found</Text>
        <Text style={styles.emptySubtitle}>Try changing your filters or search term</Text>
      </View>
    );
  };

  // ── My Recipes tab pills ──

  const renderMyRecipesTabs = () => (
    <View style={styles.pillContainer}>
      {(['liked', 'saved', 'created'] as MyRecipesTab[]).map(tab => {
        const isActive = myRecipesTab === tab;
        const label = tab.charAt(0).toUpperCase() + tab.slice(1);
        const icon: keyof typeof Ionicons.glyphMap =
          tab === 'liked' ? 'heart-outline' : tab === 'saved' ? 'bookmark-outline' : 'create-outline';
        return (
          <TouchableOpacity
            key={tab}
            activeOpacity={0.7}
            onPress={() => setMyRecipesTab(tab)}
            style={[styles.pill, isActive && styles.pillActive]}
          >
            <Ionicons
              name={icon}
              size={14}
              color={isActive ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── My Recipes content ──

  const renderMyRecipesContent = () => {
    if (myRecipesLoading) {
      return (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 30 }}
        />
      );
    }
    if (activeMyRecipes.length === 0) {
      const emptyMessages: Record<MyRecipesTab, { title: string; subtitle: string }> = {
        liked: { title: 'No liked recipes', subtitle: 'Recipes you like will appear here' },
        saved: { title: 'No saved recipes', subtitle: 'Save recipes for quick access' },
        created: { title: 'No recipes yet', subtitle: 'Create your own recipes and they\'ll appear here' },
      };
      return (
        <View style={styles.emptyContainer}>
          <Ionicons
            name={
              myRecipesTab === 'liked'
                ? 'heart-outline'
                : myRecipesTab === 'saved'
                  ? 'bookmark-outline'
                  : 'create-outline'
            }
            size={48}
            color={colors.textMuted}
          />
          <Text style={styles.emptyTitle}>{emptyMessages[myRecipesTab].title}</Text>
          <Text style={styles.emptySubtitle}>{emptyMessages[myRecipesTab].subtitle}</Text>
          {myRecipesTab === 'created' && (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.primary,
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 12,
                marginTop: 16,
                gap: 8,
              }}
              onPress={goToCreate}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={20} color="#FFF" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>Create Your Own</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    return (
      <FlatList
        data={activeMyRecipes}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            onPress={() => goToRecipe(item)}
            colors={colors}
            showActions
            onLikeChange={(id, liked) => {
              if (!liked && myRecipesTab === 'liked') {
                setLikedRecipes(prev => prev.filter(r => r.id !== id));
              }
            }}
            onSaveChange={(id, saved) => {
              if (!saved && myRecipesTab === 'saved') {
                setSavedRecipes(prev => prev.filter(r => r.id !== id));
              }
            }}
          />
        )}
        ListFooterComponent={<View style={{ height: 100 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      />
    );
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Recipes</Text>
        <TouchableOpacity style={styles.addButton} onPress={goToCreate} activeOpacity={0.7}>
          <Ionicons name="add" size={28} color={colors.backgroundSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tab switcher: Browse | My Recipes */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setMainTab('browse')}
          style={[styles.tab, mainTab === 'browse' && styles.tabActive]}
        >
          <Text style={[styles.tabText, mainTab === 'browse' && styles.tabTextActive]}>
            Browse
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => { setMainTab('myRecipes'); loadMyRecipes(); }}
          style={[styles.tab, mainTab === 'myRecipes' && styles.tabActive]}
        >
          <Text style={[styles.tabText, mainTab === 'myRecipes' && styles.tabTextActive]}>
            My Recipes
          </Text>
        </TouchableOpacity>
      </View>

      {mainTab === 'browse' ? (
        <>
          {/* Search bar */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search recipes..."
                placeholderTextColor={colors.textMuted}
                value={searchText}
                onChangeText={onSearchTextChange}
                returnKeyType="search"
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={clearSearch} activeOpacity={0.6}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Browse grid */}
          {loading && recipes.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={recipes}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={renderBrowseHeader}
              ListFooterComponent={renderBrowseFooter}
              ListEmptyComponent={renderBrowseEmpty}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={1.5}
              windowSize={13}
              maxToRenderPerBatch={15}
              initialNumToRender={15}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              }
              renderItem={({ item }) => (
                <RecipeCard
                  recipe={item}
                  onPress={() => goToRecipe(item)}
                  colors={colors}
                  showActions
                />
              )}
            />
          )}
        </>
      ) : (
        <>
          {/* My Recipes sub-tabs */}
          {renderMyRecipesTabs()}
          {renderMyRecipesContent()}
        </>
      )}
      {/* Filter & Sort Modal */}
      <Modal visible={showFilterModal} transparent animationType="slide" onRequestClose={() => setShowFilterModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowFilterModal(false)} activeOpacity={1} />
        <View style={styles.filterSheet}>
          <View style={styles.filterSheetHandle} />
          <Text style={styles.filterSheetTitle}>Filter & Sort</Text>

          {/* Meal Type */}
          <Text style={styles.filterSheetLabel}>Meal Type</Text>
          <View style={styles.filterSheetChipRow}>
            {MEAL_TYPES.map(item => {
              const isActive = mealTypeFilter === item;
              return (
                <TouchableOpacity key={item} onPress={() => setMealTypeFilter(item)} style={[styles.filterChip, isActive && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Cuisine */}
          <Text style={styles.filterSheetLabel}>Cuisine</Text>
          <View style={styles.filterSheetChipRow}>
            {CUISINES.map(item => {
              const isActive = cuisineFilter === item;
              return (
                <TouchableOpacity key={item} onPress={() => setCuisineFilter(item)} style={[styles.filterChip, isActive && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Sort */}
          <Text style={styles.filterSheetLabel}>Sort By</Text>
          <View style={styles.filterSheetChipRow}>
            {[{ key: 'popular' as SortOption, label: 'Popular' }, { key: 'newest' as SortOption, label: 'Newest' }, { key: 'quick' as SortOption, label: 'Quick to Make' }].map(opt => {
              const isActive = sortBy === opt.key;
              return (
                <TouchableOpacity key={opt.key} onPress={() => setSortBy(opt.key)} style={[styles.filterChip, isActive && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Actions */}
          <View style={styles.filterSheetActions}>
            <TouchableOpacity style={styles.filterSheetClear} onPress={() => { setMealTypeFilter('All'); setCuisineFilter('All'); setSortBy('popular'); }}>
              <Text style={styles.filterSheetClearText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterSheetApply} onPress={() => setShowFilterModal(false)}>
              <Text style={styles.filterSheetApplyText}>Show Results</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: Platform.OS === 'ios' ? 8 : 16,
      paddingBottom: 16,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.primary,
    },
    addButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Tab switcher
    tabRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
    },
    tabTextActive: {
      color: '#FFF',
    },

    // Search
    searchContainer: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 10,
      paddingHorizontal: 12,
      borderWidth: 1.5,
      borderColor: colors.primary + '40',
      height: 40,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      paddingVertical: 0,
    },

    // Today's Menu
    todayMenuSection: {
      marginBottom: 8,
      paddingTop: 8,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginBottom: 10,
      gap: 8,
    },
    sectionHeaderText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    todayMealCard: {
      width: 200,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 14,
      overflow: 'hidden',
      ...Platform.select({
        ios: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
        android: { elevation: 2 },
      }),
    },
    todayMealImage: {
      width: '100%',
      height: 110,
    },
    todayMealImagePlaceholder: {
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    todayMealInfo: {
      padding: 10,
    },
    todayMealType: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    todayMealTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 19,
      marginBottom: 4,
    },
    todayMealCal: {
      fontSize: 12,
      color: colors.textMuted,
    },

    // Featured / Daily Pick
    featuredSection: {
      marginBottom: 12,
      paddingTop: 4,
    },
    dailyPickCard: {
      marginHorizontal: 16,
      borderRadius: 16,
      overflow: 'hidden',
      height: 180,
      backgroundColor: colors.backgroundSecondary,
    },
    dailyPickImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    dailyPickOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 14,
      paddingTop: 30,
    },
    dailyPickTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#FFF',
      textShadowColor: 'rgba(0,0,0,0.8)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
      marginBottom: 4,
    },
    dailyPickMeta: {
      flexDirection: 'row',
      gap: 12,
    },
    dailyPickMetaText: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.9)',
      fontWeight: '600',
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },

    // Filter chips
    filterSection: {
      marginTop: 4,
    },
    filterChipRow: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      gap: 8,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundSecondary,
      marginRight: 0,
    },
    filterChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
    },
    filterChipTextActive: {
      color: '#FFF',
    },

    // Sort row
    sortRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 6,
      gap: 8,
    },
    sortLabel: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '500',
    },

    // Loading
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    footerLoader: {
      paddingVertical: 20,
      alignItems: 'center',
    },

    // Grid
    gridContent: {
      paddingHorizontal: 16,
    },
    gridRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },

    // My Recipes tab pills
    pillContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 8,
    },
    pill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    pillActive: {
      backgroundColor: colors.primary + '15',
      borderColor: colors.primary,
    },
    pillText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
    },
    pillTextActive: {
      color: colors.primary,
    },

    // Empty states
    emptyContainer: {
      paddingTop: 40,
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingBottom: 20,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginTop: 12,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },

    // Filter bar
    filterBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
    },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    filterButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
    },
    filterBadge: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    filterBadgeText: {
      color: '#FFF',
      fontSize: 11,
      fontWeight: '700',
    },
    activeFilterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.primary + '15',
      gap: 4,
    },
    activeFilterPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },

    // Filter modal
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    filterSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },
    filterSheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 16,
    },
    filterSheetTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 20,
    },
    filterSheetLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 10,
      marginTop: 8,
    },
    filterSheetChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    filterSheetActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 20,
    },
    filterSheetClear: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
    },
    filterSheetClearText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textMuted,
    },
    filterSheetApply: {
      flex: 2,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    filterSheetApplyText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFF',
    },
  });
