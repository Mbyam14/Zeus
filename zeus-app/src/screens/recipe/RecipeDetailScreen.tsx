import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  Dimensions,
  Animated,
  PanResponder,
  Share,
  Alert,
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Recipe, Ingredient } from '../../types/recipe';
import { DayOfWeek, MealType } from '../../types/mealplan';
import { recipeService } from '../../services/recipeService';
import { smartAIService } from '../../services/smartAIService';
import { mealPlanService } from '../../services/mealPlanService';
import { groceryListService } from '../../services/groceryListService';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { useDataStore } from '../../store/dataStore';
import { getDifficultyColor } from '../../utils/colors';
import { getMondayDateString } from '../../utils/dateHelpers';
import { Toast } from '../../components/Toast';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { AddToMealPlanSheet } from '../../components/AddToMealPlanSheet';

const DAY_NAMES: DayOfWeek[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

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
  const { user } = useAuthStore();

  // User preferences (used for allergen warning, diet-match badge, macro % targets)
  const userPrefs = (user as any)?.profile_data?.preferences || {};
  const userAllergies: string[]        = userPrefs.allergies || [];
  const userDisliked: string[]         = userPrefs.disliked_ingredients || [];
  const userDietRestrictions: string[] = userPrefs.dietary_restrictions || [];
  const calorieTarget: number          = userPrefs.calorie_target || 0;
  const proteinTarget: number          = userPrefs.protein_target_grams || 0;

  // Match allergens / disliked ingredients against the recipe's ingredient names.
  // Returns the *set of user terms* that hit, not the recipe ingredients themselves.
  const detectMatches = (terms: string[]): string[] => {
    if (!terms.length) return [];
    const names = (recipe.ingredients || []).map(i => (i.name || '').toLowerCase());
    return terms.filter(t => {
      const lc = t.toLowerCase();
      return names.some(n => n.includes(lc));
    });
  };
  const allergenHits = useMemo(() => detectMatches(userAllergies), [recipe.ingredients, userAllergies]);
  const dislikedHits = useMemo(() => detectMatches(userDisliked), [recipe.ingredients, userDisliked]);

  // Diet-match: does the recipe satisfy ALL of the user's dietary restrictions?
  const recipeDietTags = (recipe.dietary_tags || []).map(t => t.toLowerCase());
  const matchesAllDietary = userDietRestrictions.length > 0
    && userDietRestrictions.every(d => recipeDietTags.includes(d.toLowerCase()));

  // For each recipe ingredient, the set of user terms it contains (for inline flagging)
  const ingredientAllergenFlags = useMemo(() => {
    const flags: Record<number, string[]> = {};
    (recipe.ingredients || []).forEach((ing, idx) => {
      const name = (ing.name || '').toLowerCase();
      const hits = [
        ...userAllergies.filter(a => name.includes(a.toLowerCase())),
        ...userDisliked.filter(d => name.includes(d.toLowerCase())),
      ];
      if (hits.length > 0) flags[idx] = hits;
    });
    return flags;
  }, [recipe.ingredients, userAllergies, userDisliked]);

  // Serving size adjustment
  const householdSize = user?.profile_data?.preferences?.household_size || recipe.servings;
  const [adjustedServings, setAdjustedServings] = useState(householdSize);
  const servingScale = recipe.servings > 0 ? adjustedServings / recipe.servings : 1;

  // Units where fractional quantities don't make sense — round up to whole numbers
  const countUnits = new Set([
    '', 'piece', 'pieces', 'item', 'items', 'whole',
    'clove', 'cloves', 'head', 'heads', 'bunch', 'bunches',
    'slice', 'slices', 'can', 'cans', 'box', 'boxes',
    'package', 'packages', 'bag', 'bags', 'jar', 'jars',
    'stalk', 'stalks', 'sprig', 'sprigs', 'leaf', 'leaves',
    'strip', 'strips', 'link', 'links',
  ]);

  const toFraction = (decimal: number): string => {
    if (decimal === Math.floor(decimal)) return String(decimal);

    const whole = Math.floor(decimal);
    const remainder = decimal - whole;

    // Common cooking fractions
    const fractions: [number, string][] = [
      [0.125, '1/8'], [0.25, '1/4'], [0.333, '1/3'], [0.375, '3/8'],
      [0.5, '1/2'], [0.625, '5/8'], [0.667, '2/3'], [0.75, '3/4'],
      [0.875, '7/8'],
    ];

    // Find closest fraction
    let closest = fractions[0];
    let minDiff = Math.abs(remainder - fractions[0][0]);
    for (const [val, str] of fractions) {
      const diff = Math.abs(remainder - val);
      if (diff < minDiff) {
        minDiff = diff;
        closest = [val, str];
      }
    }

    // If very close to a whole number, round
    if (minDiff > 0.1) return decimal.toFixed(1);

    if (whole === 0) return closest[1];
    return `${whole} ${closest[1]}`;
  };

  const scaleQuantity = (quantity: string, unit?: string): string => {
    if (!quantity || servingScale === 1) return quantity;
    const num = parseFloat(quantity);
    if (isNaN(num)) return quantity;
    const scaled = num * servingScale;
    const unitLower = (unit || '').toLowerCase().trim();
    if (countUnits.has(unitLower)) {
      return String(Math.ceil(scaled));
    }
    return toFraction(scaled);
  };

  const scaledIngredients = useMemo(() => {
    if (!recipe.ingredients || servingScale === 1) return recipe.ingredients;
    return recipe.ingredients.map((ing: Ingredient) => ({
      ...ing,
      quantity: scaleQuantity(ing.quantity, ing.unit),
    }));
  }, [recipe.ingredients, servingScale]);

  const scaleInstructionText = (text: string): string => {
    if (!text || servingScale === 1) return text;
    // Build a set of original ingredient quantities for reference
    const originalQuantities = new Set<number>();
    recipe.ingredients?.forEach((ing: Ingredient) => {
      const num = parseFloat(ing.quantity);
      if (!isNaN(num)) originalQuantities.add(num);
    });
    // Replace numbers in instruction text that match ingredient quantities
    return text.replace(/(\d+\.?\d*)/g, (match) => {
      const num = parseFloat(match);
      if (isNaN(num) || num === 0) return match;
      // Scale if this number matches an ingredient quantity, or is a
      // common cooking amount (cups, tbsp, etc. — usually near a unit word)
      if (originalQuantities.has(num)) {
        const scaled = num * servingScale;
        if (scaled === Math.floor(scaled)) return String(scaled);
        return scaled.toFixed(1).replace(/\.0$/, '');
      }
      return match;
    });
  };

  const formatIngredient = (ing: Ingredient): string => {
    const qty = ing.quantity?.trim() || '';
    const unit = ing.unit?.trim() || '';
    const name = ing.name?.trim() || '';
    // "to taste" items: show as "Salt and pepper (to taste)"
    if (unit.toLowerCase() === 'to taste' || qty.toLowerCase() === 'to taste') {
      return `${name} (to taste)`;
    }
    return [qty, unit, name].filter(Boolean).join(' ');
  };

  const scaledInstructions = useMemo(() => {
    if (!recipe.instructions || servingScale === 1) return recipe.instructions;
    return recipe.instructions.map((inst) => ({
      ...inst,
      instruction: scaleInstructionText(inst.instruction),
    }));
  }, [recipe.instructions, servingScale]);

  const scaleNutrition = (value: number | undefined): number | undefined => {
    if (value === undefined || value === null) return value;
    return Math.round(value * servingScale);
  };

  // Timer helpers
  const extractTime = (text: string): number | null => {
    const patterns = [
      /(\d+)\s*(?:hour|hr)s?/i,
      /(\d+)\s*(?:minute|min)s?/i,
      /(\d+)\s*(?:second|sec)s?/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const num = parseInt(match[1]);
        if (pattern.source.includes('hour')) return num * 3600;
        if (pattern.source.includes('minute') || pattern.source.includes('min')) return num * 60;
        if (pattern.source.includes('second')) return num;
      }
    }
    return null;
  };

  const formatTimer = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Recipe action state
  const [isSaved, setIsSaved] = useState(recipe.is_saved || false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  // Cook Tonight / Add to Meal Plan flow state
  const [showAddToPlanSheet, setShowAddToPlanSheet] = useState(false);
  const [showCookTonightConfirm, setShowCookTonightConfirm] = useState(false);
  const [cookingTonight, setCookingTonight] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const showToast = (message: string) => setToast({ visible: true, message });

  // Related recipes — "More like this" strip at the bottom
  const [relatedRecipes, setRelatedRecipes] = useState<Recipe[]>([]);
  const relatedCollectionKey = useMemo(() => {
    // Prefer cooking method, fall back to time tag. Maps to a /collections/{key}.
    const method = (recipe.cooking_method || [])[0];
    if (method) return method;
    const time = (recipe.time_tags || []).find(t => t === 'quick' || t === 'weeknight');
    if (time === 'weeknight') return 'quick_weeknight';
    if (time === 'quick') return 'quick';
    return null;
  }, [recipe.cooking_method, recipe.time_tags]);

  const relatedTitle = useMemo(() => {
    const labels: Record<string, string> = {
      one_pot: 'More One-Pot Meals',
      sheet_pan: 'More Sheet Pan Dinners',
      slow_cooker: 'More Slow Cooker Recipes',
      instant_pot: 'More Instant Pot Recipes',
      air_fryer: 'More Air Fryer Recipes',
      grilled: 'More Grilled Recipes',
      stir_fry: 'More Stir-Fry Recipes',
      no_cook: 'More No-Cook Recipes',
      quick_weeknight: 'More Quick Weeknight Dinners',
      quick: 'More Quick Recipes',
    };
    return relatedCollectionKey ? (labels[relatedCollectionKey] || 'More Like This') : '';
  }, [relatedCollectionKey]);

  useEffect(() => {
    if (!relatedCollectionKey) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await recipeService.getCollection(relatedCollectionKey as any, 10);
        if (!cancelled) {
          // Exclude the currently-viewed recipe
          setRelatedRecipes(list.filter(r => r.id !== recipe.id).slice(0, 8));
        }
      } catch {
        // Silent — strip just won't render
      }
    })();
    return () => { cancelled = true; };
  }, [relatedCollectionKey, recipe.id]);

  // Cooking mode state
  const [cookingMode, setCookingMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);

  // Timer state
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer effect
  useEffect(() => {
    if (timerRunning && timerSeconds !== null && timerSeconds > 0) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(timerRef.current!);
            setTimerRunning(false);
            Alert.alert('Timer Done!', 'Time to move on to the next step.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [timerRunning]);

  // Reset timer when step changes
  useEffect(() => {
    setTimerRunning(false);
    setTimerSeconds(null);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [currentStep]);

  // Smart AI state
  const [substitutionModal, setSubstitutionModal] = useState<{ ingredient: string; loading: boolean; result: any } | null>(null);
  const [cookingTip, setCookingTip] = useState<{ loading: boolean; tip: string | null }>({ loading: false, tip: null });

  const handleSubstitution = async (ingredientName: string) => {
    setSubstitutionModal({ ingredient: ingredientName, loading: true, result: null });
    try {
      const result = await smartAIService.getSubstitution(recipe.id, ingredientName);
      setSubstitutionModal({ ingredient: ingredientName, loading: false, result });
    } catch {
      setSubstitutionModal({ ingredient: ingredientName, loading: false, result: { error: 'Failed to get substitutions. Try again.' } });
    }
  };

  const handleCookingTip = async () => {
    const step = scaledInstructions?.[currentStep];
    if (!step) return;
    setCookingTip({ loading: true, tip: null });
    try {
      const result = await smartAIService.getCookingTip(recipe.title, step.step, step.instruction);
      setCookingTip({ loading: false, tip: result.tip });
    } catch {
      setCookingTip({ loading: false, tip: 'Sorry, I couldn\'t get a tip right now.' });
    }
  };

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

  const handleSaveToggle = async () => {
    const newSavedState = !isSaved;
    setIsSaved(newSavedState);
    try {
      if (newSavedState) {
        await recipeService.saveRecipe(recipe.id);
      } else {
        await recipeService.unsaveRecipe(recipe.id);
      }
    } catch (error) {
      // Rollback on failure
      setIsSaved(!newSavedState);
      Alert.alert('Error', `Failed to ${newSavedState ? 'save' : 'unsave'} recipe`);
    }
  };

  const handleShare = () => {
    setShowOptionsMenu(false);

    // Build share message with recipe details
    const ingredients = scaledIngredients?.map(i => `• ${formatIngredient(i)}`).join('\n') || '';
    const shareMessage = `🍳 ${recipe.title}

${recipe.description || ''}

⏱️ Prep: ${recipe.prep_time || 0}min | Cook: ${recipe.cook_time || 0}min
👥 Servings: ${adjustedServings}

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
              Clipboard.setString(shareMessage + (recipe.image_url ? `\n\n${recipe.image_url}` : ''));
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
                  url: recipe.image_url || undefined,
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
    setShowAddToPlanSheet(true);
  };

  const cookTonightToday = (): DayOfWeek => DAY_NAMES[new Date().getDay()];

  const performCookTonight = async () => {
    setCookingTonight(true);
    const today = cookTonightToday();
    const slotData = { recipe_id: recipe.id };
    try {
      const plan = await mealPlanService.getCurrentWeekMealPlan();
      let updatedPlan;
      if (!plan) {
        updatedPlan = await mealPlanService.createManualMealPlan(
          getMondayDateString(0),
          [today],
          { [today]: { dinner: slotData } }
        );
      } else {
        const existingDay = (plan.meals as any)[today] || {};
        const nextMeals = {
          ...plan.meals,
          [today]: { ...existingDay, dinner: slotData },
        };
        updatedPlan = await mealPlanService.updateMealPlanMeals(plan.id, nextMeals);
      }
      groceryListService.generateGroceryList(updatedPlan.id).catch(() => {});
      useDataStore.getState().setMealPlan(updatedPlan);
      showToast('Added to tonight · Grocery list updated');
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Could not add to meal plan');
    } finally {
      setCookingTonight(false);
    }
  };

  const handleCookTonight = async () => {
    setShowOptionsMenu(false);
    try {
      const plan = await mealPlanService.getCurrentWeekMealPlan();
      if (!plan) {
        setShowCookTonightConfirm(true);
      } else {
        await performCookTonight();
      }
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Could not check meal plan');
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
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerActionButton, isSaved && styles.headerActionButtonActive]}
              onPress={handleSaveToggle}
            >
              {isSaved ? (
                <Ionicons name="checkmark" size={18} color="#FFF" />
              ) : (
                <Ionicons name="bookmark-outline" size={18} color="#FFF" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionButton}
              onPress={() => setShowOptionsMenu(true)}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Recipe Image - tappable for fullscreen */}
        {recipe.image_url && (
          <TouchableOpacity activeOpacity={0.9} onPress={() => setShowFullImage(true)}>
            <Image
              source={{ uri: recipe.image_url }}
              style={styles.image}
            />
          </TouchableOpacity>
        )}

        {/* Recipe Header */}
        <View style={[styles.content, !recipe.image_url && styles.contentNoImage]}>
          <Text style={styles.title}>{recipe.title}</Text>

          {/* Allergen warning — SAFETY CRITICAL. Loud red banner when the recipe
              contains anything in the user's allergies list. */}
          {allergenHits.length > 0 && (
            <View style={styles.allergenBanner}>
              <Ionicons name="warning" size={20} color="#FFF" style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.allergenBannerTitle}>Allergy warning</Text>
                <Text style={styles.allergenBannerText}>
                  Contains: {allergenHits.join(', ')}
                </Text>
              </View>
            </View>
          )}

          {/* Disliked-ingredient warning — softer, advisory */}
          {dislikedHits.length > 0 && allergenHits.length === 0 && (
            <View style={styles.dislikedBanner}>
              <Ionicons name="information-circle-outline" size={18} color={colors.warning || '#F59E0B'} style={{ marginRight: 8 }} />
              <Text style={styles.dislikedBannerText}>
                Contains ingredients you usually avoid: {dislikedHits.join(', ')}
              </Text>
            </View>
          )}

          {/* "Matches your diet" — positive reassurance when the user has
              dietary restrictions and the recipe satisfies all of them. */}
          {matchesAllDietary && allergenHits.length === 0 && (
            <View style={styles.matchBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#22C55E" style={{ marginRight: 6 }} />
              <Text style={styles.matchBadgeText}>
                Matches your {userDietRestrictions.join(' + ')} preferences
              </Text>
            </View>
          )}

          {/* Creator Info - only show for user-created recipes, not AI generated */}
          {recipe.creator_username && !recipe.is_ai_generated && recipe.creator_username.toLowerCase() !== 'ai' && (
            <View style={styles.creatorRow}>
              <View style={styles.creatorAvatar}>
                <Text style={styles.creatorAvatarText}>
                  {recipe.creator_username.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.creatorInfo}>
                <Text style={styles.creatorName}>@{recipe.creator_username}</Text>
                <Text style={styles.creatorSubtext}>
                  {recipe.created_at ? new Date(recipe.created_at).toLocaleDateString() : ''}
                </Text>
              </View>
            </View>
          )}

          {/* Stats — time, likes, difficulty + method/quick chips when present */}
          {(() => {
            const methodLabels: Record<string, string> = {
              one_pot: '🥘 One-Pot',
              sheet_pan: '🍳 Sheet Pan',
              slow_cooker: '🐢 Slow Cooker',
              instant_pot: '⚡ Instant Pot',
              air_fryer: '💨 Air Fryer',
              grilled: '🔥 Grilled',
              no_cook: '🥒 No-Cook',
              stir_fry: '🥢 Stir Fry',
            };
            const primaryMethod = (recipe.cooking_method || []).find(m => methodLabels[m]);
            const isQuick = (recipe.time_tags || []).includes('quick');
            return (
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.statText}>
                    {(recipe.prep_time || 0) + (recipe.cook_time || 0)}m
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="heart" size={16} color={colors.error || '#EF4444'} />
                  <Text style={styles.statText}>{recipe.likes_count}</Text>
                </View>
                <View
                  style={[
                    styles.difficultyBadge,
                    { backgroundColor: getDifficultyColor(recipe.difficulty, colors) },
                  ]}
                >
                  <Text style={styles.difficultyText}>{recipe.difficulty}</Text>
                </View>
                {primaryMethod && (
                  <View style={styles.heroChip}>
                    <Text style={styles.heroChipText}>{methodLabels[primaryMethod]}</Text>
                  </View>
                )}
                {isQuick && (
                  <View style={[styles.heroChip, { backgroundColor: '#EA580C' + '20', borderColor: '#EA580C' }]}>
                    <Ionicons name="flash" size={11} color="#EA580C" style={{ marginRight: 3 }} />
                    <Text style={[styles.heroChipText, { color: '#EA580C' }]}>Quick</Text>
                  </View>
                )}
              </View>
            );
          })()}

          {/* Serving Size Adjuster */}
          <View style={styles.servingAdjuster}>
            <Text style={styles.servingAdjusterLabel}>Servings</Text>
            <View style={styles.servingAdjusterControls}>
              <TouchableOpacity
                style={[styles.servingButton, adjustedServings <= 1 && styles.servingButtonDisabled]}
                onPress={() => setAdjustedServings(Math.max(1, adjustedServings - 1))}
                disabled={adjustedServings <= 1}
              >
                <Text style={[styles.servingButtonText, adjustedServings <= 1 && styles.servingButtonTextDisabled]}>-</Text>
              </TouchableOpacity>
              <Text style={styles.servingCount}>{adjustedServings}</Text>
              <TouchableOpacity
                style={styles.servingButton}
                onPress={() => setAdjustedServings(adjustedServings + 1)}
              >
                <Text style={styles.servingButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Nutrition placeholder when macros aren't available (USDA pipeline couldn't
              match enough ingredients). Surfaces a clear "calculation pending" message
              so users aren't confused by a missing section. */}
          {!((recipe.calories ?? 0) > 0 || (recipe.protein_grams ?? 0) > 0 || (recipe.carbs_grams ?? 0) > 0 || (recipe.fat_grams ?? 0) > 0) && (
            <View style={[styles.macrosSection, { alignItems: 'center' }]}>
              <Ionicons name="analytics-outline" size={20} color={colors.textMuted} style={{ marginBottom: 4 }} />
              <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: '500', textAlign: 'center' }}>
                Nutrition data not yet available for this recipe
              </Text>
            </View>
          )}

          {/* Nutrition/Macros — with macro distribution bar + target % when targets set */}
          {((recipe.calories ?? 0) > 0 || (recipe.protein_grams ?? 0) > 0 || (recipe.carbs_grams ?? 0) > 0 || (recipe.fat_grams ?? 0) > 0) && (() => {
            const cal     = scaleNutrition(recipe.calories) || 0;
            const protein = scaleNutrition(recipe.protein_grams) || 0;
            const carbs   = scaleNutrition(recipe.carbs_grams) || 0;
            const fat     = scaleNutrition(recipe.fat_grams) || 0;

            // Calorie-share distribution: 4 cal/g protein+carbs, 9 cal/g fat.
            // Used to draw a single stacked horizontal bar showing macro split.
            const proteinCal = protein * 4;
            const carbsCal   = carbs   * 4;
            const fatCal     = fat     * 9;
            const totalMacroCal = proteinCal + carbsCal + fatCal;
            const proteinPct = totalMacroCal > 0 ? (proteinCal / totalMacroCal) * 100 : 0;
            const carbsPct   = totalMacroCal > 0 ? (carbsCal   / totalMacroCal) * 100 : 0;
            const fatPct     = totalMacroCal > 0 ? (fatCal     / totalMacroCal) * 100 : 0;

            // % of user's daily targets (only shown when targets are set)
            const calPctTarget     = calorieTarget > 0 ? Math.round((cal     / calorieTarget) * 100) : null;
            const proteinPctTarget = proteinTarget > 0 ? Math.round((protein / proteinTarget) * 100) : null;

            return (
              <View style={styles.macrosSection}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={styles.macrosTitle}>
                    {servingScale === 1 ? 'Nutrition per Serving' : `Nutrition (${adjustedServings} servings)`}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="shield-checkmark-outline" size={12} color={colors.textMuted} />
                    <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '500' }}>USDA-calculated</Text>
                  </View>
                </View>
                {recipe.serving_size && servingScale === 1 && (
                  <Text style={styles.servingSize}>Serving: {recipe.serving_size}</Text>
                )}

                <View style={styles.macrosRow}>
                  {cal > 0 && (
                    <View style={styles.macroCard}>
                      <Ionicons name="flame-outline" size={18} color={colors.primary} style={styles.macroIconSpacing} />
                      <Text style={styles.macroValue}>{cal}</Text>
                      <Text style={styles.macroLabel}>Calories</Text>
                      {calPctTarget !== null && (
                        <Text style={styles.macroTargetPct}>{calPctTarget}% of daily</Text>
                      )}
                    </View>
                  )}
                  {protein > 0 && (
                    <View style={styles.macroCard}>
                      <Ionicons name="barbell-outline" size={18} color="#4ECDC4" style={styles.macroIconSpacing} />
                      <Text style={styles.macroValue}>{protein}g</Text>
                      <Text style={styles.macroLabel}>Protein</Text>
                      {proteinPctTarget !== null && (
                        <Text style={styles.macroTargetPct}>{proteinPctTarget}% of daily</Text>
                      )}
                    </View>
                  )}
                  {carbs > 0 && (
                    <View style={styles.macroCard}>
                      <Ionicons name="nutrition-outline" size={18} color="#F59E0B" style={styles.macroIconSpacing} />
                      <Text style={styles.macroValue}>{carbs}g</Text>
                      <Text style={styles.macroLabel}>Carbs</Text>
                    </View>
                  )}
                  {fat > 0 && (
                    <View style={styles.macroCard}>
                      <Ionicons name="water-outline" size={18} color="#EF4444" style={styles.macroIconSpacing} />
                      <Text style={styles.macroValue}>{fat}g</Text>
                      <Text style={styles.macroLabel}>Fat</Text>
                    </View>
                  )}
                </View>

                {/* Macro distribution bar — visual share of calories from each macro */}
                {totalMacroCal > 0 && (
                  <View style={styles.macroBarSection}>
                    <View style={styles.macroBar}>
                      {proteinPct > 0 && <View style={[styles.macroBarSeg, { flex: proteinPct, backgroundColor: '#4ECDC4' }]} />}
                      {carbsPct > 0   && <View style={[styles.macroBarSeg, { flex: carbsPct,   backgroundColor: '#F59E0B' }]} />}
                      {fatPct > 0     && <View style={[styles.macroBarSeg, { flex: fatPct,     backgroundColor: '#EF4444' }]} />}
                    </View>
                    <View style={styles.macroLegend}>
                      <View style={styles.macroLegendItem}>
                        <View style={[styles.macroLegendDot, { backgroundColor: '#4ECDC4' }]} />
                        <Text style={styles.macroLegendText}>Protein {Math.round(proteinPct)}%</Text>
                      </View>
                      <View style={styles.macroLegendItem}>
                        <View style={[styles.macroLegendDot, { backgroundColor: '#F59E0B' }]} />
                        <Text style={styles.macroLegendText}>Carbs {Math.round(carbsPct)}%</Text>
                      </View>
                      <View style={styles.macroLegendItem}>
                        <View style={[styles.macroLegendDot, { backgroundColor: '#EF4444' }]} />
                        <Text style={styles.macroLegendText}>Fat {Math.round(fatPct)}%</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })()}

          {/* Description */}
          {recipe.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.description}>{recipe.description}</Text>
            </View>
          )}

          {/* Tags — grouped by type with subtle section labels */}
          {(recipe.meal_type.length > 0
            || recipe.dietary_tags.length > 0
            || (recipe.cooking_method && recipe.cooking_method.length > 0)
            || (recipe.time_tags && recipe.time_tags.length > 0)
            || (recipe.style_tags && recipe.style_tags.length > 0)
            || !!recipe.cuisine_type) && (() => {
            const methodLabels: Record<string, string> = {
              one_pot: '🥘 One-Pot',
              sheet_pan: '🍳 Sheet Pan',
              slow_cooker: '🐢 Slow Cooker',
              instant_pot: '⚡ Instant Pot',
              air_fryer: '💨 Air Fryer',
              grilled: '🔥 Grilled',
              no_cook: '🥒 No-Cook',
              baked: '🥖 Baked',
              stir_fry: '🥢 Stir Fry',
            };
            const timeLabels: Record<string, string> = {
              quick: '⏱️ Quick (≤30m)',
              weeknight: '🌙 Weeknight',
              weekend_project: '🛠️ Weekend Project',
            };
            const styleLabels: Record<string, string> = {
              make_ahead: '📦 Make Ahead',
              meal_prep: '🥡 Meal Prep',
              comfort_food: '🤗 Comfort Food',
            };

            const TagGroup: React.FC<{ label: string; items: { key: string; label: string; emphasis?: boolean }[] }> = ({ label, items }) => {
              if (items.length === 0) return null;
              return (
                <View style={styles.tagGroup}>
                  <Text style={styles.tagGroupLabel}>{label}</Text>
                  <View style={styles.tagsContainer}>
                    {items.map(item => (
                      <View key={item.key} style={[styles.tag, item.emphasis && styles.dietaryTag]}>
                        <Text style={styles.tagText}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            };

            return (
              <View style={styles.section}>
                <TagGroup
                  label="Diet"
                  items={recipe.dietary_tags.map(t => ({ key: `diet-${t}`, label: t, emphasis: true }))}
                />
                <TagGroup
                  label="Meal & Cuisine"
                  items={[
                    ...recipe.meal_type.map(t => ({ key: `meal-${t}`, label: t })),
                    ...(recipe.cuisine_type ? [{ key: 'cuisine', label: recipe.cuisine_type }] : []),
                  ]}
                />
                <TagGroup
                  label="Method"
                  items={(recipe.cooking_method || [])
                    .map(m => ({ key: `method-${m}`, label: methodLabels[m] || m }))}
                />
                <TagGroup
                  label="Time & Style"
                  items={[
                    ...(recipe.time_tags  || []).map(t => ({ key: `time-${t}`,  label: timeLabels[t]  || t })),
                    ...(recipe.style_tags || []).map(t => ({ key: `style-${t}`, label: styleLabels[t] || t })),
                  ]}
                />
              </View>
            );
          })()}

          {/* Start Cooking Button */}
          {recipe.instructions && recipe.instructions.length > 0 && (
            <TouchableOpacity
              style={styles.startCookingButtonFull}
              onPress={startCookingMode}
              activeOpacity={0.8}
            >
              <Ionicons name="restaurant-outline" size={24} color={colors.buttonText} />
              <Text style={styles.startCookingTextFull}>Start Cooking</Text>
            </TouchableOpacity>
          )}

          {/* Ingredients */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { marginBottom: 16 }]}>Ingredients</Text>
            {scaledIngredients && scaledIngredients.length > 0 ? (
              scaledIngredients.map((ingredient, index) => {
                // Show section header when section changes
                const prevSection = index > 0 ? scaledIngredients[index - 1]?.section : undefined;
                const showSection = ingredient.section && ingredient.section !== prevSection;
                // Flag if this ingredient matches any user allergen/disliked term
                const flagged = ingredientAllergenFlags[index];
                return (
                  <View key={index}>
                    {showSection && (
                      <Text style={[styles.sectionTitle, { fontSize: 15, marginTop: 12, marginBottom: 6 }]}>
                        {ingredient.section}
                      </Text>
                    )}
                    <View style={[styles.ingredientItem, flagged && styles.ingredientItemFlagged]}>
                      <View style={[styles.ingredientBullet, flagged && { backgroundColor: '#EF4444' }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ingredientText, flagged && { color: '#DC2626', fontWeight: '600' }]}>
                          {formatIngredient(ingredient)}
                        </Text>
                        {flagged && (
                          <Text style={styles.ingredientFlagNote}>
                            ⚠️ Contains {flagged.join(', ')}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={() => handleSubstitution(ingredient.name)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ paddingLeft: 8 }}
                      >
                        <Ionicons name="swap-horizontal-outline" size={18} color={flagged ? '#DC2626' : colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptySection}>
                <Ionicons name="list-outline" size={32} color={colors.textMuted} style={{ marginBottom: 12 }} />
                <Text style={styles.emptySectionTitle}>Ingredients Not Available</Text>
                <Text style={styles.emptySectionText}>
                  This is a quick-generated meal plan recipe. Full ingredient details will be available when you generate the complete recipe.
                </Text>
              </View>
            )}
          </View>

          {/* Instructions */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { marginBottom: 16 }]}>Instructions</Text>
            {scaledInstructions && scaledInstructions.length > 0 ? (
              scaledInstructions.map((instruction, index) => (
                <View key={index} style={styles.instructionItem}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{instruction.step}</Text>
                  </View>
                  <Text style={styles.instructionText}>{instruction.instruction}</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptySection}>
                <Ionicons name="restaurant-outline" size={32} color={colors.primary} style={{ marginBottom: 12 }} />
                <Text style={styles.emptySectionTitle}>Instructions Not Available</Text>
                <Text style={styles.emptySectionText}>
                  Cooking steps will be available when the full recipe is generated. Use the description and nutrition info above as a guide for now.
                </Text>
              </View>
            )}
          </View>

          {/* Related recipes — drives discovery of similar items */}
          {relatedRecipes.length >= 3 && (
            <View style={[styles.section, { marginHorizontal: -20 }]}>
              <Text style={[styles.sectionTitle, { paddingHorizontal: 20, marginBottom: 12 }]}>
                {relatedTitle}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
              >
                {relatedRecipes.map(r => (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.85}
                    onPress={() => navigation.replace('RecipeDetail', { recipe: r })}
                    style={styles.relatedCard}
                  >
                    {r.image_url ? (
                      <Image source={{ uri: r.image_url }} style={styles.relatedImage} />
                    ) : (
                      <View style={[styles.relatedImage, { backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' }]}>
                        <Ionicons name="restaurant-outline" size={24} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={{ padding: 8 }}>
                      <Text style={styles.relatedTitle} numberOfLines={2}>{r.title}</Text>
                      {r.calories != null && r.calories > 0 && (
                        <Text style={styles.relatedMeta}>{r.calories} cal</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

        </View>
      </ScrollView>

      {/* Fullscreen Image Modal */}
      {recipe.image_url && (
        <Modal
          visible={showFullImage}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowFullImage(false)}
        >
          <TouchableOpacity
            style={styles.fullImageOverlay}
            activeOpacity={1}
            onPress={() => setShowFullImage(false)}
          >
            <Image
              source={{ uri: recipe.image_url }}
              style={styles.fullImage}
              contentFit="contain"
            />
            <TouchableOpacity
              style={styles.fullImageCloseButton}
              onPress={() => setShowFullImage(false)}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

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
              <View style={styles.optionsMenuIconContainer}>
                {isSaved ? (
                  <Ionicons name="checkmark" size={20} color={colors.text} />
                ) : (
                  <Ionicons name="bookmark-outline" size={20} color={colors.text} />
                )}
              </View>
              <Text style={styles.optionsMenuText}>{isSaved ? 'Saved — Tap to Remove' : 'Save Recipe'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionsMenuItem} onPress={handleShare}>
              <View style={styles.optionsMenuIconContainer}>
                <Ionicons name="share-outline" size={20} color={colors.text} />
              </View>
              <Text style={styles.optionsMenuText}>Share Recipe</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionsMenuItem}
              onPress={handleCookTonight}
              disabled={cookingTonight}
            >
              <View style={styles.optionsMenuIconContainer}>
                {cookingTonight ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="flame-outline" size={20} color={colors.primary} />
                )}
              </View>
              <Text style={[styles.optionsMenuText, { color: colors.primary, fontWeight: '600' }]}>
                Cook Tonight
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionsMenuItem} onPress={handleAddToMealPlan}>
              <View style={styles.optionsMenuIconContainer}>
                <Ionicons name="calendar-outline" size={20} color={colors.text} />
              </View>
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
                <View style={styles.optionsMenuIconContainer}>
                  <Ionicons name="restaurant-outline" size={20} color={colors.text} />
                </View>
                <Text style={styles.optionsMenuText}>Start Cooking Mode</Text>
              </TouchableOpacity>
            )}

            {user && recipe.user_id === user.id && (
              <TouchableOpacity
                style={styles.optionsMenuItem}
                onPress={() => {
                  setShowOptionsMenu(false);
                  Alert.alert(
                    'Delete Recipe',
                    `Are you sure you want to delete "${recipe.title}"? This cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await recipeService.deleteRecipe(recipe.id);
                            navigation.goBack();
                          } catch (err: any) {
                            Alert.alert('Error', err?.response?.data?.detail || 'Failed to delete recipe');
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <View style={styles.optionsMenuIconContainer}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </View>
                <Text style={[styles.optionsMenuText, { color: colors.error }]}>Delete Recipe</Text>
              </TouchableOpacity>
            )}

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
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.cookingModeTitle}>{recipe.title}</Text>
            <TouchableOpacity
              style={[
                styles.ingredientsToggleButton,
                showIngredients && styles.ingredientsToggleButtonActive
              ]}
              onPress={() => setShowIngredients(!showIngredients)}
            >
              <Ionicons name="list-outline" size={20} color={showIngredients ? colors.buttonText : colors.primary} />
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
                  {scaledInstructions?.[currentStep]?.instruction || ''}
                </Text>
              </ScrollView>

              {/* Step Timer */}
              {(() => {
                const stepText = scaledInstructions?.[currentStep]?.instruction || '';
                const detectedTime = extractTime(stepText);
                if (!detectedTime && timerSeconds === null) return null;

                return (
                  <View style={styles.timerContainer}>
                    {timerSeconds !== null ? (
                      <>
                        <Text style={[styles.timerDisplay, timerSeconds === 0 && { color: colors.success }]}>
                          {formatTimer(timerSeconds)}
                        </Text>
                        <View style={styles.timerButtons}>
                          <TouchableOpacity
                            style={[styles.timerButton, { backgroundColor: timerRunning ? colors.error + '15' : colors.primary + '15' }]}
                            onPress={() => {
                              if (timerRunning) {
                                setTimerRunning(false);
                                if (timerRef.current) clearInterval(timerRef.current);
                              } else if (timerSeconds > 0) {
                                setTimerRunning(true);
                              }
                            }}
                          >
                            <Ionicons name={timerRunning ? 'pause' : 'play'} size={18} color={timerRunning ? colors.error : colors.primary} />
                            <Text style={[styles.timerButtonText, { color: timerRunning ? colors.error : colors.primary }]}>
                              {timerRunning ? 'Pause' : 'Resume'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.timerButton, { backgroundColor: colors.backgroundSecondary }]}
                            onPress={() => { setTimerRunning(false); setTimerSeconds(null); if (timerRef.current) clearInterval(timerRef.current); }}
                          >
                            <Ionicons name="close" size={18} color={colors.textMuted} />
                            <Text style={[styles.timerButtonText, { color: colors.textMuted }]}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : detectedTime ? (
                      <TouchableOpacity
                        style={styles.startTimerButton}
                        onPress={() => { setTimerSeconds(detectedTime); setTimerRunning(true); }}
                      >
                        <Ionicons name="timer-outline" size={20} color={colors.primary} />
                        <Text style={styles.startTimerText}>
                          Start {detectedTime >= 3600 ? `${Math.floor(detectedTime / 3600)}h ` : ''}{detectedTime >= 60 ? `${Math.floor((detectedTime % 3600) / 60)}m` : `${detectedTime}s`} Timer
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })()}
            </View>

            {/* Ask AI button + Swipe Hint */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 8 }}>
              <TouchableOpacity
                onPress={handleCookingTip}
                disabled={cookingTip.loading}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '15', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6 }}
              >
                {cookingTip.loading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="sparkles" size={16} color={colors.primary} />
                )}
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                  {cookingTip.loading ? 'Thinking...' : 'Help with this step'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.swipeHint}>Swipe left or right to navigate</Text>
          </Animated.View>

          {/* AI Cooking Tip - rendered OUTSIDE animated view as an overlay */}
          {cookingTip.tip && (
            <View style={{ position: 'absolute', bottom: 100, left: 16, right: 16, backgroundColor: colors.card, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, maxHeight: 250, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="sparkles" size={16} color={colors.primary} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>AI Tip</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setCookingTip({ loading: false, tip: null })}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ backgroundColor: colors.backgroundSecondary, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Ionicons name="close" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: 14, lineHeight: 22, color: colors.text }}>{cookingTip.tip}</Text>
              </ScrollView>
            </View>
          )}

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
              <Ionicons name="arrow-back" size={20} color={colors.text} />
              <Text style={styles.cookingNavButtonText}>Previous</Text>
            </TouchableOpacity>

            {currentStep === (recipe.instructions?.length || 0) - 1 ? (
              <TouchableOpacity
                style={[styles.cookingNavButton, styles.cookingNavButtonDone]}
                onPress={exitCookingMode}
              >
                <Ionicons name="checkmark" size={22} color="#FFF" />
                <Text style={styles.cookingNavButtonTextDone}>Done!</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.cookingNavButton, styles.cookingNavButtonNext]}
                onPress={goToNextStep}
              >
                <Text style={styles.cookingNavButtonTextNext}>Next</Text>
                <Ionicons name="arrow-forward" size={20} color={colors.buttonText} />
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
                    <Ionicons name="close" size={22} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.ingredientsOverlayScroll}>
                  {scaledIngredients?.map((ingredient, index) => {
                    const prevSection = index > 0 ? scaledIngredients[index - 1]?.section : undefined;
                    const showSection = ingredient.section && ingredient.section !== prevSection;
                    return (
                      <View key={index}>
                        {showSection && (
                          <Text style={[styles.ingredientsOverlayText, { fontWeight: '700', marginTop: 10, marginBottom: 4, opacity: 0.8 }]}>
                            {ingredient.section}
                          </Text>
                        )}
                        <View style={styles.ingredientsOverlayItem}>
                          <View style={styles.ingredientsOverlayBullet} />
                          <Text style={styles.ingredientsOverlayText}>
                            {formatIngredient(ingredient)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      </Modal>
      {/* Substitution Modal */}
      <Modal
        visible={!!substitutionModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSubstitutionModal(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
                Substitute: {substitutionModal?.ingredient}
              </Text>
              <TouchableOpacity onPress={() => setSubstitutionModal(null)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {substitutionModal?.loading ? (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 12, color: colors.textMuted }}>Finding substitutions...</Text>
              </View>
            ) : substitutionModal?.result?.error ? (
              <Text style={{ color: colors.error, textAlign: 'center', paddingVertical: 20 }}>
                {substitutionModal.result.error}
              </Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {(substitutionModal?.result?.substitutions || []).map((sub: any, i: number) => (
                  <View key={i} style={{ backgroundColor: colors.backgroundSecondary, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary, marginBottom: 4 }}>
                      {sub.substitute} {sub.quantity ? `(${sub.quantity})` : ''}
                    </Text>
                    {sub.impact ? <Text style={{ fontSize: 14, color: colors.text, marginBottom: 4 }}>{sub.impact}</Text> : null}
                    {sub.adjustments ? <Text style={{ fontSize: 13, color: colors.textMuted, fontStyle: 'italic' }}>{sub.adjustments}</Text> : null}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <AddToMealPlanSheet
        visible={showAddToPlanSheet}
        recipe={recipe}
        onClose={() => setShowAddToPlanSheet(false)}
        onAdded={(day, slot) => showToast(`Added to ${day} ${slot}`)}
      />

      <ConfirmSheet
        visible={showCookTonightConfirm}
        title="No plan for this week yet"
        message="Start a meal plan with this recipe for tonight?"
        confirmLabel="Start plan"
        cancelLabel="Not now"
        onConfirm={() => {
          setShowCookTonightConfirm(false);
          performCookTonight();
        }}
        onCancel={() => setShowCookTonightConfirm(false)}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        onHide={() => setToast({ visible: false, message: '' })}
      />
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
      paddingTop: 8,
      paddingBottom: 12,
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
      backgroundColor: 'rgba(0,0,0,0.45)',
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
      backgroundColor: 'rgba(0,0,0,0.45)',
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
    optionsMenuIconContainer: {
      marginRight: 16,
      width: 30,
      alignItems: 'center',
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
    fullImageOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.95)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    fullImage: {
      width: screenWidth,
      height: screenHeight * 0.7,
    },
    fullImageCloseButton: {
      position: 'absolute',
      top: 60,
      right: 20,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    fullImageCloseText: {
      fontSize: 22,
      color: '#FFFFFF',
      fontWeight: 'bold',
    },
    content: {
      padding: 24,
      backgroundColor: colors.backgroundSecondary,
    },
    contentNoImage: {
      paddingTop: 50, // Extra padding when no image to account for header
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text,
      marginTop: 16,
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
      color: colors.buttonText,
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
      color: colors.buttonText,
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
    },
    startCookingButtonFull: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 14,
      gap: 10,
      marginBottom: 24,
    },
    startCookingIconFull: {
      fontSize: 22,
    },
    startCookingTextFull: {
      color: colors.buttonText,
      fontSize: 17,
      fontWeight: '700',
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
      backgroundColor: colors.successLight,
      borderColor: colors.success,
    },
    tagText: {
      fontSize: 14,
      color: colors.text,
      fontWeight: '500',
    },
    tagGroup: {
      marginBottom: 14,
    },
    tagGroupLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 6,
    },
    // Allergen / preference banners
    allergenBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#DC2626',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 12,
    },
    allergenBannerTitle: {
      color: '#FFF',
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    allergenBannerText: {
      color: '#FFF',
      fontSize: 14,
      fontWeight: '500',
      marginTop: 1,
    },
    dislikedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: (colors.warning || '#F59E0B') + '15',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: (colors.warning || '#F59E0B') + '40',
    },
    dislikedBannerText: {
      flex: 1,
      fontSize: 13,
      color: colors.warning || '#F59E0B',
      fontWeight: '500',
    },
    matchBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: '#22C55E' + '15',
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: '#22C55E' + '40',
    },
    matchBadgeText: {
      fontSize: 12,
      color: '#16A34A',
      fontWeight: '600',
    },
    // Hero method/quick chip in stats row
    heroChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '15',
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    heroChipText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
    },
    // Macro distribution bar
    macroBarSection: {
      marginTop: 12,
    },
    macroBar: {
      flexDirection: 'row',
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: colors.border,
    },
    macroBarSeg: {
      height: '100%',
    },
    macroLegend: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    macroLegendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    macroLegendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    macroLegendText: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '500',
    },
    macroTargetPct: {
      fontSize: 9,
      color: colors.textMuted,
      fontWeight: '500',
      marginTop: 2,
    },
    // Ingredient allergen highlighting
    ingredientItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      marginBottom: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    ingredientItemFlagged: {
      backgroundColor: '#FEF2F2',
      borderRadius: 8,
      paddingHorizontal: 10,
      marginHorizontal: -4,
      borderBottomColor: '#FECACA',
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
    ingredientFlagNote: {
      fontSize: 11,
      color: '#DC2626',
      fontWeight: '600',
      marginTop: 2,
    },
    relatedCard: {
      width: 140,
      backgroundColor: colors.background,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    relatedImage: {
      width: '100%',
      height: 90,
      resizeMode: 'cover',
    },
    relatedTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
      lineHeight: 16,
      marginBottom: 2,
    },
    relatedMeta: {
      fontSize: 10,
      color: colors.textMuted,
      fontWeight: '500',
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
      color: colors.buttonText,
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
    servingAdjuster: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    servingAdjusterLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
    },
    servingAdjusterControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    servingButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    servingButtonDisabled: {
      backgroundColor: colors.border,
    },
    servingButtonText: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.buttonText,
      lineHeight: 22,
    },
    servingButtonTextDisabled: {
      color: colors.textMuted,
    },
    servingCount: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
      minWidth: 30,
      textAlign: 'center',
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
    macroIconSpacing: {
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
      color: colors.buttonText,
    },
    cookingInstructionScroll: {
      maxHeight: '55%',
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
      backgroundColor: colors.success,
      borderColor: colors.success,
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
      color: colors.buttonText,
    },
    cookingNavButtonTextDone: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.buttonText,
    },
    // Ingredients Overlay
    ingredientsOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
      backgroundColor: colors.overlay,
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
    // Timer styles
    timerContainer: { alignItems: 'center' as const, marginTop: 12 },
    timerDisplay: { fontSize: 48, fontWeight: '700' as const, color: colors.primary, fontVariant: ['tabular-nums' as const] },
    timerButtons: { flexDirection: 'row' as const, gap: 12, marginTop: 8 },
    timerButton: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 6 },
    timerButtonText: { fontSize: 14, fontWeight: '600' as const },
    startTimerButton: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: colors.primary + '12', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, gap: 8 },
    startTimerText: { fontSize: 14, fontWeight: '600' as const, color: colors.primary },
  });
