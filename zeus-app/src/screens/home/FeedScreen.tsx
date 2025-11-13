import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Dimensions,
  Image,
  Animated,
} from 'react-native';
import { PanGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Recipe } from '../../types/recipe';

// Mock data for now - we'll connect to API later
const mockRecipes: Recipe[] = [
  {
    id: '1',
    user_id: 'user1',
    title: 'Classic Spaghetti Carbonara',
    description: 'Creamy Italian pasta with eggs, cheese, and pancetta',
    image_url: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=800&q=80',
    ingredients: [
      { name: 'Spaghetti', quantity: '400', unit: 'g' },
      { name: 'Eggs', quantity: '4', unit: 'large' },
      { name: 'Pancetta', quantity: '200', unit: 'g' },
      { name: 'Parmesan cheese', quantity: '100', unit: 'g' },
    ],
    instructions: [
      { step: 1, instruction: 'Cook spaghetti according to package directions' },
      { step: 2, instruction: 'Fry pancetta until crispy' },
      { step: 3, instruction: 'Mix eggs and parmesan in a bowl' },
      { step: 4, instruction: 'Combine hot pasta with pancetta and egg mixture' },
    ],
    servings: 4,
    prep_time: 15,
    cook_time: 20,
    cuisine_type: 'Italian',
    difficulty: 'Medium',
    meal_type: ['Dinner'],
    dietary_tags: [],
    is_ai_generated: false,
    likes_count: 127,
    created_at: '2025-11-06T00:00:00Z',
    creator_username: 'chef_mario',
  },
  {
    id: '2',
    user_id: 'user2',
    title: 'Quick Asian Stir Fry',
    description: 'Colorful vegetable stir fry with soy sauce and ginger',
    image_url: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&q=80',
    ingredients: [
      { name: 'Mixed vegetables', quantity: '500', unit: 'g' },
      { name: 'Soy sauce', quantity: '3', unit: 'tbsp' },
      { name: 'Fresh ginger', quantity: '2', unit: 'tbsp' },
      { name: 'Sesame oil', quantity: '1', unit: 'tbsp' },
    ],
    instructions: [
      { step: 1, instruction: 'Heat oil in wok over high heat' },
      { step: 2, instruction: 'Add ginger and stir for 30 seconds' },
      { step: 3, instruction: 'Add vegetables and stir fry for 5 minutes' },
      { step: 4, instruction: 'Add soy sauce and toss to combine' },
    ],
    servings: 2,
    prep_time: 10,
    cook_time: 8,
    cuisine_type: 'Asian',
    difficulty: 'Easy',
    meal_type: ['Lunch', 'Dinner'],
    dietary_tags: ['Vegetarian', 'Vegan'],
    is_ai_generated: true,
    likes_count: 89,
    created_at: '2025-11-05T00:00:00Z',
    creator_username: 'healthy_eats',
  },
  {
    id: '3',
    user_id: 'user3',
    title: 'Avocado Toast with Poached Egg',
    description: 'Perfect breakfast with creamy avocado and runny egg',
    image_url: 'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=800&q=80',
    ingredients: [
      { name: 'Sourdough bread', quantity: '2', unit: 'slices' },
      { name: 'Avocado', quantity: '1', unit: 'large' },
      { name: 'Eggs', quantity: '2', unit: 'large' },
      { name: 'Lemon juice', quantity: '1', unit: 'tsp' },
    ],
    instructions: [
      { step: 1, instruction: 'Toast bread until golden' },
      { step: 2, instruction: 'Mash avocado with lemon juice' },
      { step: 3, instruction: 'Poach eggs in simmering water' },
      { step: 4, instruction: 'Top toast with avocado and poached eggs' },
    ],
    servings: 2,
    prep_time: 5,
    cook_time: 10,
    cuisine_type: 'American',
    difficulty: 'Easy',
    meal_type: ['Breakfast'],
    dietary_tags: ['Vegetarian'],
    is_ai_generated: false,
    likes_count: 234,
    created_at: '2025-11-04T00:00:00Z',
    creator_username: 'brunch_lover',
  },
];

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const FeedScreen: React.FC = () => {
  const [recipes, setRecipes] = useState<Recipe[]>(mockRecipes);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Animation values
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const currentRecipe = recipes[currentIndex];

  const handleSwipeLeft = () => {
    // Skip recipe with animation
    Animated.timing(translateX, {
      toValue: -500,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      nextRecipe();
    });
  };

  const handleSwipeRight = () => {
    // Like recipe with animation
    // TODO: When backend is connected, call API to like recipe
    Animated.timing(translateX, {
      toValue: 500,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      nextRecipe();
    });
  };

  const handleSwipeUp = () => {
    // Save recipe with animation
    // TODO: When backend is connected, call API to save recipe
    Animated.timing(translateY, {
      toValue: -500,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      nextRecipe();
    });
  };

  const nextRecipe = () => {
    if (currentIndex < recipes.length - 1) {
      // Reset position
      translateX.setValue(0);
      translateY.setValue(0);
      setCurrentIndex(currentIndex + 1);
    }
    // If no more recipes, just stay on last one (user can see it's the end)
  };

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX, translationY: translateY } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = ({ nativeEvent }: any) => {
    if (nativeEvent.state === State.END) {
      const { translationX, translationY } = nativeEvent;

      // Swipe right (like)
      if (translationX > 120) {
        Animated.timing(translateX, {
          toValue: 500,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          handleSwipeRight();
        });
      }
      // Swipe left (skip)
      else if (translationX < -120) {
        Animated.timing(translateX, {
          toValue: -500,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          handleSwipeLeft();
        });
      }
      // Swipe up (save)
      else if (translationY < -120) {
        Animated.timing(translateY, {
          toValue: -500,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          handleSwipeUp();
        });
      }
      // Return to center
      else {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
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

  if (!currentRecipe) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No More Recipes</Text>
            <Text style={styles.emptySubtitle}>Check back later for more delicious discoveries!</Text>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Zeus</Text>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterButtonText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Recipe Card */}
      <View style={styles.cardContainer}>
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View
            style={[
              styles.card,
              {
                transform: [
                  { translateX },
                  { translateY },
                  { rotate },
                ],
              },
            ]}
          >
            {/* Like/Nope/Save Overlays */}
            <Animated.View style={[styles.overlayLabel, styles.likeLabel, { opacity: likeOpacity }]}>
              <Text style={styles.overlayText}>LIKE</Text>
            </Animated.View>
            <Animated.View style={[styles.overlayLabel, styles.nopeLabel, { opacity: nopeOpacity }]}>
              <Text style={styles.overlayText}>SKIP</Text>
            </Animated.View>
            <Animated.View style={[styles.overlayLabel, styles.saveLabel, { opacity: saveOpacity }]}>
              <Text style={styles.overlayText}>SAVE</Text>
            </Animated.View>
          {/* Recipe Image */}
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: currentRecipe.image_url || 'https://via.placeholder.com/400x300/FF6B35/FFFFFF?text=Recipe' }}
              style={styles.recipeImage}
            />
            <View style={styles.imageOverlay}>
              <View style={styles.recipeInfo}>
                <Text style={styles.recipeTitle}>{currentRecipe.title}</Text>
                <Text style={styles.recipeSubtitle}>{currentRecipe.cuisine_type}</Text>
                
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>⏱️ {currentRecipe.prep_time}m prep</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>🔥 {currentRecipe.cook_time}m cook</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>👥 {currentRecipe.servings} servings</Text>
                  </View>
                </View>

                <View style={styles.difficultyContainer}>
                  <Text style={[styles.difficultyBadge, getDifficultyColor(currentRecipe.difficulty)]}>
                    {currentRecipe.difficulty}
                  </Text>
                  {currentRecipe.is_ai_generated && (
                    <Text style={styles.aiBadge}>🤖 AI Generated</Text>
                  )}
                </View>

                <Text style={styles.description}>{currentRecipe.description}</Text>
              </View>
            </View>
          </View>
          </Animated.View>
        </PanGestureHandler>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.skipButton]}
          onPress={handleSwipeLeft}
        >
          <Text style={styles.actionButtonText}>❌</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.saveButton]}
          onPress={handleSwipeUp}
        >
          <Text style={styles.actionButtonText}>🔖</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.likeButton]}
          onPress={handleSwipeRight}
        >
          <Text style={styles.actionButtonText}>❤️</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          {currentIndex + 1} of {recipes.length}
        </Text>
      </View>
    </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'Easy':
      return { backgroundColor: '#2ECC71' };
    case 'Medium':
      return { backgroundColor: '#F7B32B' };
    case 'Hard':
      return { backgroundColor: '#E74C3C' };
    default:
      return { backgroundColor: '#7F8C8D' };
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonText: {
    fontSize: 18,
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  card: {
    width: screenWidth - 32,
    height: screenHeight * 0.58,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
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
    padding: 24,
  },
  recipeInfo: {
    flex: 1,
  },
  recipeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  recipeSubtitle: {
    fontSize: 18,
    color: '#F8F9FA',
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  metaItem: {
    marginRight: 16,
  },
  metaLabel: {
    fontSize: 14,
    color: '#F8F9FA',
  },
  difficultyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
  },
  aiBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#004E89',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 16,
    color: '#F8F9FA',
    lineHeight: 22,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 32,
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  skipButton: {
    backgroundColor: '#E74C3C',
  },
  saveButton: {
    backgroundColor: '#F7B32B',
  },
  likeButton: {
    backgroundColor: '#2ECC71',
  },
  actionButtonText: {
    fontSize: 24,
  },
  progressContainer: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  progressText: {
    fontSize: 14,
    color: '#7F8C8D',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#7F8C8D',
    textAlign: 'center',
  },
  overlayLabel: {
    position: 'absolute',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    borderWidth: 6,
    zIndex: 100,
  },
  likeLabel: {
    top: 60,
    right: 30,
    borderColor: '#2ECC71',
    backgroundColor: 'rgba(46, 204, 113, 0.5)',
    transform: [{ rotate: '20deg' }],
  },
  nopeLabel: {
    top: 60,
    left: 30,
    borderColor: '#E74C3C',
    backgroundColor: 'rgba(231, 76, 60, 0.5)',
    transform: [{ rotate: '-20deg' }],
  },
  saveLabel: {
    top: 60,
    alignSelf: 'center',
    borderColor: '#F7B32B',
    backgroundColor: 'rgba(247, 179, 43, 0.5)',
  },
  overlayText: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 6,
  },
});