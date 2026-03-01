import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { recipeService } from '../../services/recipeService';
import { Recipe } from '../../types/recipe';
import { useThemeStore } from '../../store/themeStore';

const MEAL_TYPES = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'];

export const MyRecipesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useThemeStore();
  const styles = createStyles(colors);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMealType, setSelectedMealType] = useState('All');

  const loadRecipes = async () => {
    try {
      setLoading(true);
      const mealType = selectedMealType === 'All' ? undefined : selectedMealType;
      const search = searchQuery.trim() || undefined;
      const data = await recipeService.getMyRecipes(50, 0, search, mealType);
      setRecipes(data);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecipes();
  }, [selectedMealType, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [selectedMealType, searchQuery])
  );

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
            } catch (error) {
              Alert.alert('Error', 'Failed to delete recipe');
            }
          },
        },
      ]
    );
  };

  const renderRecipeCard = ({ item }: { item: Recipe }) => (
    <TouchableOpacity
      style={styles.recipeCard}
      onPress={() => navigation.navigate('RecipeDetail', { recipe: item })}
      onLongPress={() => {
        Alert.alert(
          item.title,
          'What would you like to do?',
          [
            {
              text: 'Edit',
              onPress: () => navigation.navigate('EditRecipe', { recipe: item }),
            },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => handleDeleteRecipe(item),
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }}
    >
      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.recipeTitle} numberOfLines={1}>{item.title}</Text>
            {item.description ? (
              <Text style={styles.recipeDescription} numberOfLines={2}>{item.description}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.moreButton}
            onPress={() => {
              Alert.alert(
                item.title,
                '',
                [
                  {
                    text: 'Edit',
                    onPress: () => navigation.navigate('EditRecipe', { recipe: item }),
                  },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => handleDeleteRecipe(item),
                  },
                  { text: 'Cancel', style: 'cancel' },
                ]
              );
            }}
          >
            <Text style={styles.moreButtonText}>•••</Text>
          </TouchableOpacity>
        </View>

        {/* Tags row */}
        <View style={styles.tagsRow}>
          {item.is_ai_generated && (
            <View style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.tagText, { color: colors.primary }]}>AI</Text>
            </View>
          )}
          {item.meal_type?.map((type, i) => (
            <View key={i} style={styles.tag}>
              <Text style={styles.tagText}>{type}</Text>
            </View>
          ))}
          {item.dietary_tags?.slice(0, 2).map((tag, i) => (
            <View key={`d-${i}`} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {/* Details row */}
        <View style={styles.detailsRow}>
          {item.prep_time ? (
            <Text style={styles.detailChip}>{item.prep_time} min</Text>
          ) : null}
          {item.difficulty ? (
            <Text style={styles.detailChip}>{item.difficulty}</Text>
          ) : null}
          {item.cuisine_type ? (
            <Text style={styles.detailChip}>{item.cuisine_type}</Text>
          ) : null}
          <View style={{ flex: 1 }} />
          {item.calories ? (
            <Text style={styles.calorieText}>{item.calories} cal</Text>
          ) : null}
          {item.protein_grams ? (
            <Text style={styles.proteinText}>{item.protein_grams}g protein</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>📖</Text>
      <Text style={styles.emptyStateTitle}>No Recipes Yet</Text>
      <Text style={styles.emptyStateText}>
        {searchQuery || selectedMealType !== 'All'
          ? 'No recipes match your filters. Try adjusting your search.'
          : 'Create your first recipe or generate one with AI!'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Recipes</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{recipes.length}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search recipes..."
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Meal type filters */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {MEAL_TYPES.map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.filterPill, selectedMealType === type && styles.filterPillActive]}
              onPress={() => setSelectedMealType(type)}
            >
              <Text style={[styles.filterPillText, selectedMealType === type && styles.filterPillTextActive]}>
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Recipe list */}
      {loading && recipes.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={recipes}
          renderItem={renderRecipeCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContainer,
            recipes.length === 0 && styles.emptyListContainer,
          ]}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
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
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backButtonText: {
      fontSize: 24,
      color: colors.text,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    countBadge: {
      width: 40,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary + '20',
      justifyContent: 'center',
      alignItems: 'center',
    },
    countText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
      backgroundColor: colors.backgroundSecondary,
    },
    searchInput: {
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 15,
      color: colors.text,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    filterContainer: {
      backgroundColor: colors.backgroundSecondary,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    filterScroll: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 8,
    },
    filterPill: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    filterPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterPillText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textMuted,
    },
    filterPillTextActive: {
      color: '#fff',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContainer: {
      padding: 16,
    },
    emptyListContainer: {
      flex: 1,
    },
    recipeCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 16,
      marginBottom: 14,
      ...Platform.select({
        ios: {
          shadowColor: colors.shadow,
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
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
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
    moreButton: {
      width: 36,
      height: 36,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 8,
    },
    moreButtonText: {
      fontSize: 18,
      color: colors.textMuted,
      fontWeight: '700',
      letterSpacing: 2,
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
    proteinText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    emptyStateIcon: {
      fontSize: 64,
      marginBottom: 16,
    },
    emptyStateTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 8,
    },
    emptyStateText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
    },
  });
