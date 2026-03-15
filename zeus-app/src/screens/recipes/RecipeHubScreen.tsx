import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
  Animated,
  Dimensions,
  Alert,
  ScrollView,
  Platform,
  RefreshControl,
} from 'react-native';
import { PanGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Recipe } from '../../types/recipe';
import { recipeService } from '../../services/recipeService';
import { pantryService } from '../../services/pantryService';
import { useThemeStore, ThemeColors } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { getDifficultyColor } from '../../utils/colors';
import { PantryItem } from '../../types/pantry';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type TabMode = 'discover' | 'browse' | 'myrecipes';
type MyRecipesSubTab = 'created' | 'saved' | 'liked';

// ============================================================
// DISCOVER TAB - Swipe-based recipe discovery
// ============================================================
interface SessionPreferences {
  likedCuisines: Record<string, number>;
  likedDifficulties: Record<string, number>;
  skippedCuisines: Record<string, number>;
  totalLikes: number;
  totalSkips: number;
}

export interface DiscoverState {
  recipes: Recipe[];
  currentIndex: number;
  hasMore: boolean;
  offset: number;
  loaded: boolean;
  sessionPrefs: SessionPreferences;
}

const EMPTY_SESSION_PREFS: SessionPreferences = {
  likedCuisines: {},
  likedDifficulties: {},
  skippedCuisines: {},
  totalLikes: 0,
  totalSkips: 0,
};

const DISCOVER_INITIAL: DiscoverState = {
  recipes: [],
  currentIndex: 0,
  hasMore: true,
  offset: 0,
  loaded: false,
  sessionPrefs: { ...EMPTY_SESSION_PREFS },
};

export interface BrowseState {
  recipes: Recipe[];
  hasMore: boolean;
  offset: number;
  loaded: boolean;
}

const BROWSE_INITIAL: BrowseState = {
  recipes: [],
  hasMore: true,
  offset: 0,
  loaded: false,
};

export interface MyRecipesState {
  liked: Recipe[];
  saved: Recipe[];
  created: Recipe[];
  likedLoaded: boolean;
  savedLoaded: boolean;
  createdLoaded: boolean;
}

const MY_RECIPES_INITIAL: MyRecipesState = {
  liked: [],
  saved: [],
  created: [],
  likedLoaded: false,
  savedLoaded: false,
  createdLoaded: false,
};

/**
 * Score and reorder upcoming recipes based on session swipe behavior.
 * Only reorders recipes AFTER currentIndex to avoid disrupting the user's position.
 * Mixes boosted recipes with others to maintain variety.
 */
const reorderUpcoming = (recipes: Recipe[], currentIndex: number, prefs: SessionPreferences): Recipe[] => {
  if (prefs.totalLikes < 3) return recipes; // Need enough signal before reordering

  const seen = recipes.slice(0, currentIndex + 1);
  const upcoming = [...recipes.slice(currentIndex + 1)];

  // Score each upcoming recipe
  const scored = upcoming.map(recipe => {
    let score = 0;
    const cuisine = recipe.cuisine_type?.toLowerCase() || '';
    const difficulty = recipe.difficulty?.toLowerCase() || '';

    // Boost cuisines the user likes
    for (const [liked, count] of Object.entries(prefs.likedCuisines)) {
      if (cuisine === liked.toLowerCase()) {
        score += count * 2;
      }
    }

    // Slight penalty for cuisines the user skips a lot
    for (const [skipped, count] of Object.entries(prefs.skippedCuisines)) {
      if (cuisine === skipped.toLowerCase() && count >= 3) {
        score -= Math.min(count, 5);
      }
    }

    // Boost matching difficulty
    for (const [liked, count] of Object.entries(prefs.likedDifficulties)) {
      if (difficulty === liked.toLowerCase()) {
        score += count;
      }
    }

    return { recipe, score };
  });

  // Sort by score but interleave: take top scored, then one random, repeat
  // This prevents monotonous runs of the same cuisine
  scored.sort((a, b) => b.score - a.score);

  const reordered: Recipe[] = [];
  const boosted = scored.filter(s => s.score > 0);
  const neutral = scored.filter(s => s.score <= 0);
  let bIdx = 0;
  let nIdx = 0;

  while (bIdx < boosted.length || nIdx < neutral.length) {
    // Add 2 boosted, then 1 neutral for variety
    for (let i = 0; i < 2 && bIdx < boosted.length; i++) {
      reordered.push(boosted[bIdx++].recipe);
    }
    if (nIdx < neutral.length) {
      reordered.push(neutral[nIdx++].recipe);
    }
  }

  return [...seen, ...reordered];
};

