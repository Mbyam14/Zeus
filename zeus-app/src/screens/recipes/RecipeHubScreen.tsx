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
import { smartAIService, CookTonightResult } from '../../services/smartAIService';
import { useThemeStore, ThemeColors } from '../../store/themeStore';
import { useDataStore } from '../../store/dataStore';

const { width: screenWidth } = Dimensions.get('window');

type MainTab = 'browse' | 'myRecipes';
type MyRecipesTab = 'liked' | 'saved' | 'created';
type SortOption = 'popular' | 'newest' | 'quick';

const MEAL_TYPES = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'];
const CUISINES = ['All', 'Italian', 'Mexican', 'Asian', 'Mediterranean', 'American', 'Indian', 'Japanese', 'Thai', 'Korean', 'Greek'];
const LIMIT = 20;

// ─────────────────────────────────────────────────────────────
// Reusable Recipe Card
// ─────────────────────────────────────────────────────────────
const RecipeCard: React.FC<{
  recipe: Recipe;
  onPress: () => void;
  compact?: boolean;
  colors: ThemeColors;
}> = ({ recipe, onPress, compact, colors }) => {
  const cardWidth = compact ? 180 : (screenWidth - 48) / 2;
  const imageHeight = compact ? 110 : 120;

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
              {(recipe.prep_time || 0) + (recipe.cook_time || 0)} min
            </Text>
          )}
        </View>
      </View>
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

  // Cook Tonight
  const [cookTonightLoading, setCookTonightLoading] = useState(false);
  const [cookTonightResult, setCookTonightResult] = useState<CookTonightResult['suggestion']>(null);
  const [cookTonightExpanded, setCookTonightExpanded] = useState(false);

  // Filter modal
  const [showFilterModal, setShowFilterModal] = useState(false);

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

      let results = await recipeService.getAllRecipes(
        LIMIT, newOffset, search || undefined, mealType, undefined, cuisine
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
  }, [offset, search, mealTypeFilter, cuisineFilter, sortBy]);

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

  useFocusEffect(
    useCallback(() => {
      if (mainTab === 'browse') {
        loadRecipes(true);
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

  // ── Cook Tonight ──

  const handleCookTonight = async () => {
    if (cookTonightExpanded && cookTonightResult) {
      // Already expanded — just collapse
      setCookTonightExpanded(false);
      return;
    }
    setCookTonightLoading(true);
    setCookTonightExpanded(true);
    try {
      const result = await smartAIService.getCookTonightSuggestion();
      setCookTonightResult(result.suggestion);
    } catch {
      setCookTonightResult(null);
    } finally {
      setCookTonightLoading(false);
    }
  };

  const handleRefreshSuggestion = async () => {
    setCookTonightLoading(true);
    try {
      const result = await smartAIService.getCookTonightSuggestion();
      setCookTonightResult(result.suggestion);
    } catch { }
    finally { setCookTonightLoading(false); }
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
      {/* Cook Tonight mini-banner */}
      <TouchableOpacity
        style={styles.cookTonightBanner}
        onPress={handleCookTonight}
        activeOpacity={0.7}
      >
        <Ionicons name="sparkles" size={18} color={colors.primary} />
        <Text style={styles.cookTonightText}>What should I cook tonight?</Text>
        <Ionicons name={cookTonightExpanded ? 'chevron-up' : 'chevron-forward'} size={16} color={colors.primary} />
      </TouchableOpacity>

      {/* Cook Tonight expanded result */}
      {cookTonightExpanded && (
        <View style={styles.cookTonightCard}>
          {cookTonightLoading ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.cookTonightCardSubtext, { marginTop: 8 }]}>Thinking...</Text>
            </View>
          ) : cookTonightResult ? (
            <>
              <Text style={styles.cookTonightCardTitle}>{cookTonightResult.recipe_title}</Text>
              <Text style={styles.cookTonightCardSubtext}>{cookTonightResult.why}</Text>
              <View style={styles.cookTonightMeta}>
                <View style={styles.cookTonightMetaItem}>
                  <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.cookTonightMetaText}>{cookTonightResult.prep_time_minutes} min</Text>
                </View>
                <View style={styles.cookTonightMetaItem}>
                  <Ionicons name="flame-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.cookTonightMetaText}>{cookTonightResult.calories_estimate} cal</Text>
                </View>
                <View style={styles.cookTonightMetaItem}>
                  <Ionicons name="basket-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.cookTonightMetaText}>{cookTonightResult.pantry_items_used.length} pantry items</Text>
                </View>
              </View>
              {cookTonightResult.items_to_buy.length > 0 && (
                <Text style={styles.cookTonightBuyText}>
                  Need to buy: {cookTonightResult.items_to_buy.join(', ')}
                </Text>
              )}
              <TouchableOpacity style={styles.cookTonightRefresh} onPress={handleRefreshSuggestion}>
                <Ionicons name="refresh-outline" size={16} color={colors.primary} />
                <Text style={[styles.cookTonightText, { flex: 0 }]}>Get another suggestion</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.cookTonightCardSubtext}>Add items to your pantry for personalized suggestions!</Text>
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
        created: { title: 'No recipes yet', subtitle: 'Tap + to create your first recipe' },
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
              onEndReachedThreshold={0.5}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              }
              renderItem={({ item }) => (
                <RecipeCard
                  recipe={item}
                  onPress={() => goToRecipe(item)}
                  colors={colors}
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

    // Cook Tonight banner
    cookTonightBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.primary + '10',
      gap: 8,
    },
    cookTonightText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
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

    // Cook Tonight expanded card
    cookTonightCard: {
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 16,
      borderRadius: 14,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.primary + '25',
    },
    cookTonightCardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    cookTonightCardSubtext: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
      marginBottom: 8,
    },
    cookTonightMeta: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 8,
    },
    cookTonightMetaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    cookTonightMetaText: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '500',
    },
    cookTonightBuyText: {
      fontSize: 12,
      color: colors.warning || '#F59E0B',
      marginBottom: 10,
    },
    cookTonightRefresh: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },

    // Filter bar
    filterBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
      flexWrap: 'wrap',
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
