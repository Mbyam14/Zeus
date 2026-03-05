import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useThemeStore, ThemeColors } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { recipeService } from '../services/recipeService';
import { Recipe } from '../types/recipe';

interface RecipeBrowserProps {
  onSelectRecipe: (recipe: Recipe | null) => void;
  selectedRecipe: Recipe | null;
  filterMealType?: 'breakfast' | 'lunch' | 'dinner';
  /** Pre-loaded recipes to filter client-side (avoids API calls on filter change) */
  recipes?: Recipe[];
  onSearchChange?: (query: string) => void;
}

export const RecipeBrowser: React.FC<RecipeBrowserProps> = ({
  onSelectRecipe,
  selectedRecipe,
  filterMealType,
  recipes: preloadedRecipes,
  onSearchChange,
}) => {
  const [apiRecipes, setApiRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(!preloadedRecipes);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMealType, setActiveMealType] = useState<string | undefined>(filterMealType);
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const styles = createStyles(colors);

  const dietaryRestrictions = user?.profile_data?.preferences?.dietary_restrictions || [];
  const isClientSide = !!preloadedRecipes;

  // Only fetch from API if no pre-loaded recipes
  const loadRecipes = useCallback(async () => {
    if (isClientSide) return;
    try {
      setLoading(true);
      const result = await recipeService.getAllRecipes(
        50,
        0,
        searchQuery || undefined,
        activeMealType,
        dietaryRestrictions.length > 0 ? dietaryRestrictions : undefined
      );
      setApiRecipes(result);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeMealType, isClientSide]);

  useEffect(() => {
    if (isClientSide) return;
    const debounce = setTimeout(() => {
      loadRecipes();
    }, 300);
    return () => clearTimeout(debounce);
  }, [loadRecipes, isClientSide]);

  // Client-side filtering (instant, no API calls)
  const filteredRecipes = useMemo(() => {
    if (!isClientSide) return apiRecipes;

    let filtered = preloadedRecipes!;

    if (activeMealType) {
      filtered = filtered.filter(r =>
        r.meal_type?.some(mt => mt.toLowerCase() === activeMealType.toLowerCase())
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.cuisine_type?.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [isClientSide, preloadedRecipes, apiRecipes, activeMealType, searchQuery]);

  const mealTypes = [
    { key: undefined, label: 'All' },
    { key: 'Breakfast', label: 'Breakfast' },
    { key: 'Lunch', label: 'Lunch' },
    { key: 'Dinner', label: 'Dinner' },
  ];

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    onSearchChange?.(text);
  };

  const renderRecipeCard = ({ item }: { item: Recipe }) => {
    const isSelected = selectedRecipe?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.recipeCard, isSelected && styles.recipeCardSelected]}
        onPress={() => isSelected ? onSelectRecipe(null) : onSelectRecipe(item)}
        activeOpacity={0.7}
      >
        {isSelected && (
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedBadgeText}>✓</Text>
          </View>
        )}
        <View style={styles.recipeImageContainer}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.recipeImage} />
          ) : (
            <View style={styles.recipeImagePlaceholder}>
              <Text style={styles.recipeImagePlaceholderText}>
                {item.meal_type?.includes('Breakfast') ? '🍳' :
                 item.meal_type?.includes('Lunch') ? '🥗' :
                 item.meal_type?.includes('Dinner') ? '🍽️' : '🍴'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.recipeInfo}>
          <Text style={styles.recipeTitle} numberOfLines={2}>{item.title}</Text>
          {item.calories && (
            <Text style={styles.recipeMeta}>{item.calories} cal/serving</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search + Filters in one row */}
      <View style={styles.controlsRow}>
        <View style={styles.searchInputContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearchChange}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')}>
              <Text style={styles.clearButton}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
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
      </View>

      {/* Recipe List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : filteredRecipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No recipes found</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRecipes}
          renderItem={renderRecipeCard}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recipeList}
        />
      )}
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 0,
  },
  clearButton: {
    fontSize: 14,
    color: colors.textMuted,
    padding: 2,
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.primary,
  },
  loadingContainer: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  recipeList: {
    paddingHorizontal: 10,
    paddingBottom: 14,
  },
  recipeCard: {
    width: 120,
    marginRight: 10,
    backgroundColor: colors.background,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  recipeCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  selectedBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  recipeImageContainer: {
    height: 70,
    backgroundColor: colors.borderLight,
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
    backgroundColor: colors.borderLight,
  },
  recipeImagePlaceholderText: {
    fontSize: 24,
  },
  recipeInfo: {
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 6,
  },
  recipeTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
    lineHeight: 14,
  },
  recipeMeta: {
    fontSize: 10,
    color: colors.textMuted,
  },
});
