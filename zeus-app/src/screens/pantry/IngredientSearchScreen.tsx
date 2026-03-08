import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { pantryService } from '../../services/pantryService';
import { IngredientLibraryItem, PantryCategory, PantryItem } from '../../types/pantry';
import { useThemeStore } from '../../store/themeStore';

const CATEGORY_EMOJIS: Record<PantryCategory, string> = {
  Produce: '🥬', Dairy: '🥛', Protein: '🍗', Grains: '🌾',
  Spices: '🌶️', Condiments: '🧂', Beverages: '☕', Frozen: '🧊',
  'Canned & Jarred': '🥫', Baking: '🧁', 'Oils & Vinegars': '🫒', Snacks: '🍿', Other: '📦',
};

export const IngredientSearchScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useThemeStore();
  const styles = createStyles(colors);
  const searchInputRef = useRef<TextInput>(null);

  const [searchText, setSearchText] = useState('');
  const [ingredients, setIngredients] = useState<IngredientLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pantryItemNames, setPantryItemNames] = useState<Set<string>>(new Set());
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [addingItem, setAddingItem] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load pantry items and default suggestions together on mount
  useEffect(() => {
    const initializeData = async () => {
      try {
        setLoading(true);
        // Load both in parallel
        const [pantryItems, defaultIngredients] = await Promise.all([
          pantryService.getPantryItems(),
          pantryService.searchIngredients('', undefined, 50),
        ]);

        const names = new Set(pantryItems.map((item: PantryItem) => item.item_name.toLowerCase()));
        setPantryItemNames(names);
        setIngredients(defaultIngredients);
      } catch (error: any) {
        console.error('Failed to initialize:', error?.response?.status, error?.response?.data, error?.message);
      } finally {
        setLoading(false);
      }
    };
    initializeData();
  }, []);

  // Auto-focus search bar
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const loadIngredients = async (query: string) => {
    try {
      const results = await pantryService.searchIngredients(query, undefined, 50);
      setIngredients(results);
    } catch {
      // Silently ignore - likely a cancelled request from rapid typing
    }
  };

  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      loadIngredients(text);
    }, 200);
  }, []);

  const handleAddItem = async (ingredient: IngredientLibraryItem) => {
    if (addingItem) return;
    setAddingItem(ingredient.id);

    try {
      const defaultUnit = ingredient.common_units?.[0] || 'pieces';
      await pantryService.createPantryItem({
        item_name: ingredient.name,
        quantity: 1,
        unit: defaultUnit,
        category: ingredient.category,
      });

      setAddedItems(prev => new Set(prev).add(ingredient.name.toLowerCase()));
      setPantryItemNames(prev => new Set(prev).add(ingredient.name.toLowerCase()));
    } catch (error) {
      console.error('Failed to add item:', error);
    } finally {
      setAddingItem(null);
    }
  };

  const isInPantry = (name: string) => {
    const lower = name.toLowerCase();
    return pantryItemNames.has(lower) || addedItems.has(lower);
  };

  const filteredIngredients = ingredients.filter(item => !isInPantry(item.name));

  const renderIngredient = ({ item }: { item: IngredientLibraryItem }) => {
    const alreadyAdded = addedItems.has(item.name.toLowerCase());
    const isAdding = addingItem === item.id;

    return (
      <View style={styles.ingredientRow}>
        <View style={styles.ingredientInfo}>
          <Text style={styles.ingredientEmoji}>
            {CATEGORY_EMOJIS[item.category] || '📦'}
          </Text>
          <View style={styles.ingredientTextContainer}>
            <Text style={styles.ingredientName}>{item.name}</Text>
            <Text style={styles.ingredientCategory}>{item.category}</Text>
          </View>
        </View>

        {alreadyAdded ? (
          <View style={styles.addedBadge}>
            <Text style={styles.addedIcon}>✓</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addItemButton}
            onPress={() => handleAddItem(item)}
            disabled={isAdding}
            activeOpacity={0.6}
          >
            {isAdding ? (
              <ActivityIndicator size="small" color={colors.buttonText} />
            ) : (
              <Text style={styles.addItemButtonText}>+</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.6}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Ingredients</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search ingredients..."
            placeholderTextColor={colors.textMuted}
            value={searchText}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchText('');
                loadIngredients('');
              }}
              activeOpacity={0.6}
            >
              <Text style={styles.clearButton}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredIngredients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyText}>
            {searchText
              ? 'No matching ingredients found'
              : 'All ingredients are already in your pantry!'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredIngredients}
          keyExtractor={(item) => item.id}
          renderItem={renderIngredient}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Platform.OS === 'ios' ? 60 : 16,
      paddingBottom: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backButtonText: {
      fontSize: 20,
      color: colors.text,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.primary,
    },
    headerSpacer: {
      width: 36,
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.backgroundSecondary,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 12 : 8,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    searchIcon: {
      fontSize: 16,
      marginRight: 10,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      padding: 0,
    },
    clearButton: {
      fontSize: 16,
      color: colors.textMuted,
      paddingLeft: 8,
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
      paddingHorizontal: 40,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 16,
    },
    emptyText: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
    },
    listContent: {
      paddingBottom: 40,
    },
    ingredientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
    },
    ingredientInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    ingredientEmoji: {
      fontSize: 24,
      marginRight: 12,
    },
    ingredientTextContainer: {
      flex: 1,
    },
    ingredientName: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 2,
    },
    ingredientCategory: {
      fontSize: 12,
      color: colors.textMuted,
    },
    addItemButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    addItemButtonText: {
      fontSize: 22,
      fontWeight: '600',
      color: colors.buttonText,
      lineHeight: 24,
    },
    addedBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.success + '20',
      justifyContent: 'center',
      alignItems: 'center',
    },
    addedIcon: {
      fontSize: 18,
      color: colors.success,
      fontWeight: '700',
    },
  });