const DiscoverTab: React.FC<{
  colors: ThemeColors;
  onViewRecipe: (recipe: Recipe) => void;
  dietaryRestrictions: string[];
  cuisinePreferences: string[];
  cookingSkill: string;
  discoverState: DiscoverState;
  setDiscoverState: React.Dispatch<React.SetStateAction<DiscoverState>>;
}> = ({ colors, onViewRecipe, dietaryRestrictions, cuisinePreferences, cookingSkill, discoverState, setDiscoverState }) => {
  const styles = createDiscoverStyles(colors);
  const [loading, setLoading] = useState(!discoverState.loaded);
  const [isInteracting, setIsInteracting] = useState(false);
  const [pantryMode, setPantryMode] = useState(false);
  const loadingMoreRef = useRef(false);
  const modeRef = useRef(false); // tracks current pantryMode to detect stale responses
  const INITIAL_SIZE = 10;
  const BATCH_SIZE = 50;

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const { recipes, currentIndex, hasMore } = discoverState;

  // Backend handles pantry filtering via use_pantry_items param — no client-side filter needed
  const filteredRecipes = recipes;

  const currentRecipe = filteredRecipes[currentIndex] || filteredRecipes[0];

  useEffect(() => {
    if (!discoverState.loaded) {
      loadRecipes();
    }
  }, []);

  // Reload recipes from backend when pantry mode toggles (server-side filtering)
  useEffect(() => {
    modeRef.current = pantryMode;
    if (discoverState.loaded) {
      loadingMoreRef.current = false; // cancel any in-flight background loads
      setDiscoverState(prev => ({ ...prev, recipes: [], currentIndex: 0, offset: 0, hasMore: true, loaded: false }));
      loadRecipes();
    }
  }, [pantryMode]);

  const buildFilters = (limit: number, offset: number) => {
    const filters: any = { limit, offset };
    if (dietaryRestrictions.length > 0) {
      filters.dietary_tags = dietaryRestrictions;
    }
    if (pantryMode) {
      filters.use_pantry_items = true;
    } else {
      // "For You" mode: pass user preferences for smarter suggestions
      if (cuisinePreferences.length > 0) {
        filters.cuisine_preferences = cuisinePreferences;
      }
      // Map cooking skill to max difficulty
      if (cookingSkill === 'beginner') {
        filters.max_difficulty = 'Easy';
      } else if (cookingSkill === 'intermediate') {
        filters.max_difficulty = 'Medium';
      }
    }
    return filters;
  };

  const loadRecipes = async () => {
    const requestMode = pantryMode; // capture mode at request time
    try {
      setLoading(true);
      const fetched = await recipeService.getRecipeFeed(buildFilters(INITIAL_SIZE, 0));
      // Drop response if mode changed while request was in-flight
      if (modeRef.current !== requestMode) return;
      setDiscoverState(prev => ({
        ...prev,
        recipes: fetched,
        currentIndex: 0,
        offset: fetched.length,
        hasMore: fetched.length >= INITIAL_SIZE,
        loaded: true,
      }));
    } catch (err) {
      console.error('Error loading discover recipes:', err);
    } finally {
      setLoading(false);
      // Silently load the next batch in the background
      if (modeRef.current === requestMode) {
        loadMoreRecipes(true);
      }
    }
  };

  const loadMoreRecipes = async (isInitialBackground = false) => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const requestMode = pantryMode; // capture mode at request time
    try {
      const currentOffset = isInitialBackground ? INITIAL_SIZE : discoverState.offset;
      const fetched = await recipeService.getRecipeFeed(buildFilters(BATCH_SIZE, currentOffset));
      // Drop response if mode changed while request was in-flight
      if (modeRef.current !== requestMode) return;
      if (fetched.length > 0) {
        setDiscoverState(prev => {
          // Deduplicate: only add recipes we haven't seen
          const existingIds = new Set(prev.recipes.map(r => r.id));
          const newRecipes = fetched.filter(r => !existingIds.has(r.id));
          const combined = [...prev.recipes, ...newRecipes];
          const reordered = prev.sessionPrefs.totalLikes >= 3
            ? reorderUpcoming(combined, prev.currentIndex, prev.sessionPrefs)
            : combined;
          return {
            ...prev,
            recipes: reordered,
            offset: prev.offset + fetched.length,
            hasMore: fetched.length >= BATCH_SIZE,
          };
        });
      } else {
        setDiscoverState(prev => ({ ...prev, hasMore: false }));
      }
    } catch (err) {
      console.error('Error loading more discover recipes:', err);
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const nextRecipe = () => {
    const nextIdx = currentIndex + 1;
    if (nextIdx < filteredRecipes.length) {
      // Pre-fetch more when 10 recipes away from the end (use full list length)
      if (nextIdx >= recipes.length - 10 && hasMore) {
        loadMoreRecipes();
      }
      // Update index while card is still off-screen, then fade in the new card
      setDiscoverState(prev => ({ ...prev, currentIndex: nextIdx }));
      // Reset position off-screen briefly, then animate to center
      translateX.setValue(0);
      translateY.setValue(0);
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start(() => setIsInteracting(false));
    } else if (hasMore) {
      translateX.setValue(0);
      translateY.setValue(0);
      setIsInteracting(false);
      loadMoreRecipes();
    } else {
      setDiscoverState(prev => ({ ...prev, currentIndex: 0 }));
      translateX.setValue(0);
      translateY.setValue(0);
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start(() => setIsInteracting(false));
    }
  };

  const recordPreference = (recipe: Recipe, action: 'like' | 'skip' | 'save') => {
    setDiscoverState(prev => {
      const prefs = { ...prev.sessionPrefs };
      const cuisine = recipe.cuisine_type || 'Unknown';
      const difficulty = recipe.difficulty || 'Medium';

      if (action === 'like' || action === 'save') {
        prefs.likedCuisines = { ...prefs.likedCuisines, [cuisine]: (prefs.likedCuisines[cuisine] || 0) + 1 };
        prefs.likedDifficulties = { ...prefs.likedDifficulties, [difficulty]: (prefs.likedDifficulties[difficulty] || 0) + 1 };
        prefs.totalLikes = prefs.totalLikes + 1;
      } else {
        prefs.skippedCuisines = { ...prefs.skippedCuisines, [cuisine]: (prefs.skippedCuisines[cuisine] || 0) + 1 };
        prefs.totalSkips = prefs.totalSkips + 1;
      }

      // Reorder upcoming recipes every 5 interactions
      const totalActions = prefs.totalLikes + prefs.totalSkips;
      if (totalActions >= 3 && totalActions % 5 === 0) {
        return { ...prev, sessionPrefs: prefs, recipes: reorderUpcoming(prev.recipes, prev.currentIndex, prefs) };
      }

      return { ...prev, sessionPrefs: prefs };
    });
  };

  const handleSwipeLeft = () => {
    if (isInteracting) return;
    setIsInteracting(true);
    if (currentRecipe) {
      recordPreference(currentRecipe, 'skip');
    }
    Animated.timing(translateX, {
      toValue: -500,
      duration: 200,
      useNativeDriver: true,
    }).start(() => nextRecipe());
  };

  const handleSwipeRight = () => {
    if (isInteracting) return;
    setIsInteracting(true);
    if (currentRecipe) {
      recipeService.likeRecipe(currentRecipe.id).catch(() => {});
      recordPreference(currentRecipe, 'like');
    }
    Animated.timing(translateX, {
      toValue: 500,
      duration: 200,
      useNativeDriver: true,
    }).start(() => nextRecipe());
  };

  const handleSwipeUp = () => {
    if (isInteracting) return;
    setIsInteracting(true);
    if (currentRecipe) {
      recipeService.saveRecipe(currentRecipe.id).catch(() => {});
      recordPreference(currentRecipe, 'save');
    }
    Animated.timing(translateY, {
      toValue: -500,
      duration: 200,
      useNativeDriver: true,
    }).start(() => nextRecipe());
  };

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX, translationY: translateY } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = ({ nativeEvent }: any) => {
    if (nativeEvent.state === State.END) {
      if (isInteracting) return;
      const { translationX: tx, translationY: ty } = nativeEvent;
      if (tx > 120) handleSwipeRight();
      else if (tx < -120) handleSwipeLeft();
      else if (ty < -120) handleSwipeUp();
      else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      }
    }
  };

  const rotate = translateX.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ['-10deg', '0deg', '10deg'],
  });

  const likeOpacity = translateX.interpolate({
    inputRange: [0, 120],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nopeOpacity = translateX.interpolate({
    inputRange: [-120, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const saveOpacity = translateY.interpolate({
    inputRange: [-120, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading recipes...</Text>
      </View>
    );
  }

  if (!currentRecipe || filteredRecipes.length === 0) {
    return (
      <View style={styles.centerContainer}>
        {/* Pantry Toggle - show even in empty state */}
        <View style={styles.pantryToggleRow}>
          <TouchableOpacity
            style={[styles.pantryToggle, !pantryMode && styles.pantryToggleActive]}
            onPress={() => setPantryMode(false)}
          >
            <Text style={[styles.pantryToggleText, !pantryMode && styles.pantryToggleTextActive]}>For You</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pantryToggle, pantryMode && styles.pantryToggleActive]}
            onPress={() => setPantryMode(true)}
          >
            <Text style={[styles.pantryToggleText, pantryMode && styles.pantryToggleTextActive]}>My Pantry</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.emptyIcon}>🍽️</Text>
        <Text style={styles.emptyTitle}>{pantryMode ? 'No Pantry Matches' : 'No Recipes to Discover'}</Text>
        <Text style={styles.emptySubtitle}>
          {pantryMode ? 'Add more items to your pantry or switch to All Recipes' : 'Check back later for new recipes!'}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadRecipes}>
          <Text style={styles.retryButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.cardContainer}>
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View
            style={[
              styles.card,
              {
                opacity,
                transform: [{ translateX }, { translateY }, { rotate }],
              },
            ]}
          >
            {/* Swipe Overlays */}
            <Animated.View style={[styles.overlayLabel, styles.likeLabel, { opacity: likeOpacity }]}>
              <Text style={styles.overlayText}>LIKE</Text>
            </Animated.View>
            <Animated.View style={[styles.overlayLabel, styles.nopeLabel, { opacity: nopeOpacity }]}>
              <Text style={styles.overlayText}>SKIP</Text>
            </Animated.View>
            <Animated.View style={[styles.overlayLabel, styles.saveLabel, { opacity: saveOpacity }]}>
              <Text style={styles.overlayText}>SAVE</Text>
            </Animated.View>

            <TouchableOpacity
              style={styles.imageContainer}
              activeOpacity={0.9}
              onPress={() => onViewRecipe(currentRecipe)}
            >
              <Image
                source={{ uri: currentRecipe.image_url || 'https://via.placeholder.com/400x300/FF6B35/FFFFFF?text=Recipe' }}
                style={styles.recipeImage}
              />

              {/* Pantry Mode Toggle - overlayed top right */}
              <View style={styles.pantryToggleRow}>
                <TouchableOpacity
                  style={[styles.pantryToggle, !pantryMode && styles.pantryToggleActive]}
                  onPress={() => setPantryMode(false)}
                >
                  <Text style={[styles.pantryToggleText, !pantryMode && styles.pantryToggleTextActive]}>For You</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pantryToggle, pantryMode && styles.pantryToggleActive]}
                  onPress={() => setPantryMode(true)}
                >
                  <Text style={[styles.pantryToggleText, pantryMode && styles.pantryToggleTextActive]}>My Pantry</Text>
                </TouchableOpacity>
              </View>

              {/* Recipe info overlay at bottom of card */}
              <View style={styles.imageOverlay}>
                <View style={styles.titleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recipeTitle} numberOfLines={1}>{currentRecipe.title}</Text>
                    <Text style={styles.recipeSubtitle}>{currentRecipe.cuisine_type}</Text>
                  </View>
                  <View style={styles.badgeRow}>
                    <Text style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(currentRecipe.difficulty, colors) }]}>
                      {currentRecipe.difficulty}
                    </Text>
                  </View>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>⏱️ {(currentRecipe.prep_time || 0) + (currentRecipe.cook_time || 0)} min</Text>
                  <Text style={styles.metaLabel}>👥 {currentRecipe.servings} servings</Text>
                  {currentRecipe.calories && (
                    <Text style={styles.metaLabel}>🔥 {currentRecipe.calories} cal</Text>
                  )}
                </View>
              </View>

              {/* Overlaid action buttons */}
              <View style={styles.actionButtons}>
                <View style={styles.actionButtonWrapper}>
                  <TouchableOpacity style={[styles.actionButton, styles.skipButton]} onPress={handleSwipeLeft}>
                    <Text style={styles.actionButtonText}>✕</Text>
                  </TouchableOpacity>
                  <Text style={styles.actionButtonLabel}>Skip</Text>
                </View>
                <View style={styles.actionButtonWrapper}>
                  <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={handleSwipeUp}>
                    <Text style={styles.actionButtonText}>📌</Text>
                  </TouchableOpacity>
                  <Text style={styles.actionButtonLabel}>Save</Text>
                </View>
                <View style={styles.actionButtonWrapper}>
                  <TouchableOpacity style={[styles.actionButton, styles.likeButton]} onPress={handleSwipeRight}>
                    <Text style={styles.actionButtonText}>❤️</Text>
                  </TouchableOpacity>
                  <Text style={styles.actionButtonLabel}>Like</Text>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </PanGestureHandler>
      </View>

    </View>
  );
};

