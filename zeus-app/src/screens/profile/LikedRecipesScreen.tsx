import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { recipeService } from '../../services/recipeService';
import { Recipe } from '../../types/recipe';

export const LikedRecipesScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLikedRecipes();
  }, []);

  const loadLikedRecipes = async () => {
    try {
      setLoading(true);
      setError(null);
      const likedRecipes = await recipeService.getLikedRecipes();
      setRecipes(likedRecipes);
    } catch (err: any) {
      setError(err.message || 'Failed to load liked recipes');
      console.error('Error loading liked recipes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlike = async (recipe: Recipe) => {
    Alert.alert(
      'Unlike Recipe',
      `Remove "${recipe.title}" from your liked recipes?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlike',
          style: 'destructive',
          onPress: async () => {
            try {
              await recipeService.unlikeRecipe(recipe.id);
              // Remove from local state immediately for better UX
              setRecipes(recipes.filter(r => r.id !== recipe.id));
            } catch (err: any) {
              console.error('Error unliking recipe:', err);
              Alert.alert('Error', 'Failed to unlike recipe. Please try again.');
            }
          },
        },
      ]
    );
  };

  const renderRecipeCard = ({ item }: { item: Recipe }) => (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardTouchable}>
        {item.image_url && (
          <Image source={{ uri: item.image_url }} style={styles.image} />
        )}
        <View style={styles.cardContent}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.metaText}>⏱️ {(item.prep_time || 0) + (item.cook_time || 0)} min</Text>
            <Text style={styles.metaText}>❤️ {item.likes_count || 0}</Text>
            <Text style={styles.metaText}>{item.difficulty}</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Unlike button */}
      <TouchableOpacity
        style={styles.unlikeButton}
        onPress={() => handleUnlike(item)}
      >
        <Text style={styles.unlikeButtonText}>💔</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={styles.loadingText}>Loading liked recipes...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>❌</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadLikedRecipes}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Liked Recipes</Text>
        <View style={styles.backButton} />
      </View>

      {recipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💔</Text>
          <Text style={styles.emptyTitle}>No Liked Recipes Yet</Text>
          <Text style={styles.emptyText}>
            Start exploring and like recipes you love!
          </Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          renderItem={renderRecipeCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={loadLikedRecipes}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 36,
    color: '#2C3E50',
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF8F0',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#7F8C8D',
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#E74C3C',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#7F8C8D',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  cardTouchable: {
    width: '100%',
  },
  image: {
    width: '100%',
    height: 200,
    backgroundColor: '#E1E8ED',
  },
  cardContent: {
    padding: 16,
  },
  unlikeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  unlikeButtonText: {
    fontSize: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#7F8C8D',
    marginBottom: 12,
  },
  meta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaText: {
    fontSize: 12,
    color: '#7F8C8D',
  },
});
