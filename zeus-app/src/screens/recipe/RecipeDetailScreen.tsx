import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Recipe } from '../../types/recipe';

interface RecipeDetailScreenProps {
  route: {
    params: {
      recipe: Recipe;
    };
  };
  navigation: any;
}

export const RecipeDetailScreen: React.FC<RecipeDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const { recipe } = route.params;

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return '#2ECC71';
      case 'Medium':
        return '#F7B32B';
      case 'Hard':
        return '#E74C3C';
      default:
        return '#7F8C8D';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Header with Back Button */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerActionButton}>
              <Text style={styles.headerActionText}>🔖</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerActionButton}>
              <Text style={styles.headerActionText}>⋯</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recipe Image */}
        <Image
          source={{
            uri: recipe.image_url || 'https://via.placeholder.com/400x300/FF6B35/FFFFFF?text=Recipe',
          }}
          style={styles.image}
        />

        {/* Recipe Header */}
        <View style={styles.content}>
          <Text style={styles.title}>{recipe.title}</Text>

          {/* Creator Info */}
          <View style={styles.creatorRow}>
            <View style={styles.creatorAvatar}>
              <Text style={styles.creatorAvatarText}>
                {recipe.creator_username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={styles.creatorInfo}>
              <Text style={styles.creatorName}>@{recipe.creator_username}</Text>
              <Text style={styles.creatorSubtext}>
                {new Date(recipe.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>⏱️</Text>
              <Text style={styles.statText}>
                {(recipe.prep_time || 0) + (recipe.cook_time || 0)}m
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>👥</Text>
              <Text style={styles.statText}>{recipe.servings} servings</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>❤️</Text>
              <Text style={styles.statText}>{recipe.likes_count}</Text>
            </View>
            <View
              style={[
                styles.difficultyBadge,
                { backgroundColor: getDifficultyColor(recipe.difficulty) },
              ]}
            >
              <Text style={styles.difficultyText}>{recipe.difficulty}</Text>
            </View>
          </View>

          {/* Description */}
          {recipe.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.description}>{recipe.description}</Text>
            </View>
          )}

          {/* Tags */}
          {(recipe.meal_type.length > 0 || recipe.dietary_tags.length > 0) && (
            <View style={styles.section}>
              <View style={styles.tagsContainer}>
                {recipe.meal_type.map((type, index) => (
                  <View key={`meal-${index}`} style={styles.tag}>
                    <Text style={styles.tagText}>{type}</Text>
                  </View>
                ))}
                {recipe.dietary_tags.map((tag, index) => (
                  <View key={`dietary-${index}`} style={[styles.tag, styles.dietaryTag]}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Ingredients */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            {recipe.ingredients.map((ingredient, index) => (
              <View key={index} style={styles.ingredientItem}>
                <View style={styles.ingredientBullet} />
                <Text style={styles.ingredientText}>
                  {ingredient.quantity} {ingredient.unit} {ingredient.name}
                </Text>
              </View>
            ))}
          </View>

          {/* Instructions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            {recipe.instructions.map((instruction, index) => (
              <View key={index} style={styles.instructionItem}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{instruction.step}</Text>
                </View>
                <Text style={styles.instructionText}>{instruction.instruction}</Text>
              </View>
            ))}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity style={[styles.actionButton, styles.addToPlanButton]}>
              <Text style={styles.actionButtonIcon}>📅</Text>
              <Text style={styles.actionButtonText}>Add to Meal Plan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.shareButton]}>
              <Text style={styles.actionButtonIcon}>🔗</Text>
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: '#2C3E50',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActionText: {
    fontSize: 20,
  },
  image: {
    width: '100%',
    height: 300,
    backgroundColor: '#F8F9FA',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  creatorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  creatorAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  creatorInfo: {
    flex: 1,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
  },
  creatorSubtext: {
    fontSize: 14,
    color: '#7F8C8D',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    fontSize: 16,
  },
  statText: {
    fontSize: 14,
    color: '#2C3E50',
    fontWeight: '500',
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 'auto',
  },
  difficultyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#2C3E50',
    lineHeight: 24,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E1E8ED',
  },
  dietaryTag: {
    backgroundColor: '#E8F5E9',
    borderColor: '#2ECC71',
  },
  tagText: {
    fontSize: 14,
    color: '#2C3E50',
    fontWeight: '500',
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ingredientBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6B35',
    marginRight: 12,
  },
  ingredientText: {
    fontSize: 16,
    color: '#2C3E50',
    flex: 1,
  },
  instructionItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  instructionText: {
    flex: 1,
    fontSize: 16,
    color: '#2C3E50',
    lineHeight: 24,
    paddingTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  addToPlanButton: {
    backgroundColor: '#FF6B35',
  },
  shareButton: {
    backgroundColor: '#004E89',
  },
  actionButtonIcon: {
    fontSize: 18,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