// ============================================================
// BROWSE TAB - Grid view with filters
// ============================================================
const BrowseTab: React.FC<{
  colors: ThemeColors;
  onViewRecipe: (recipe: Recipe) => void;
  dietaryRestrictions: string[];
  onEditPreferences: () => void;
  browseState: BrowseState;
  setBrowseState: React.Dispatch<React.SetStateAction<BrowseState>>;
}> = ({ colors, onViewRecipe, dietaryRestrictions, onEditPreferences, browseState, setBrowseState }) => {
  const styles = createBrowseStyles(colors);
  const [recipes, setRecipes] = useState<Recipe[]>(browseState.recipes);
  const [loading, setLoading] = useState(!browseState.loaded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMealType, setActiveMealType] = useState<string | undefined>(undefined);
  const [expiringItems, setExpiringItems] = useState<PantryItem[]>([]);
  const [showExpiringBanner, setShowExpiringBanner] = useState(false);
  const [browseHasMore, setBrowseHasMore] = useState(browseState.hasMore);
  const browseOffsetRef = useRef(browseState.offset);
  const BROWSE_INITIAL_SIZE = 8;
  const BROWSE_BATCH = 40;

  const mealTypes = [
    { key: undefined, label: 'All' },
    { key: 'Breakfast', label: 'Breakfast' },
    { key: 'Lunch', label: 'Lunch' },
    { key: 'Dinner', label: 'Dinner' },
    { key: 'Snack', label: 'Snack' },
  ];

  // Sync local state back to parent for caching
  useEffect(() => {
    if (recipes.length > 0 && !searchQuery && !activeMealType) {
      setBrowseState({ recipes, hasMore: browseHasMore, offset: browseOffsetRef.current, loaded: true });
    }
  }, [recipes, browseHasMore]);

  const isDefaultView = !searchQuery && !activeMealType && dietaryRestrictions.length === 0;

  const loadRecipes = useCallback(async () => {
    // Skip fetch if we have cached data and no filters active
    if (browseState.loaded && !searchQuery && !activeMealType && dietaryRestrictions.length === 0 && recipes.length > 0) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      browseOffsetRef.current = 0;
      const result = await recipeService.getAllRecipes(
        BROWSE_INITIAL_SIZE, 0, searchQuery || undefined, activeMealType,
        dietaryRestrictions.length > 0 ? dietaryRestrictions : undefined
      );
      setRecipes(result);
      browseOffsetRef.current = result.length;
      setBrowseHasMore(result.length >= BROWSE_INITIAL_SIZE);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeMealType, dietaryRestrictions]);

  const loadMoreBrowse = useCallback(async () => {
    if (loadingMore || !browseHasMore) return;
    setLoadingMore(true);
    try {
      const result = await recipeService.getAllRecipes(
        BROWSE_BATCH, browseOffsetRef.current, searchQuery || undefined, activeMealType,
        dietaryRestrictions.length > 0 ? dietaryRestrictions : undefined
      );
      if (result.length > 0) {
        setRecipes(prev => [...prev, ...result]);
        browseOffsetRef.current += result.length;
        setBrowseHasMore(result.length >= BROWSE_BATCH);
      } else {
        setBrowseHasMore(false);
      }
    } catch (error) {
      console.error('Failed to load more recipes:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, browseHasMore, searchQuery, activeMealType, dietaryRestrictions]);

  const loadExpiringItems = async () => {
    try {
      const items = await pantryService.getExpiringItems(7);
      setExpiringItems(items);
      setShowExpiringBanner(items.length > 0);
    } catch {
      // silently fail - banner just won't show
    }
  };

  useEffect(() => {
    const debounce = setTimeout(async () => {
      await loadRecipes();
      // Silently load more in the background after initial load
      if (!browseState.loaded && browseHasMore) {
        loadMoreBrowse();
      }
    }, 300);
    return () => clearTimeout(debounce);
  }, [loadRecipes]);

  useEffect(() => {
    loadExpiringItems();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setBrowseHasMore(true);
    // Force refresh by temporarily clearing cached state
    setBrowseState(BROWSE_INITIAL);
    browseOffsetRef.current = 0;
    try {
      const result = await recipeService.getAllRecipes(
        BROWSE_INITIAL_SIZE, 0, searchQuery || undefined, activeMealType,
        dietaryRestrictions.length > 0 ? dietaryRestrictions : undefined
      );
      setRecipes(result);
      browseOffsetRef.current = result.length;
      setBrowseHasMore(result.length >= BROWSE_INITIAL_SIZE);
      await loadExpiringItems();
    } catch (error) {
      console.error('Failed to refresh recipes:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const renderRecipeCard = ({ item }: { item: Recipe }) => (
    <TouchableOpacity
      style={styles.recipeCard}
      onPress={() => onViewRecipe(item)}
      activeOpacity={0.7}
    >
      <View style={styles.recipeImageContainer}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.recipeImage} />
        ) : (
          <View style={styles.recipeImagePlaceholder}>
            <Text style={styles.placeholderEmoji}>
              {item.meal_type?.includes('Breakfast') ? '🍳' :
               item.meal_type?.includes('Lunch') ? '🥗' :
               item.meal_type?.includes('Dinner') ? '🍽️' : '🍴'}
            </Text>
          </View>
        )}
        {item.is_ai_generated && (
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>AI</Text>
          </View>
        )}
      </View>
      <View style={styles.recipeInfo}>
        <Text style={styles.recipeTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.recipeMeta}>
          {item.prep_time ? (
            <Text style={styles.recipeMetaText}>
              {item.prep_time + (item.cook_time || 0)} min
            </Text>
          ) : null}
          {item.difficulty ? (
            <Text style={styles.recipeMetaText}>{item.difficulty}</Text>
          ) : null}
        </View>
        {item.calories ? (
          <Text style={styles.calorieText}>{item.calories} cal/serving</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearButton}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Meal Type Filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {mealTypes.map((type) => (
            <TouchableOpacity
              key={type.label}
              style={[
                styles.filterChip,
                activeMealType === type.key && styles.filterChipActive,
              ]}
              onPress={() => setActiveMealType(type.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  activeMealType === type.key && styles.filterChipTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Dietary Preferences Indicator */}
      {dietaryRestrictions.length > 0 && (
        <TouchableOpacity style={styles.dietaryBanner} onPress={onEditPreferences}>
          <Text style={styles.dietaryBannerText}>
            Showing: {dietaryRestrictions.join(', ')}
          </Text>
          <Text style={styles.dietaryBannerLink}>Edit</Text>
        </TouchableOpacity>
      )}

      {/* Expiring Items Banner */}
      {showExpiringBanner && (
        <View style={styles.expiringBanner}>
          <View style={styles.expiringBannerContent}>
            <Text style={styles.expiringBannerIcon}>⚠️</Text>
            <View style={styles.expiringBannerText}>
              <Text style={styles.expiringBannerTitle}>
                {expiringItems.length} item{expiringItems.length !== 1 ? 's' : ''} expiring soon
              </Text>
              <Text style={styles.expiringBannerSubtitle}>
                {expiringItems.slice(0, 3).map(i => i.item_name).join(', ')}
                {expiringItems.length > 3 ? ` +${expiringItems.length - 3} more` : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.expiringBannerDismiss}
            onPress={() => setShowExpiringBanner(false)}
          >
            <Text style={styles.expiringBannerDismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recipe Grid */}
      {loading && recipes.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : recipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>No recipes found</Text>
          <Text style={styles.emptySubtext}>
            {searchQuery ? 'Try a different search term' : 'Recipes will appear here as they are added'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          renderItem={renderRecipeCard}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.recipeGrid}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMoreBrowse}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: 16 }} />
          ) : null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
};

// ============================================================
// MY RECIPES TAB - Created / Saved / Liked
// ============================================================
const MyRecipesTab: React.FC<{
  colors: ThemeColors;
  onViewRecipe: (recipe: Recipe) => void;
  myRecipesState: MyRecipesState;
  setMyRecipesState: React.Dispatch<React.SetStateAction<MyRecipesState>>;
}> = ({ colors, onViewRecipe, myRecipesState, setMyRecipesState }) => {
  const styles = createMyRecipesStyles(colors);
  const [subTab, setSubTab] = useState<MyRecipesSubTab>('liked');
  const [recipes, setRecipes] = useState<Recipe[]>(myRecipesState[subTab] || []);
  const [loading, setLoading] = useState(!myRecipesState[`${subTab}Loaded` as keyof MyRecipesState]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadRecipes = useCallback(async (forceRefresh = false) => {
    const loadedKey = `${subTab}Loaded` as 'likedLoaded' | 'savedLoaded' | 'createdLoaded';
    const cached = myRecipesState[subTab] as Recipe[];
    const isLoaded = myRecipesState[loadedKey] as boolean;

    // Use cache if available and not forcing refresh
    if (!forceRefresh && isLoaded && cached.length > 0) {
      setRecipes(cached);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      let data: Recipe[];
      switch (subTab) {
        case 'created':
          const allMyRecipes = await recipeService.getMyRecipes(50);
          data = allMyRecipes.filter(r => !r.is_ai_generated);
          break;
        case 'saved':
          data = await recipeService.getSavedRecipes(50);
          break;
        case 'liked':
          data = await recipeService.getLikedRecipes(50);
          break;
      }
      setRecipes(data);
      // Cache in parent
      setMyRecipesState(prev => ({ ...prev, [subTab]: data, [loadedKey]: true }));
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoading(false);
    }
  }, [subTab, myRecipesState]);

  useEffect(() => {
    loadRecipes();
  }, [subTab]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRecipes(true);
    setRefreshing(false);
  };

  const handleDeleteRecipe = (recipe: Recipe) => {
    Alert.alert(
      'Delete Recipe',
      `Are you sure you want to delete "${recipe.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await recipeService.deleteRecipe(recipe.id);
              setRecipes(prev => prev.filter(r => r.id !== recipe.id));
              setMyRecipesState(prev => ({ ...prev, created: prev.created.filter(r => r.id !== recipe.id) }));
            } catch {
              Alert.alert('Error', 'Failed to delete recipe');
            }
          },
        },
      ]
    );
  };

  const handleUnsave = async (recipe: Recipe) => {
    try {
      await recipeService.unsaveRecipe(recipe.id);
      setRecipes(prev => prev.filter(r => r.id !== recipe.id));
      setMyRecipesState(prev => ({ ...prev, saved: prev.saved.filter(r => r.id !== recipe.id) }));
    } catch {
      Alert.alert('Error', 'Failed to remove recipe');
    }
  };

  const handleUnlike = async (recipe: Recipe) => {
    try {
      await recipeService.unlikeRecipe(recipe.id);
      setRecipes(prev => prev.filter(r => r.id !== recipe.id));
      setMyRecipesState(prev => ({ ...prev, liked: prev.liked.filter(r => r.id !== recipe.id) }));
    } catch {
      Alert.alert('Error', 'Failed to unlike recipe');
    }
  };

  const handleClearAllLiked = () => {
    if (recipes.length === 0) return;
    Alert.alert(
      'Clear All Liked',
      `Remove all ${recipes.length} liked recipes?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const recipe of recipes) {
                await recipeService.unlikeRecipe(recipe.id);
              }
              setRecipes([]);
              setMyRecipesState(prev => ({ ...prev, liked: [] }));
            } catch {
              Alert.alert('Error', 'Failed to clear liked recipes');
            }
          },
        },
      ]
    );
  };

  const subTabs: { key: MyRecipesSubTab; label: string; icon: string }[] = [
    { key: 'liked', label: 'Liked', icon: '❤️' },
    { key: 'saved', label: 'Saved', icon: '📌' },
    { key: 'created', label: 'Created', icon: '📝' },
  ];

  const filteredRecipes = React.useMemo(() => {
    if (!searchQuery.trim()) return recipes;
    const q = searchQuery.toLowerCase();
    return recipes.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.cuisine_type?.toLowerCase().includes(q)
    );
  }, [recipes, searchQuery]);

  const renderRecipeCard = ({ item }: { item: Recipe }) => (
    <TouchableOpacity
      style={styles.recipeCard}
      onPress={() => onViewRecipe(item)}
      activeOpacity={0.7}
      onLongPress={() => {
        if (subTab === 'created') {
          Alert.alert(item.title, '', [
            { text: 'Delete', style: 'destructive', onPress: () => handleDeleteRecipe(item) },
            { text: 'Cancel', style: 'cancel' },
          ]);
        } else if (subTab === 'saved') {
          Alert.alert(item.title, '', [
            { text: 'Unsave', style: 'destructive', onPress: () => handleUnsave(item) },
            { text: 'Cancel', style: 'cancel' },
          ]);
        } else if (subTab === 'liked') {
          Alert.alert(item.title, '', [
            { text: 'Unlike', style: 'destructive', onPress: () => handleUnlike(item) },
            { text: 'Cancel', style: 'cancel' },
          ]);
        }
      }}
    >
      <View style={styles.recipeImageContainer}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.recipeImage} />
        ) : (
          <View style={styles.recipeImagePlaceholder}>
            <Text style={styles.placeholderEmoji}>
              {item.meal_type?.includes('Breakfast') ? '🍳' :
               item.meal_type?.includes('Lunch') ? '🥗' :
               item.meal_type?.includes('Dinner') ? '🍽️' : '🍴'}
            </Text>
          </View>
        )}
        {item.is_ai_generated && (
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>AI</Text>
          </View>
        )}
      </View>
      <View style={styles.recipeInfo}>
        <Text style={styles.recipeTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.recipeMeta}>
          {item.prep_time ? (
            <Text style={styles.recipeMetaText}>
              {item.prep_time + (item.cook_time || 0)} min
            </Text>
          ) : null}
          {item.difficulty ? (
            <Text style={styles.recipeMetaText}>{item.difficulty}</Text>
          ) : null}
        </View>
        {item.calories ? (
          <Text style={styles.calorieText}>{item.calories} cal/serving</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search my recipes..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearButton}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Sub-tabs */}
      <View style={styles.subTabContainer}>
        <View style={{ flexDirection: 'row', flex: 1 }}>
          {subTabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.subTab, subTab === tab.key && styles.subTabActive]}
              onPress={() => setSubTab(tab.key)}
            >
              <Text style={styles.subTabIcon}>{tab.icon}</Text>
              <Text style={[styles.subTabText, subTab === tab.key && styles.subTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {subTab === 'liked' && recipes.length > 0 && (
          <TouchableOpacity onPress={handleClearAllLiked} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, color: colors.error, fontWeight: '500' }}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Recipe Grid */}
      {loading && recipes.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredRecipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          {searchQuery.trim() ? (
            <>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>No results found</Text>
              <Text style={styles.emptySubtitle}>Try a different search term</Text>
            </>
          ) : (
            <>
              <Text style={styles.emptyIcon}>
                {subTab === 'liked' ? '❤️' : subTab === 'saved' ? '📌' : '📖'}
              </Text>
              <Text style={styles.emptyTitle}>
                {subTab === 'liked' ? 'No Liked Recipes' :
                 subTab === 'saved' ? 'No Saved Recipes' : 'No Recipes Created'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {subTab === 'liked' ? 'Like recipes from Discover to see them here' :
                 subTab === 'saved' ? 'Save recipes from Discover to find them here' :
                 'Tap the + button to create your first recipe!'}
              </Text>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredRecipes}
          renderItem={renderRecipeCard}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.recipeGrid}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
};

// ============================================================
// MAIN RECIPE HUB SCREEN
// ============================================================
export const RecipeHubScreen: React.FC = () => {
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const styles = createHubStyles(colors);
  const [activeTab, setActiveTab] = useState<TabMode>('discover');
  const [discoverState, setDiscoverState] = useState<DiscoverState>(DISCOVER_INITIAL);
  const [browseState, setBrowseState] = useState<BrowseState>(BROWSE_INITIAL);
  const [myRecipesState, setMyRecipesState] = useState<MyRecipesState>(MY_RECIPES_INITIAL);

  const dietaryRestrictions = user?.profile_data?.preferences?.dietary_restrictions || [];
  const cuisinePreferences = user?.profile_data?.preferences?.cuisine_preferences || [];
  const cookingSkill = user?.profile_data?.preferences?.cooking_skill || 'intermediate';

  const tabs: { key: TabMode; label: string }[] = [
    { key: 'discover', label: 'Discover' },
    { key: 'browse', label: 'Browse' },
    { key: 'myrecipes', label: 'My Recipes' },
  ];

  const handleViewRecipe = (recipe: Recipe) => {
    navigation.navigate('RecipeDetail', { recipe });
  };

  const handleCreateRecipe = () => {
    navigation.navigate('CreateRecipe');
  };

  const handleEditPreferences = () => {
    navigation.navigate('Profile', { screen: 'EditPreferences' });
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Recipes</Text>
          <TouchableOpacity style={styles.addButton} onPress={handleCreateRecipe}>
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {activeTab === 'discover' && (
            <DiscoverTab colors={colors} onViewRecipe={handleViewRecipe} dietaryRestrictions={dietaryRestrictions} cuisinePreferences={cuisinePreferences} cookingSkill={cookingSkill} discoverState={discoverState} setDiscoverState={setDiscoverState} />
          )}
          {activeTab === 'browse' && (
            <BrowseTab colors={colors} onViewRecipe={handleViewRecipe} dietaryRestrictions={dietaryRestrictions} onEditPreferences={handleEditPreferences} browseState={browseState} setBrowseState={setBrowseState} />
          )}
          {activeTab === 'myrecipes' && (
            <MyRecipesTab colors={colors} onViewRecipe={handleViewRecipe} myRecipesState={myRecipesState} setMyRecipesState={setMyRecipesState} />
          )}
        </View>

      </View>
    </GestureHandlerRootView>
  );
};

// ============================================================
// STYLES
// ============================================================

const createHubStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: Platform.OS === 'ios' ? 60 : 16,
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
    addButtonText: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.backgroundSecondary,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundSecondary,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textMuted,
    },
    tabTextActive: {
      color: colors.primary,
    },
    content: {
      flex: 1,
    },
  });

const createDiscoverStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    pantryToggleRow: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      backgroundColor: colors.overlay,
      borderRadius: 16,
      padding: 2,
      zIndex: 10,
    },
    pantryToggle: {
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 14,
    },
    pantryToggleActive: {
      backgroundColor: colors.primary,
    },
    pantryToggleText: {
      fontSize: 12,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.7)',
    },
    pantryToggleTextActive: {
      color: '#FFFFFF',
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.textMuted,
    },
    emptyIcon: {
      fontSize: 64,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 20,
    },
    retryButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    retryButtonText: {
      color: colors.buttonText,
      fontSize: 16,
      fontWeight: '600',
    },
    cardContainer: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingTop: 4,
      paddingBottom: 4,
    },
    card: {
      width: screenWidth - 20,
      flex: 1,
      borderRadius: 20,
      backgroundColor: colors.card,
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.15,
          shadowRadius: 20,
        },
        android: { elevation: 10 },
      }),
    },
    imageContainer: {
      flex: 1,
      borderRadius: 20,
      overflow: 'hidden',
    },
    recipeImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    imageOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 100,
      backgroundColor: colors.overlay,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    recipeTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: '#FFFFFF',
    },
    recipeSubtitle: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.8)',
      marginTop: 2,
    },
    metaRow: {
      flexDirection: 'row',
      gap: 14,
    },
    metaLabel: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.9)',
    },
    badgeRow: {
      flexDirection: 'row',
      gap: 8,
      marginLeft: 8,
      marginTop: 2,
    },
    difficultyBadge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 10,
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
      overflow: 'hidden',
    },
    actionButtons: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 14,
      gap: 32,
    },
    actionButtonWrapper: {
      alignItems: 'center',
      gap: 4,
    },
    actionButton: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.3)',
    },
    actionButtonLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.9)',
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    skipButton: {
      backgroundColor: colors.error + 'D9',
    },
    saveButton: {
      backgroundColor: colors.warning + 'D9',
    },
    likeButton: {
      backgroundColor: colors.success + 'D9',
    },
    actionButtonText: {
      fontSize: 20,
    },
    overlayLabel: {
      position: 'absolute',
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 12,
      borderWidth: 4,
      zIndex: 100,
    },
    likeLabel: {
      top: '35%',
      right: 30,
      borderColor: colors.success,
      backgroundColor: colors.success + '99',
      transform: [{ rotate: '15deg' }],
    },
    nopeLabel: {
      top: '35%',
      left: 30,
      borderColor: colors.error,
      backgroundColor: colors.error + '99',
      transform: [{ rotate: '-15deg' }],
    },
    saveLabel: {
      top: '25%',
      alignSelf: 'center',
      borderColor: colors.warning,
      backgroundColor: colors.warning + '99',
    },
    overlayText: {
      fontSize: 32,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: 4,
      textShadowColor: 'rgba(0, 0, 0, 0.9)',
      textShadowOffset: { width: 2, height: 2 },
      textShadowRadius: 4,
    },
  });

const createBrowseStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 10,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 10,
      paddingHorizontal: 10,
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
    clearButton: {
      fontSize: 16,
      color: colors.textMuted,
      padding: 4,
    },
    filterContainer: {
      gap: 8,
    },
    filterChip: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 8,
    },
    filterChipActive: {
      backgroundColor: colors.primary + '20',
      borderColor: colors.primary,
    },
    filterChipText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textMuted,
    },
    filterChipTextActive: {
      color: colors.primary,
    },
    dietaryBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.primary + '12',
      marginHorizontal: 16,
      marginBottom: 8,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    dietaryBannerText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '500',
      flex: 1,
    },
    dietaryBannerLink: {
      fontSize: 13,
      color: colors.primary,
      fontWeight: '600',
      marginLeft: 8,
    },
    expiringBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.warningLight,
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    expiringBannerContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    expiringBannerIcon: {
      fontSize: 20,
      marginRight: 10,
    },
    expiringBannerText: {
      flex: 1,
    },
    expiringBannerTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.warningDark,
      marginBottom: 2,
    },
    expiringBannerSubtitle: {
      fontSize: 12,
      color: colors.warningDark,
    },
    expiringBannerDismiss: {
      padding: 4,
      marginLeft: 8,
    },
    expiringBannerDismissText: {
      fontSize: 14,
      color: colors.warningDark,
    },
    loadingContainer: {
      paddingTop: 80,
      alignItems: 'center',
    },
    emptyContainer: {
      paddingTop: 60,
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 12,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
    },
    recipeGrid: {
      paddingHorizontal: 12,
      paddingBottom: 80,
    },
    gridRow: {
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    recipeCard: {
      width: (screenWidth - 40) / 2,
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
    recipeImageContainer: {
      height: 120,
      backgroundColor: colors.border,
    },
    recipeImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    recipeImagePlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    placeholderEmoji: {
      fontSize: 40,
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
    recipeInfo: {
      padding: 10,
    },
    recipeTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
      lineHeight: 19,
    },
    recipeMeta: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 2,
    },
    recipeMetaText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    calorieText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
  });

const createMyRecipesStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 10,
      paddingHorizontal: 10,
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
    clearButton: {
      fontSize: 16,
      color: colors.textMuted,
      padding: 4,
    },
    subTabContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 8,
    },
    subTab: {
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
    subTabActive: {
      backgroundColor: colors.primary + '15',
      borderColor: colors.primary,
    },
    subTabIcon: {
      fontSize: 14,
    },
    subTabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
    },
    subTabTextActive: {
      color: colors.primary,
    },
    loadingContainer: {
      paddingTop: 80,
      alignItems: 'center',
    },
    emptyContainer: {
      paddingTop: 60,
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    recipeGrid: {
      paddingHorizontal: 12,
      paddingBottom: 80,
    },
    gridRow: {
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    recipeCard: {
      width: (screenWidth - 40) / 2,
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
    recipeImageContainer: {
      height: 120,
      backgroundColor: colors.border,
    },
    recipeImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    recipeImagePlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    placeholderEmoji: {
      fontSize: 40,
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
    recipeInfo: {
      padding: 10,
    },
    recipeTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
      lineHeight: 19,
    },
    recipeMeta: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 2,
    },
    recipeMetaText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    calorieText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
  });
