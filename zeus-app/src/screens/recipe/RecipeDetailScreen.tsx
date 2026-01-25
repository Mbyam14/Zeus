import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  Dimensions,
  Animated,
  PanResponder,
  Share,
  Alert,
  Clipboard,
} from 'react-native';
import { Recipe } from '../../types/recipe';
import { useThemeStore } from '../../store/themeStore';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SWIPE_THRESHOLD = 30;

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

  // Recipe action state
  const [isSaved, setIsSaved] = useState(recipe.is_saved || false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  // Cooking mode state
  const [cookingMode, setCookingMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);

  // Use ref to track current step for panResponder (avoids stale closure)
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;

  // Slide animation for smooth transitions
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [isAnimating, setIsAnimating] = useState(false);

  const animateToStep = (direction: 'next' | 'prev') => {
    if (isAnimating) return;

    const step = currentStepRef.current;
    const totalSteps = recipe.instructions?.length || 0;

    const canGoNext = direction === 'next' && step < totalSteps - 1;
    const canGoPrev = direction === 'prev' && step > 0;

    if (!canGoNext && !canGoPrev) return;

    setIsAnimating(true);

    // Slide out
    Animated.timing(slideAnim, {
      toValue: direction === 'next' ? -screenWidth : screenWidth,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      // Update step
      if (direction === 'next') {
        setCurrentStep(step + 1);
      } else {
        setCurrentStep(step - 1);
      }

      // Reset to opposite side (off-screen)
      slideAnim.setValue(direction === 'next' ? screenWidth : -screenWidth);

      // Slide in
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setIsAnimating(false);
      });
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy * 2);
      },
      onPanResponderRelease: (_, gestureState) => {
        const isSwipe = Math.abs(gestureState.dx) > 40 || Math.abs(gestureState.vx) > 0.5;

        if (isSwipe) {
          if (gestureState.dx > 0 || gestureState.vx > 0.5) {
            animateToStep('prev');
          } else {
            animateToStep('next');
          }
        }
      },
    })
  ).current;

  const startCookingMode = () => {
    setCurrentStep(0);
    setShowIngredients(false);
    setCookingMode(true);
  };

  const exitCookingMode = () => {
    setCookingMode(false);
    setShowIngredients(false);
  };

  const goToNextStep = () => {
    animateToStep('next');
  };

  const goToPreviousStep = () => {
    animateToStep('prev');
  };

  const handleSaveToggle = () => {
    setIsSaved(!isSaved);
    // TODO: Call API to save/unsave recipe
  };

  const handleShare = () => {
    setShowOptionsMenu(false);

    // Build share message with recipe details
    const ingredients = recipe.ingredients?.map(i => `• ${i.quantity} ${i.unit} ${i.name}`).join('\n') || '';
    const shareMessage = `🍳 ${recipe.title}

${recipe.description || ''}

⏱️ Prep: ${recipe.prep_time || 0}min | Cook: ${recipe.cook_time || 0}min
👥 Servings: ${recipe.servings}

${ingredients ? `📝 Ingredients:\n${ingredients}` : ''}

Shared from Zeus - Your AI Meal Planner`;

    // Delay to let the options menu close first
    setTimeout(() => {
      Alert.alert(
        'Share Recipe',
        'How would you like to share?',
        [
          {
            text: 'Copy to Clipboard',
            onPress: () => {
              Clipboard.setString(shareMessage);
              Alert.alert('Copied!', 'Recipe copied to clipboard.');
            },
          },
          {
            text: 'Share',
            onPress: async () => {
              try {
                await Share.share({
                  message: shareMessage,
                  title: recipe.title,
                });
              } catch (error: any) {
                Alert.alert('Share Failed', error.message || 'Could not share recipe.');
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }, 300);
  };

  const handleAddToMealPlan = () => {
    setShowOptionsMenu(false);
    Alert.alert('Add to Meal Plan', 'This feature is coming soon!');
    // TODO: Navigate to meal plan selector
  };

  const handlePrint = () => {
    setShowOptionsMenu(false);
    Alert.alert('Print Recipe', 'This feature is coming soon!');
  };

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
        <View style={[styles.headerBar, !recipe.image_url && styles.headerBarNoImage]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerActionButton, isSaved && styles.headerActionButtonActive]}
              onPress={handleSaveToggle}
            >
              <Text style={styles.headerActionText}>{isSaved ? '🔖' : '📑'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionButton}
              onPress={() => setShowOptionsMenu(true)}
            >
              <Text style={styles.headerActionText}>•••</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recipe Image - only show if image exists */}
        {recipe.image_url && (
          <Image
            source={{ uri: recipe.image_url }}
            style={styles.image}
          />
        )}

        {/* Recipe Header */}
        <View style={[styles.content, !recipe.image_url && styles.contentNoImage]}>
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
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Instructions</Text>
              {recipe.instructions && recipe.instructions.length > 0 && (
                <TouchableOpacity
                  style={styles.startCookingButton}
                  onPress={startCookingMode}
                >
                  <Text style={styles.startCookingIcon}>👨‍🍳</Text>
                  <Text style={styles.startCookingText}>Start Cooking</Text>
                </TouchableOpacity>
              )}
            </View>
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

      {/* Options Menu Modal */}
      <Modal
        visible={showOptionsMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <TouchableOpacity
          style={styles.optionsOverlay}
          activeOpacity={1}
          onPress={() => setShowOptionsMenu(false)}
        >
          <View style={styles.optionsMenu}>
            <Text style={styles.optionsMenuTitle}>{recipe.title}</Text>

            <TouchableOpacity style={styles.optionsMenuItem} onPress={handleSaveToggle}>
              <Text style={styles.optionsMenuIcon}>{isSaved ? '🔖' : '📑'}</Text>
              <Text style={styles.optionsMenuText}>{isSaved ? 'Remove from Saved' : 'Save Recipe'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionsMenuItem} onPress={handleShare}>
              <Text style={styles.optionsMenuIcon}>📤</Text>
              <Text style={styles.optionsMenuText}>Share Recipe</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionsMenuItem} onPress={handleAddToMealPlan}>
              <Text style={styles.optionsMenuIcon}>📅</Text>
              <Text style={styles.optionsMenuText}>Add to Meal Plan</Text>
            </TouchableOpacity>

            {recipe.instructions && recipe.instructions.length > 0 && (
              <TouchableOpacity
                style={styles.optionsMenuItem}
                onPress={() => {
                  setShowOptionsMenu(false);
                  startCookingMode();
                }}
              >
                <Text style={styles.optionsMenuIcon}>👨‍🍳</Text>
                <Text style={styles.optionsMenuText}>Start Cooking Mode</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.optionsMenuItem} onPress={handlePrint}>
              <Text style={styles.optionsMenuIcon}>🖨️</Text>
              <Text style={styles.optionsMenuText}>Print Recipe</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionsMenuItem, styles.optionsMenuCancel]}
              onPress={() => setShowOptionsMenu(false)}
            >
              <Text style={styles.optionsMenuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Step-by-Step Cooking Mode Modal */}
      <Modal
        visible={cookingMode}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={exitCookingMode}
      >
        <View style={styles.cookingModeContainer}>
          {/* Header */}
          <View style={styles.cookingModeHeader}>
            <TouchableOpacity
              style={styles.cookingModeExitButton}
              onPress={exitCookingMode}
            >
              <Text style={styles.cookingModeExitText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.cookingModeTitle}>{recipe.title}</Text>
            <TouchableOpacity
              style={[
                styles.ingredientsToggleButton,
                showIngredients && styles.ingredientsToggleButtonActive
              ]}
              onPress={() => setShowIngredients(!showIngredients)}
            >
              <Text style={styles.ingredientsToggleText}>📋</Text>
            </TouchableOpacity>
          </View>

          {/* Step Counter */}
          <View style={styles.stepCounterContainer}>
            <Text style={styles.stepCounterText}>
              Step {currentStep + 1} of {recipe.instructions?.length || 0}
            </Text>
            <View style={styles.stepProgressBar}>
              <View
                style={[
                  styles.stepProgressFill,
                  {
                    width: `${((currentStep + 1) / (recipe.instructions?.length || 1)) * 100}%`,
                  },
                ]}
              />
            </View>
          </View>

          {/* Main Content Area */}
          <Animated.View
            style={[
              styles.cookingStepContainer,
              { transform: [{ translateX: slideAnim }] },
            ]}
            {...panResponder.panHandlers}
          >
            <View style={styles.cookingStepContent}>
              <View style={styles.cookingStepNumberBadge}>
                <Text style={styles.cookingStepNumberText}>{currentStep + 1}</Text>
              </View>
              <ScrollView
                style={styles.cookingInstructionScroll}
                contentContainerStyle={styles.cookingInstructionScrollContent}
              >
                <Text style={styles.cookingInstructionText}>
                  {recipe.instructions?.[currentStep]?.instruction || ''}
                </Text>
              </ScrollView>
            </View>

            {/* Swipe Hint */}
            <Text style={styles.swipeHint}>Swipe left or right to navigate</Text>
          </Animated.View>

          {/* Navigation Buttons */}
          <View style={styles.cookingNavigation}>
            <TouchableOpacity
              style={[
                styles.cookingNavButton,
                currentStep === 0 && styles.cookingNavButtonDisabled,
              ]}
              onPress={goToPreviousStep}
              disabled={currentStep === 0}
            >
              <Text style={styles.cookingNavButtonIcon}>←</Text>
              <Text style={styles.cookingNavButtonText}>Previous</Text>
            </TouchableOpacity>

            {currentStep === (recipe.instructions?.length || 0) - 1 ? (
              <TouchableOpacity
                style={[styles.cookingNavButton, styles.cookingNavButtonDone]}
                onPress={exitCookingMode}
              >
                <Text style={styles.cookingNavButtonIcon}>✓</Text>
                <Text style={styles.cookingNavButtonTextDone}>Done!</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.cookingNavButton, styles.cookingNavButtonNext]}
                onPress={goToNextStep}
              >
                <Text style={styles.cookingNavButtonTextNext}>Next</Text>
                <Text style={styles.cookingNavButtonIcon}>→</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Ingredients Overlay */}
          {showIngredients && (
            <View style={styles.ingredientsOverlay}>
              <View style={styles.ingredientsOverlayContent}>
                <View style={styles.ingredientsOverlayHeader}>
                  <Text style={styles.ingredientsOverlayTitle}>Ingredients</Text>
                  <TouchableOpacity
                    onPress={() => setShowIngredients(false)}
                    style={styles.ingredientsOverlayClose}
                  >
                    <Text style={styles.ingredientsOverlayCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.ingredientsOverlayScroll}>
                  {recipe.ingredients?.map((ingredient, index) => (
                    <View key={index} style={styles.ingredientsOverlayItem}>
                      <View style={styles.ingredientsOverlayBullet} />
                      <Text style={styles.ingredientsOverlayText}>
                        {ingredient.quantity} {ingredient.unit} {ingredient.name}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      </Modal>
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
    headerBarNoImage: {
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
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
    headerActionButtonActive: {
      backgroundColor: colors.primary,
    },
    headerActionText: {
      fontSize: 18,
      fontWeight: '600',
    },
    // Options Menu Styles
    optionsOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'flex-end',
    },
    optionsMenu: {
      backgroundColor: colors.backgroundSecondary,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 20,
      paddingBottom: 40,
      paddingHorizontal: 20,
    },
    optionsMenuTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionsMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionsMenuIcon: {
      fontSize: 22,
      marginRight: 16,
      width: 30,
      textAlign: 'center',
    },
    optionsMenuText: {
      fontSize: 17,
      color: colors.text,
      fontWeight: '500',
    },
    optionsMenuCancel: {
      justifyContent: 'center',
      borderBottomWidth: 0,
      marginTop: 8,
      backgroundColor: colors.background,
      borderRadius: 12,
    },
    optionsMenuCancelText: {
      fontSize: 17,
      color: colors.error,
      fontWeight: '600',
      textAlign: 'center',
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
    contentNoImage: {
      paddingTop: 80, // Extra padding when no image to account for header
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text,
      marginTop: 8,
      marginBottom: 20,
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
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    startCookingButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      gap: 6,
    },
    startCookingIcon: {
      fontSize: 16,
    },
    startCookingText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
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
    // Cooking Mode Styles
    cookingModeContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    cookingModeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 60,
      paddingBottom: 16,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    cookingModeExitButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    cookingModeExitText: {
      fontSize: 20,
      color: colors.text,
      fontWeight: 'bold',
    },
    cookingModeTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
      marginHorizontal: 12,
    },
    ingredientsToggleButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    ingredientsToggleButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    ingredientsToggleText: {
      fontSize: 20,
    },
    stepCounterContainer: {
      paddingHorizontal: 24,
      paddingVertical: 16,
      backgroundColor: colors.backgroundSecondary,
    },
    stepCounterText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 8,
    },
    stepProgressBar: {
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: 'hidden',
    },
    stepProgressFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 3,
    },
    cookingStepContainer: {
      flex: 1,
      padding: 24,
    },
    cookingStepContent: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
    },
    cookingStepNumberBadge: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    cookingStepNumberText: {
      fontSize: 28,
      fontWeight: 'bold',
      color: '#FFFFFF',
    },
    cookingInstructionScroll: {
      flex: 1,
      width: '100%',
    },
    cookingInstructionScrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    cookingInstructionText: {
      fontSize: 24,
      lineHeight: 36,
      color: colors.text,
      textAlign: 'center',
      fontWeight: '500',
    },
    swipeHint: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 16,
    },
    cookingNavigation: {
      flexDirection: 'row',
      paddingHorizontal: 24,
      paddingVertical: 20,
      gap: 16,
      backgroundColor: colors.backgroundSecondary,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    cookingNavButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    cookingNavButtonDisabled: {
      opacity: 0.4,
    },
    cookingNavButtonNext: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    cookingNavButtonDone: {
      backgroundColor: '#2ECC71',
      borderColor: '#2ECC71',
    },
    cookingNavButtonIcon: {
      fontSize: 20,
      color: colors.text,
    },
    cookingNavButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    cookingNavButtonTextNext: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    cookingNavButtonTextDone: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    // Ingredients Overlay
    ingredientsOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    ingredientsOverlayContent: {
      width: '100%',
      height: '80%',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 24,
      overflow: 'hidden',
    },
    ingredientsOverlayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.backgroundSecondary,
    },
    ingredientsOverlayTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: colors.text,
    },
    ingredientsOverlayClose: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    ingredientsOverlayCloseText: {
      fontSize: 20,
      color: colors.text,
      fontWeight: 'bold',
    },
    ingredientsOverlayScroll: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 20,
    },
    ingredientsOverlayItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    ingredientsOverlayBullet: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
      marginRight: 14,
    },
    ingredientsOverlayText: {
      fontSize: 18,
      color: colors.text,
      flex: 1,
      lineHeight: 24,
    },
  });
