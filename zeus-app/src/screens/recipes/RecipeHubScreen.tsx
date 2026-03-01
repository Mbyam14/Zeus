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
import { PantryItem } from '../../types/pantry';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type TabMode = 'discover' | 'browse' | 'myrecipes';
type MyRecipesSubTab = 'created' | 'saved' | 'liked';

// ============================================================
// DISCOVER TAB - Swipe-based recipe discovery
// ============================================================
const DiscoverTab: React.FC<{
  colors: ThemeColors;
  onViewRecipe: (recipe: Recipe) => void;
}> = ({ colors, onViewRecipe }) => {
  const styles = createDiscoverStyles(colors);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const currentRecipe = recipes[currentIndex];

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      setLoading(true);
      const fetched = await recipeService.getRecipeFeed();
      setRecipes(fetched.length > 0 ? fetched : []);
    } catch (err) {
      console.error('Error loading discover recipes:', err);
    } finally {
      setLoading(false);
    }
  };

  const nextRecipe = () => {
    translateX.setValue(0);
    translateY.setValue(0);
    setIsInteracting(false);
    if (currentIndex < recipes.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  const handleSwipeLeft = () => {
    if (isInteracting) return;
    setIsInteracting(true);
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

  if (!currentRecipe || recipes.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyIcon}>🍽️</Text>
        <Text style={styles.emptyTitle}>No Recipes to Discover</Text>
        <Text style={styles.emptySubtitle}>Check back later for new recipes!</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadRecipes}>
          <Text style={styles.retryButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return '#2ECC71';
      case 'Medium': return '#F7B32B';
      case 'Hard': return '#E74C3C';
      default: return '#7F8C8D';
    }
  };

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
              <View style={styles.imageOverlay}>
                <Text style={styles.recipeTitle}>{currentRecipe.title}</Text>
                <Text style={styles.recipeSubtitle}>{currentRecipe.cuisine_type}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>⏱️ {currentRecipe.prep_time}m prep</Text>
                  <Text style={styles.metaLabel}>🔥 {currentRecipe.cook_time}m cook</Text>
                  <Text style={styles.metaLabel}>👥 {currentRecipe.servings}</Text>
                </View>
                <View style={styles.badgeRow}>
                  <Text style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(currentRecipe.difficulty) }]}>
                    {currentRecipe.difficulty}
                  </Text>
                  {currentRecipe.is_ai_generated && (
                    <Text style={[styles.difficultyBadge, { backgroundColor: colors.secondary }]}>AI</Text>
                  )}
                </View>
                {currentRecipe.description ? (
                  <Text style={styles.description} numberOfLines={2}>{currentRecipe.description}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          </Animated.View>
        </PanGestureHandler>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.error }]} onPress={handleSwipeLeft}>
          <Text style={styles.actionButtonText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.warning }]} onPress={handleSwipeUp}>
          <Text style={styles.actionButtonText}>🔖</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.success }]} onPress={handleSwipeRight}>
          <Text style={styles.actionButtonText}>❤️</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hintText}>Swipe right to like, left to skip, up to save</Text>
    </View>
  );
};

