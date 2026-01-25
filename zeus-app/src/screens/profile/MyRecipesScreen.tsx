import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { recipeService } from '../../services/recipeService';
import { Recipe } from '../../types/recipe';
import { useThemeStore } from '../../store/themeStore';

export const MyRecipesScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useThemeStore();
  const styles = createStyles(colors);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      setLoading(true);
      const data = await recipeService.getMyRecipes(50, 0);
      setRecipes(data);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRecipes();
    setRefreshing(false);
  };

  const renderRecipeCard = ({ item }: { item: Recipe }) => (
    <TouchableOpacity style={styles.recipeCard}>
      <View style={styles.recipeInfo}>
        <Text style={styles.recipeTitle}>{item.title}</Text>
        {item.description && (
          <Text style={styles.recipeDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.recipeDetails}>
          {item.prep_time && (
            <View style={styles.detailItem}>
              <Text style={styles.detailIcon}>⏱️</Text>
              <Text style={styles.detailText}>{item.prep_time} min</Text>
            </View>
          )}
          {item.difficulty && (
            <View style={styles.detailItem}>
              <Text style={styles.detailIcon}>📊</Text>
              <Text style={styles.detailText}>{item.difficulty}</Text>
            </View>
          )}
          {item.cuisine_type && (
            <View style={styles.detailItem}>
              <Text style={styles.detailIcon}>🌍</Text>
              <Text style={styles.detailText}>{item.cuisine_type}</Text>
            </View>
          )}
        </View>

        {item.calories && (
          <View style={styles.macrosContainer}>
            <View style={styles.macroItem}>
              <Text style={styles.macroValue}>{item.calories}</Text>
              <Text style={styles.macroLabel}>cal</Text>
            </View>
            {item.protein_grams && (
              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{item.protein_grams}g</Text>
                <Text style={styles.macroLabel}>protein</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>📝</Text>
      <Text style={styles.emptyStateTitle}>No Recipes Yet</Text>
      <Text style={styles.emptyStateText}>
        Start creating recipes to see them here!
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Recipes</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Recipes</Text>
        <View style={styles.backButton} />
      </View>

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
            tintColor="#FF6B35"
          />
        }
      />
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
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backButtonText: {
      fontSize: 28,
      color: colors.text,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
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
      borderRadius: 12,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    recipeInfo: {
      padding: 16,
    },
    recipeTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 8,
    },
    recipeDescription: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 12,
      lineHeight: 20,
    },
    recipeDetails: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 12,
    },
    detailItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 16,
      marginBottom: 4,
    },
    detailIcon: {
      fontSize: 14,
      marginRight: 4,
    },
    detailText: {
      fontSize: 14,
      color: colors.textMuted,
    },
    macrosContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    macroItem: {
      marginRight: 16,
      marginBottom: 4,
    },
    macroValue: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.primary,
    },
    macroLabel: {
      fontSize: 12,
      color: colors.textMuted,
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
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 8,
    },
    emptyStateText: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 24,
    },
  });
