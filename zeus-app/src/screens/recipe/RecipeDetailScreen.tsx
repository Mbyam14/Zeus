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
import { useThemeStore } from '../../store/themeStore';

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
  const { colors } = useThemeStore();
  const styles = createStyles(colors);
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

          {/* Nutrition/Macros */}
          {(recipe.calories || recipe.protein_grams || recipe.carbs_grams || recipe.fat_grams) && (
            <View style={styles.macrosSection}>
              <Text style={styles.macrosTitle}>Nutrition per Serving</Text>
              {recipe.serving_size && (
                <Text style={styles.servingSize}>Serving: {recipe.serving_size}</Text>
              )}
              <View style={styles.macrosRow}>
                {recipe.calories && (
                  <View style={styles.macroCard}>
                    <Text style={styles.macroIcon}>🔥</Text>
                    <Text style={styles.macroValue}>{recipe.calories}</Text>
                    <Text style={styles.macroLabel}>Calories</Text>
                  </View>
                )}
                {recipe.protein_grams && (
                  <View style={styles.macroCard}>
                    <Text style={styles.macroIcon}>💪</Text>
                    <Text style={styles.macroValue}>{recipe.protein_grams}g</Text>
                    <Text style={styles.macroLabel}>Protein</Text>
                  </View>
                )}
                {recipe.carbs_grams && (
                  <View style={styles.macroCard}>
                    <Text style={styles.macroIcon}>🍞</Text>
                    <Text style={styles.macroValue}>{recipe.carbs_grams}g</Text>
                    <Text style={styles.macroLabel}>Carbs</Text>
                  </View>
                )}
                {recipe.fat_grams && (
                  <View style={styles.macroCard}>
                    <Text style={styles.macroIcon}>🥑</Text>
                    <Text style={styles.macroValue}>{recipe.fat_grams}g</Text>
                    <Text style={styles.macroLabel}>Fat</Text>
                  </View>
                )}
              </View>
            </View>
          )}

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
            {recipe.ingredients && recipe.ingredients.length > 0 ? (
              recipe.ingredients.map((ingredient, index) => (
                <View key={index} style={styles.ingredientItem}>
                  <View style={styles.ingredientBullet} />
                  <Text style={styles.ingredientText}>
                    {ingredient.quantity} {ingredient.unit} {ingredient.name}
                  </Text>
                </View>
              ))
            ) : (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionIcon}>📝</Text>
                <Text style={styles.emptySectionTitle}>Ingredients Not Available</Text>
                <Text style={styles.emptySectionText}>
                  This is a quick-generated meal plan recipe. Full ingredient details will be available when you generate the complete recipe.
                </Text>
              </View>
            )}
          </View>

          {/* Instructions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            {recipe.instructions && recipe.instructions.length > 0 ? (
              recipe.instructions.map((instruction, index) => (
                <View key={index} style={styles.instructionItem}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{instruction.step}</Text>
                  </View>
                  <Text style={styles.instructionText}>{instruction.instruction}</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionIcon}>👨‍🍳</Text>
                <Text style={styles.emptySectionTitle}>Instructions Not Available</Text>
                <Text style={styles.emptySectionText}>
                  Cooking steps will be available when the full recipe is generated. Use the description and nutrition info above as a guide for now.
                </Text>
              </View>
            )}
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

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
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
      color: colors.text,
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
      backgroundColor: colors.background,
    },
    content: {
      padding: 24,
      backgroundColor: colors.backgroundSecondary,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 16,
    },
    creatorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    creatorAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
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
      color: colors.text,
    },
    creatorSubtext: {
      fontSize: 14,
      color: colors.textMuted,
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
      color: colors.text,
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
      color: colors.text,
      marginBottom: 16,
    },
    description: {
      fontSize: 16,
      color: colors.text,
      lineHeight: 24,
    },
    tagsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tag: {
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dietaryTag: {
      backgroundColor: '#E8F5E9',
      borderColor: '#2ECC71',
    },
    tagText: {
      fontSize: 14,
      color: colors.text,
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
      backgroundColor: colors.primary,
      marginRight: 12,
    },
    ingredientText: {
      fontSize: 16,
      color: colors.text,
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
      backgroundColor: colors.primary,
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
      color: colors.text,
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
      backgroundColor: colors.primary,
    },
    shareButton: {
      backgroundColor: colors.secondary,
    },
    actionButtonIcon: {
      fontSize: 18,
    },
    actionButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    macrosSection: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
    },
    macrosTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 8,
    },
    servingSize: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 12,
    },
    macrosRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      gap: 8,
    },
    macroCard: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    macroIcon: {
      fontSize: 20,
      marginBottom: 4,
    },
    macroValue: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 2,
    },
    macroLabel: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '500',
    },
    emptySection: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    emptySectionIcon: {
      fontSize: 40,
      marginBottom: 12,
    },
    emptySectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    emptySectionText: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