// ============================================================
// BROWSE TAB - Grid view with filters
// ============================================================
const BrowseTab: React.FC<{
  colors: ThemeColors;
  onViewRecipe: (recipe: Recipe) => void;
}> = ({ colors, onViewRecipe }) => {
  const styles = createBrowseStyles(colors);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMealType, setActiveMealType] = useState<string | undefined>(undefined);
  const [expiringItems, setExpiringItems] = useState<PantryItem[]>([]);
  const [showExpiringBanner, setShowExpiringBanner] = useState(false);

  const mealTypes = [
    { key: undefined, label: 'All' },
    { key: 'Breakfast', label: 'Breakfast' },
    { key: 'Lunch', label: 'Lunch' },
    { key: 'Dinner', label: 'Dinner' },
    { key: 'Snack', label: 'Snack' },
  ];

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const result = await recipeService.getAllRecipes(50, 0, searchQuery || undefined, activeMealType);
      setRecipes(result);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeMealType]);

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
    const debounce = setTimeout(() => loadRecipes(), 300);
    return () => clearTimeout(debounce);
  }, [loadRecipes]);

  useEffect(() => {
    loadExpiringItems();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadRecipes(), loadExpiringItems()]);
    setRefreshing(false);
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
          <Text style={styles.searchIcon}>🔍</Text>
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
}> = ({ colors, onViewRecipe }) => {
  const styles = createMyRecipesStyles(colors);
  const [subTab, setSubTab] = useState<MyRecipesSubTab>('created');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecipes = useCallback(async () => {
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
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoading(false);
    }
  }, [subTab]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRecipes();
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
    } catch {
      Alert.alert('Error', 'Failed to remove recipe');
    }
  };

  const subTabs: { key: MyRecipesSubTab; label: string; icon: string }[] = [
    { key: 'created', label: 'Created', icon: '📝' },
    { key: 'saved', label: 'Saved', icon: '🔖' },
    { key: 'liked', label: 'Liked', icon: '❤️' },
  ];

  const renderRecipeCard = ({ item }: { item: Recipe }) => (
    <TouchableOpacity
      style={styles.recipeCard}
      onPress={() => onViewRecipe(item)}
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
        }
      }}
    >
      <View style={styles.cardContent}>
        <View style={{ flex: 1 }}>
          <Text style={styles.recipeTitle} numberOfLines={1}>{item.title}</Text>
          {item.description ? (
            <Text style={styles.recipeDescription} numberOfLines={2}>{item.description}</Text>
          ) : null}
        </View>
        <View style={styles.tagsRow}>
          {item.is_ai_generated && (
            <View style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.tagText, { color: colors.primary }]}>AI</Text>
            </View>
          )}
          {item.meal_type?.slice(0, 2).map((type, i) => (
            <View key={i} style={styles.tag}>
              <Text style={styles.tagText}>{type}</Text>
            </View>
          ))}
        </View>
        <View style={styles.detailsRow}>
          {item.prep_time ? <Text style={styles.detailChip}>{item.prep_time} min</Text> : null}
          {item.difficulty ? <Text style={styles.detailChip}>{item.difficulty}</Text> : null}
          {item.cuisine_type ? <Text style={styles.detailChip}>{item.cuisine_type}</Text> : null}
          <View style={{ flex: 1 }} />
          {item.calories ? <Text style={styles.calorieText}>{item.calories} cal/serving</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Sub-tabs */}
      <View style={styles.subTabContainer}>
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

      {/* Recipe List */}
      {loading && recipes.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : recipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>
            {subTab === 'created' ? '📖' : subTab === 'saved' ? '🔖' : '❤️'}
          </Text>
          <Text style={styles.emptyTitle}>
            {subTab === 'created' ? 'No Recipes Created' :
             subTab === 'saved' ? 'No Saved Recipes' : 'No Liked Recipes'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {subTab === 'created' ? 'Tap the + button to create your first recipe!' :
             subTab === 'saved' ? 'Save recipes from Discover to find them here' :
             'Like recipes from Discover to see them here'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          renderItem={renderRecipeCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
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
  const navigation = useNavigation<any>();
  const styles = createHubStyles(colors);
  const [activeTab, setActiveTab] = useState<TabMode>('discover');

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
            <DiscoverTab colors={colors} onViewRecipe={handleViewRecipe} />
          )}
          {activeTab === 'browse' && (
            <BrowseTab colors={colors} onViewRecipe={handleViewRecipe} />
          )}
          {activeTab === 'myrecipes' && (
            <MyRecipesTab colors={colors} onViewRecipe={handleViewRecipe} />
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
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    cardContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    card: {
      width: screenWidth - 32,
      height: screenHeight * 0.50,
      borderRadius: 16,
      backgroundColor: colors.card,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.1,
          shadowRadius: 16,
        },
        android: { elevation: 8 },
      }),
    },
    imageContainer: {
      flex: 1,
      borderRadius: 16,
      overflow: 'hidden',
    },
    recipeImage: {
      width: '100%',
      height: '100%',
    },
    imageOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: 20,
    },
    recipeTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#FFFFFF',
      marginBottom: 4,
    },
    recipeSubtitle: {
      fontSize: 16,
      color: '#F8F9FA',
      marginBottom: 12,
    },
    metaRow: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 8,
    },
    metaLabel: {
      fontSize: 13,
      color: '#F8F9FA',
    },
    badgeRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
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
    description: {
      fontSize: 14,
      color: '#F8F9FA',
      lineHeight: 20,
    },
    actionButtons: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 16,
      gap: 24,
    },
    actionButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
        },
        android: { elevation: 4 },
      }),
    },
    actionButtonText: {
      fontSize: 22,
    },
    hintText: {
      textAlign: 'center',
      fontSize: 12,
      color: colors.textMuted,
      paddingBottom: 8,
    },
    overlayLabel: {
      position: 'absolute',
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 16,
      borderWidth: 5,
      zIndex: 100,
    },
    likeLabel: {
      top: 50,
      right: 24,
      borderColor: '#2ECC71',
      backgroundColor: 'rgba(46, 204, 113, 0.5)',
      transform: [{ rotate: '20deg' }],
    },
    nopeLabel: {
      top: 50,
      left: 24,
      borderColor: '#E74C3C',
      backgroundColor: 'rgba(231, 76, 60, 0.5)',
      transform: [{ rotate: '-20deg' }],
    },
    saveLabel: {
      top: 50,
      alignSelf: 'center',
      borderColor: '#F7B32B',
      backgroundColor: 'rgba(247, 179, 43, 0.5)',
    },
    overlayText: {
      fontSize: 40,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: 6,
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
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.inputBackground || colors.backgroundSecondary,
      borderRadius: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchIcon: {
      fontSize: 16,
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
    },
    clearButton: {
      fontSize: 16,
      color: colors.textMuted,
      padding: 4,
    },
    filterContainer: {
      paddingHorizontal: 16,
      paddingBottom: 12,
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
    expiringBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FFF3E0',
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#FFE0B2',
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
      color: '#E65100',
      marginBottom: 2,
    },
    expiringBannerSubtitle: {
      fontSize: 12,
      color: '#BF360C',
    },
    expiringBannerDismiss: {
      padding: 4,
      marginLeft: 8,
    },
    expiringBannerDismissText: {
      fontSize: 14,
      color: '#BF360C',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
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
          shadowColor: '#000',
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
      color: '#FFF',
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
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    emptyIcon: {
      fontSize: 56,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    listContainer: {
      padding: 16,
      paddingBottom: 80,
    },
    recipeCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 16,
      marginBottom: 14,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        },
        android: { elevation: 2 },
      }),
    },
    cardContent: {
      padding: 16,
    },
    recipeTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    recipeDescription: {
      fontSize: 14,
      color: colors.textMuted,
      lineHeight: 20,
      marginBottom: 8,
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10,
    },
    tag: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.background,
    },
    tagText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textMuted,
    },
    detailsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    detailChip: {
      fontSize: 13,
      color: colors.textMuted,
    },
    calorieText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
  });
