import React, { useState, useEffect, useCallback } from 'react';
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
import { recipeService } from '../services/recipeService';
import { Recipe } from '../types/recipe';

interface RecipeBrowserProps {
  onSelectRecipe: (recipe: Recipe) => void;
  selectedRecipe: Recipe | null;
  filterMealType?: 'breakfast' | 'lunch' | 'dinner';
}

export const RecipeBrowser: React.FC<RecipeBrowserProps> = ({
  onSelectRecipe,
  selectedRecipe,
  filterMealType,
}) => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMealType, setActiveMealType] = useState<string | undefined>(filterMealType);
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const result = await recipeService.getAllRecipes(
        50,
        0,
        searchQuery || undefined,
        activeMealType
      );
      setRecipes(result);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeMealType]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadRecipes();
    }, 300);
    return () => clearTimeout(debounce);
  }, [loadRecipes]);

  const mealTypes = [
    { key: undefined, label: 'All' },
    { key: 'Breakfast', label: 'Breakfast' },
    { key: 'Lunch', label: 'Lunch' },
    { key: 'Dinner', label: 'Dinner' },
  ];

  const renderRecipeCard = ({ item }: { item: Recipe }) => {
    const isSelected = selectedRecipe?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.recipeCard, isSelected && styles.recipeCardSelected]}
        onPress={() => onSelectRecipe(item)}
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
          <View style={styles.recipeMetaRow}>
            {item.calories && (
              <Text style={styles.recipeMeta}>{item.calories} cal/serving</Text>
            )}
            {item.protein_grams && (
              <Text style={styles.recipeMeta}>{item.protein_grams}g protein</Text>
            )}
          </View>
          {item.prep_time && (
            <Text style={styles.recipeTime}>{item.prep_time + (item.cook_time || 0)} min</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

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
      <View style={styles.filterContainer}>
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
      ) : recipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>No recipes found</Text>
          <Text style={styles.emptySubtext}>
            {searchQuery ? 'Try a different search term' : 'Create some recipes first!'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
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
    borderRadius: 16,
    overflow: 'hidden',
  },
  searchContainer: {
    padding: 12,
    paddingBottom: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
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
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.primary,
  },
  loadingContainer: {
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  recipeList: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  recipeCard: {
    width: 140,
    marginRight: 12,
    backgroundColor: colors.background,
    borderRadius: 12,
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
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  selectedBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  recipeImageContainer: {
    height: 90,
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
    fontSize: 32,
  },
  recipeInfo: {
    padding: 10,
  },
  recipeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    lineHeight: 18,
  },
  recipeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  recipeMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  recipeTime: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
