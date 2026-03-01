import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, ViewStyle } from 'react-native';
import { useThemeStore } from '../store/themeStore';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

const SkeletonBlock: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}) => {
  const { colors } = useThemeStore();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
};

/** Skeleton for a meal plan day card */
export const MealPlanSkeleton: React.FC = () => {
  const { colors } = useThemeStore();

  return (
    <View style={[skeletonStyles.mealPlanContainer, { backgroundColor: colors.background }]}>
      {/* Day selector skeleton */}
      <View style={skeletonStyles.daySelector}>
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <SkeletonBlock key={i} width={44} height={60} borderRadius={12} style={{ marginRight: 8 }} />
        ))}
      </View>
      {/* Meal cards skeleton */}
      {[1, 2, 3].map((i) => (
        <View key={i} style={[skeletonStyles.mealCard, { backgroundColor: colors.backgroundSecondary }]}>
          <SkeletonBlock width={40} height={40} borderRadius={20} />
          <View style={skeletonStyles.mealCardContent}>
            <SkeletonBlock width="70%" height={14} style={{ marginBottom: 8 }} />
            <SkeletonBlock width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
};

/** Skeleton for a recipe card in grid view */
export const RecipeCardSkeleton: React.FC = () => {
  const { colors } = useThemeStore();

  return (
    <View style={[skeletonStyles.recipeCard, { backgroundColor: colors.backgroundSecondary }]}>
      <SkeletonBlock width="100%" height={120} borderRadius={0} />
      <View style={skeletonStyles.recipeCardContent}>
        <SkeletonBlock width="80%" height={14} style={{ marginBottom: 6 }} />
        <SkeletonBlock width="50%" height={12} />
      </View>
    </View>
  );
};

/** Skeleton for grocery list items */
export const GroceryItemSkeleton: React.FC = () => {
  const { colors } = useThemeStore();

  return (
    <View style={{ paddingHorizontal: 16 }}>
      {/* Category header */}
      <SkeletonBlock width="40%" height={20} style={{ marginTop: 16, marginBottom: 12 }} />
      {/* Items */}
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={[skeletonStyles.groceryItem, { backgroundColor: colors.backgroundSecondary }]}>
          <SkeletonBlock width={24} height={24} borderRadius={4} />
          <View style={skeletonStyles.groceryItemContent}>
            <SkeletonBlock width="60%" height={14} style={{ marginBottom: 6 }} />
            <SkeletonBlock width="30%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
};

/** Skeleton for pantry item list */
export const PantryItemSkeleton: React.FC = () => {
  const { colors } = useThemeStore();

  return (
    <View style={{ paddingHorizontal: 16 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[skeletonStyles.pantryItem, { backgroundColor: colors.backgroundSecondary }]}>
          <SkeletonBlock width={36} height={36} borderRadius={18} />
          <View style={skeletonStyles.pantryItemContent}>
            <SkeletonBlock width="55%" height={14} style={{ marginBottom: 6 }} />
            <SkeletonBlock width="35%" height={12} />
          </View>
          <SkeletonBlock width={60} height={24} borderRadius={12} />
        </View>
      ))}
    </View>
  );
};

export { SkeletonBlock };

const skeletonStyles = StyleSheet.create({
  mealPlanContainer: {
    flex: 1,
    padding: 16,
  },
  daySelector: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  mealCardContent: {
    flex: 1,
    marginLeft: 12,
  },
  recipeCard: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  recipeCardContent: {
    padding: 10,
  },
  groceryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  groceryItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  pantryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  pantryItemContent: {
    flex: 1,
    marginLeft: 12,
  },
});
