import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
  Dimensions,
  RefreshControl,
  Animated,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Recipe, RecipeCollectionKey } from '../../types/recipe';
import { recipeService } from '../../services/recipeService';
import { mealPlanService } from '../../services/mealPlanService';
import { getRecipeIdFromSlot, DEFAULT_MEAL_TYPES } from '../../types/mealplan';
import { useThemeStore, ThemeColors } from '../../store/themeStore';
import { useDataStore } from '../../store/dataStore';
import { useAuthStore } from '../../store/authStore';
import { TabHeader } from '../../components/TabHeader';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 48) / 2;
const H_CARD_W = 160;
const SHEET_H = SCREEN_H * 0.72;
const FETCH_LIMIT = 60;

type MainTab = 'browse' | 'myRecipes';
type MyRecipesTab = 'liked' | 'saved' | 'created';
type SortOption = 'popular' | 'newest' | 'quick';
type CookTimeOption = 'any' | '15' | '30' | '60';

// Scenario strips rendered on the hub home view (when no search / no filters).
// Each renders an HRow lazy-loaded from /collections/{key}.
interface ScenarioStripDef {
  key: RecipeCollectionKey;
  title: string;
  subtitle?: string;
}

const SCENARIO_STRIPS: ScenarioStripDef[] = [
  { key: 'quick_weeknight', title: 'Quick Weeknight' },
  { key: 'one_pot',         title: 'One-Pot Meals' },
  { key: 'sheet_pan',       title: 'Sheet Pan Dinners' },
  { key: 'slow_cooker',     title: 'Slow Cooker' },
  { key: 'healthy_light',   title: 'Healthy & Light' },
  { key: 'make_ahead',      title: 'Make Ahead' },
  { key: 'family_favorites',title: 'Family Favorites' },
];

// Maps cooking_method tag -> emoji used as an overlay icon on the recipe card.
const METHOD_ICON: Record<string, string> = {
  one_pot:     '🥘',
  sheet_pan:   '🍳',
  slow_cooker: '🐢',
  instant_pot: '⚡',
  air_fryer:   '💨',
  grilled:     '🔥',
  no_cook:     '🥒',
  baked:       '🥖',
  stir_fry:    '🥢',
};

// Maps dietary tag -> short dot label + color for the visible "why this matches" indicator.
const DIETARY_DOT: Record<string, { label: string; color: string }> = {
  Vegetarian:    { label: 'V',  color: '#22C55E' },
  Vegan:         { label: 'Vg', color: '#16A34A' },
  Pescatarian:   { label: 'P',  color: '#0EA5E9' },
  'Gluten-Free': { label: 'GF', color: '#F59E0B' },
  'Dairy-Free':  { label: 'DF', color: '#A855F7' },
  Keto:          { label: 'K',  color: '#EC4899' },
  Paleo:         { label: 'Pa', color: '#84CC16' },
};

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Keto', 'Paleo', 'Pescatarian'];
const COOKING_METHOD_OPTIONS: { key: string; label: string }[] = [
  { key: 'one_pot',     label: 'One-Pot' },
  { key: 'sheet_pan',   label: 'Sheet Pan' },
  { key: 'slow_cooker', label: 'Slow Cooker' },
  { key: 'instant_pot', label: 'Instant Pot' },
  { key: 'air_fryer',   label: 'Air Fryer' },
  { key: 'grilled',     label: 'Grilled' },
  { key: 'no_cook',     label: 'No-Cook' },
  { key: 'baked',       label: 'Baked' },
];
const STYLE_OPTIONS: { key: string; label: string }[] = [
  { key: 'make_ahead',   label: 'Make Ahead' },
  { key: 'meal_prep',    label: 'Meal Prep' },
  { key: 'comfort_food', label: 'Comfort Food' },
];
const DIFFICULTY_OPTIONS: { key: string; label: string }[] = [
  { key: 'Easy',   label: 'Easy' },
  { key: 'Medium', label: 'Medium' },
  { key: 'Hard',   label: 'Hard' },
];
const MEAL_TYPE_OPTIONS: { key: string; label: string }[] = [
  { key: 'Breakfast', label: 'Breakfast' },
  { key: 'Lunch',     label: 'Lunch' },
  { key: 'Dinner',    label: 'Dinner' },
  { key: 'Snack',     label: 'Snack' },
  { key: 'Sides',     label: 'Sides' },
  { key: 'Dessert',   label: 'Dessert' },
];
const CUISINE_OPTIONS: { key: string; label: string }[] = [
  { key: 'Italian',       label: '🍝 Italian' },
  { key: 'Mexican',       label: '🌮 Mexican' },
  { key: 'Asian',         label: '🥢 Asian' },
  { key: 'Mediterranean', label: '🫒 Mediterranean' },
  { key: 'American',      label: '🍔 American' },
  { key: 'Indian',        label: '🍛 Indian' },
  { key: 'Japanese',      label: '🍱 Japanese' },
  { key: 'Thai',          label: '🌶️ Thai' },
  { key: 'French',        label: '🥐 French' },
  { key: 'Greek',         label: '🇬🇷 Greek' },
  { key: 'Middle Eastern', label: '🥙 Middle Eastern' },
];
const COOK_TIME_OPTIONS: { key: CookTimeOption; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: '15',  label: '≤ 15 min' },
  { key: '30',  label: '≤ 30 min' },
  { key: '60',  label: '≤ 1 hr' },
];

const fmt = (min: number) => {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

// ─── Hero Card ────────────────────────────────────────────────────────────────

const HeroCard: React.FC<{ recipe: Recipe; label: string; onPress: () => void; colors: ThemeColors }> = ({
  recipe, label, onPress, colors,
}) => {
  const total = (recipe.prep_time || 0) + (recipe.cook_time || 0);
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={heroS.card}>
      {recipe.image_url ? (
        <Image source={{ uri: recipe.image_url }} style={heroS.image} />
      ) : (
        <View style={[heroS.image, { backgroundColor: colors.backgroundSecondary, justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="restaurant-outline" size={52} color={colors.textMuted} />
        </View>
      )}
      <View style={heroS.topOverlay} />
      <View style={heroS.bottomOverlay} />
      <View style={heroS.labelBadge}>
        <Text style={heroS.labelText}>{label}</Text>
      </View>
      <View style={heroS.info}>
        <Text style={heroS.title} numberOfLines={2}>{recipe.title}</Text>
        <View style={heroS.chips}>
          {recipe.calories != null && (
            <View style={heroS.chip}><Text style={heroS.chipText}>{Math.round(recipe.calories)} cal</Text></View>
          )}
          {total > 0 && (
            <View style={heroS.chip}>
              <Ionicons name="time-outline" size={12} color="#FFF" />
              <Text style={heroS.chipText}>{fmt(total)}</Text>
            </View>
          )}
          {recipe.difficulty ? (
            <View style={heroS.chip}><Text style={heroS.chipText}>{recipe.difficulty}</Text></View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const heroS = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    height: 240,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 22,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 14 },
      android: { elevation: 10 },
    }),
  },
  image:         { width: '100%', height: '100%', resizeMode: 'cover' },
  topOverlay:    { position: 'absolute', top: 0, left: 0, right: 0, height: 70, backgroundColor: 'rgba(0,0,0,0.28)' },
  bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 150, backgroundColor: 'rgba(0,0,0,0.62)' },
  labelBadge: {
    position: 'absolute', top: 14, left: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.38)',
  },
  labelText:  { color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  info:       { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 },
  title:      { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 8, lineHeight: 28, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  chips:      { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  chipText:   { color: '#FFF', fontSize: 12, fontWeight: '600' },
});

// ─── Recipe Card ──────────────────────────────────────────────────────────────

const RecipeCard: React.FC<{
  recipe: Recipe;
  onPress: () => void;
  colors: ThemeColors;
  width?: number;
  compact?: boolean;
  showActions?: boolean;
  onLikeChange?: (id: string, liked: boolean) => void;
  onSaveChange?: (id: string, saved: boolean) => void;
}> = ({ recipe, onPress, colors, width, compact = false, showActions = false, onLikeChange, onSaveChange }) => {
  const cardW     = width ?? CARD_W;
  const imgH      = compact ? 108 : Math.round(cardW * 0.88);
  const [liked,  setLiked]  = useState(recipe.is_liked  || false);
  const [saved,  setSaved]  = useState(recipe.is_saved  || false);
  const total = (recipe.prep_time || 0) + (recipe.cook_time || 0);

  useEffect(() => { setLiked(recipe.is_liked || false); setSaved(recipe.is_saved || false); }, [recipe.is_liked, recipe.is_saved]);

  const handleLike = async () => {
    const next = !liked; setLiked(next);
    try { next ? await recipeService.likeRecipe(recipe.id) : await recipeService.unlikeRecipe(recipe.id); onLikeChange?.(recipe.id, next); }
    catch { setLiked(!next); }
  };
  const handleSave = async () => {
    const next = !saved; setSaved(next);
    try { next ? await recipeService.saveRecipe(recipe.id) : await recipeService.unsaveRecipe(recipe.id); onSaveChange?.(recipe.id, next); }
    catch { setSaved(!next); }
  };

  const cs = rcS(colors);
  const methodTag = recipe.cooking_method && recipe.cooking_method.length > 0 ? recipe.cooking_method[0] : null;
  const methodIcon = methodTag ? METHOD_ICON[methodTag] : null;
  const isQuick = (recipe.time_tags || []).includes('quick');
  const dietaryDots = (recipe.dietary_tags || []).slice(0, 2);
  const extraDietary = Math.max(0, (recipe.dietary_tags || []).length - 2);

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={[cs.card, { width: cardW, marginRight: compact ? 12 : 0 }]}>
      <View style={[cs.imgWrap, { height: imgH }]}>
        {recipe.image_url
          ? <Image source={{ uri: recipe.image_url }} style={cs.img} />
          : <View style={cs.imgPlaceholder}><Ionicons name="restaurant-outline" size={28} color={colors.textMuted} /></View>
        }
        {showActions && (
          <View style={cs.actionCol}>
            <TouchableOpacity style={cs.actionBtn} onPress={handleLike} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={15} color={liked ? '#EF4444' : '#FFF'} />
            </TouchableOpacity>
            <TouchableOpacity style={cs.actionBtn} onPress={handleSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={15} color={saved ? colors.primary : '#FFF'} />
            </TouchableOpacity>
          </View>
        )}
        {recipe.is_ai_generated && (
          <View style={[cs.badge, { backgroundColor: colors.secondary }]}><Text style={cs.badgeText}>AI</Text></View>
        )}
        {/* Cooking method emoji overlay - top-left */}
        {methodIcon && !recipe.is_ai_generated && (
          <View style={cs.methodOverlay}>
            <Text style={cs.methodIcon}>{methodIcon}</Text>
          </View>
        )}
        {/* Quick badge - bottom-right of image */}
        {isQuick && (
          <View style={cs.quickBadge}>
            <Ionicons name="flash" size={9} color="#FFF" />
            <Text style={cs.quickBadgeText}>Quick</Text>
          </View>
        )}
      </View>
      <View style={cs.info}>
        <Text style={cs.title} numberOfLines={2}>{recipe.title}</Text>
        <View style={cs.chips}>
          {recipe.calories != null && (
            <View style={[cs.chip, { backgroundColor: colors.primary + '1A' }]}>
              <Text style={[cs.chipText, { color: colors.primary }]}>{Math.round(recipe.calories)} cal</Text>
            </View>
          )}
          {total > 0 && (
            <View style={cs.chip}>
              <Ionicons name="time-outline" size={11} color={colors.textMuted} />
              <Text style={cs.chipText}>{fmt(total)}</Text>
            </View>
          )}
        </View>
        {/* Dietary tag dots — visible "why this matches your diet" indicators */}
        {dietaryDots.length > 0 && (
          <View style={cs.dietaryRow}>
            {dietaryDots.map(tag => {
              const meta = DIETARY_DOT[tag];
              if (!meta) return null;
              return (
                <View key={tag} style={[cs.dietaryDot, { backgroundColor: meta.color }]}>
                  <Text style={cs.dietaryDotText}>{meta.label}</Text>
                </View>
              );
            })}
            {extraDietary > 0 && (
              <View style={[cs.dietaryDot, { backgroundColor: colors.textMuted }]}>
                <Text style={cs.dietaryDotText}>+{extraDietary}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const rcS = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundSecondary, borderRadius: 18, marginBottom: 14, overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.09, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  imgWrap:       { backgroundColor: colors.border, position: 'relative' },
  img:           { width: '100%', height: '100%', resizeMode: 'cover' },
  imgPlaceholder:{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.border },
  actionCol:     { position: 'absolute', top: 8, right: 8, gap: 6 },
  actionBtn:     { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'center', alignItems: 'center' },
  badge:         { position: 'absolute', top: 8, left: 8, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  badgeText:     { color: '#FFF', fontSize: 10, fontWeight: '700' },
  methodOverlay: {
    position: 'absolute', top: 8, left: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
  },
  methodIcon:    { fontSize: 14 },
  quickBadge: {
    position: 'absolute', bottom: 6, right: 6,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(234,88,12,0.95)',
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2.5,
  },
  quickBadgeText:{ color: '#FFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  info:          { padding: 10, paddingBottom: 12 },
  title:         { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6, lineHeight: 19 },
  chips:         { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip:          { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.border, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  chipText:      { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  dietaryRow:    { flexDirection: 'row', gap: 4, marginTop: 6 },
  dietaryDot: {
    minWidth: 18, height: 18, paddingHorizontal: 4,
    borderRadius: 9, justifyContent: 'center', alignItems: 'center',
  },
  dietaryDotText:{ fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.2 },
});

// ─── Horizontal Row ───────────────────────────────────────────────────────────

const HRow: React.FC<{
  title: string;
  recipes: Recipe[];
  onPress: (r: Recipe) => void;
  colors: ThemeColors;
  onSeeAll?: () => void;
}> = ({ title, recipes, onPress, colors, onSeeAll }) => {
  if (!recipes.length) return null;
  return (
    <View style={{ marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{title}</Text>
        {onSeeAll && (
          <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>See all →</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {recipes.map(r => (
          <RecipeCard key={r.id} recipe={r} onPress={() => onPress(r)} colors={colors} width={H_CARD_W} compact showActions />
        ))}
      </ScrollView>
    </View>
  );
};

// ─── Scenario Collection Strip (lazy-loaded HRow) ─────────────────────────────
// Fetches `/api/recipes/collections/{key}` on first appear, then reuses
// `dataStore.recipeCollections[key]` cache (10 min TTL).

const CollectionStrip: React.FC<{
  def: ScenarioStripDef;
  onPress: (r: Recipe) => void;
  onSeeAll: (def: ScenarioStripDef) => void;
  colors: ThemeColors;
  /** invalidation token — bump to force refetch (e.g. pull-to-refresh) */
  refreshToken: number;
}> = ({ def, onPress, onSeeAll, colors, refreshToken }) => {
  const cached      = useDataStore(s => s.recipeCollections[def.key]);
  const isFresh     = useDataStore(s => s.isCollectionFresh(def.key));
  const setColl     = useDataStore(s => s.setRecipeCollection);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isFresh && cached?.recipes?.length) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const recipes = await recipeService.getCollection(def.key, 12);
        if (!cancelled) setColl(def.key, recipes);
      } catch {
        // Silent — if a collection fails it just renders nothing.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.key, refreshToken]);

  const recipes = cached?.recipes || [];
  // Hide strips with fewer than 3 results — avoids barren-looking sections.
  if (!loading && recipes.length < 3) return null;
  if (loading && recipes.length === 0) {
    return (
      <View style={{ marginBottom: 24, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 12 }}>{def.title}</Text>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }
  return <HRow title={def.title} recipes={recipes} onPress={onPress} colors={colors} onSeeAll={() => onSeeAll(def)} />;
};

// ─── Dietary Indicator Banner ────────────────────────────────────────────────
// Shown when user has dietary restrictions set. Makes silent filtering visible.

const DietaryBanner: React.FC<{
  restrictions: string[];
  allergies: string[];
  onEdit: () => void;
  colors: ThemeColors;
}> = ({ restrictions, allergies, onEdit, colors }) => {
  if (restrictions.length === 0 && allergies.length === 0) return null;
  const parts: string[] = [];
  if (restrictions.length > 0) parts.push(restrictions.join(', '));
  if (allergies.length > 0) parts.push(`No ${allergies.join(', ')}`);
  const summary = parts.join(' · ');
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onEdit}
      style={{
        flexDirection: 'row', alignItems: 'center',
        marginHorizontal: 16, marginBottom: 16,
        backgroundColor: colors.primary + '12',
        borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: 1, borderColor: colors.primary + '30',
      }}>
      <Ionicons name="leaf-outline" size={16} color={colors.primary} style={{ marginRight: 8 }} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.primary }} numberOfLines={2}>
        Showing {summary}
      </Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary, marginLeft: 8 }}>Edit</Text>
    </TouchableOpacity>
  );
};

// ─── Active Filter Summary (Phase 3.5 — visible filter state) ────────────────

const FilterSummary: React.FC<{
  pills: { key: string; label: string; onRemove: () => void }[];
  onClearAll: () => void;
  colors: ThemeColors;
}> = ({ pills, onClearAll, colors }) => {
  if (pills.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {pills.map(p => (
          <TouchableOpacity key={p.key} onPress={p.onRemove} activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 5,
              backgroundColor: colors.primary, borderRadius: 14,
            }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>{p.label}</Text>
            <Ionicons name="close" size={12} color="#FFF" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {pills.length > 1 && (
        <TouchableOpacity onPress={onClearAll} activeOpacity={0.7}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMuted }}>Clear</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ─── Today's Menu Strip ───────────────────────────────────────────────────────

const TodayStrip: React.FC<{ meals: { mealType: string; recipe: Recipe | null }[]; onPress: (r: Recipe) => void; colors: ThemeColors }> = ({
  meals, onPress, colors,
}) => {
  if (!meals.length) return null;
  return (
    <View style={{ marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
        <Ionicons name="restaurant" size={18} color={colors.primary} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>Today's Menu</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
        {meals.map((m, i) => (
          <TouchableOpacity
            key={i} activeOpacity={0.85}
            onPress={() => m.recipe && onPress(m.recipe)}
            style={{
              width: 176, backgroundColor: colors.backgroundSecondary, borderRadius: 16, overflow: 'hidden',
              ...Platform.select({ ios: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 6 }, android: { elevation: 2 } }),
            }}
          >
            {m.recipe?.image_url
              ? <Image source={{ uri: m.recipe.image_url }} style={{ width: '100%', height: 100, resizeMode: 'cover' }} />
              : <View style={{ width: '100%', height: 100, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="restaurant-outline" size={26} color={colors.textMuted} />
                </View>
            }
            <View style={{ padding: 10 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>{m.mealType}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, lineHeight: 18 }} numberOfLines={2}>{m.recipe?.title || '—'}</Text>
              {m.recipe?.calories != null && <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{Math.round(m.recipe.calories)} cal</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

// ─── Filter Bottom Sheet ──────────────────────────────────────────────────────

const FilterSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  sortBy: SortOption;
  onSortChange: (s: SortOption) => void;
  cookTime: CookTimeOption;
  onCookTimeChange: (c: CookTimeOption) => void;
  dietary: string[];
  onDietaryChange: (d: string[]) => void;
  cookingMethods: string[];
  onCookingMethodsChange: (m: string[]) => void;
  styles: string[];
  onStylesChange: (s: string[]) => void;
  difficulties: string[];
  onDifficultiesChange: (d: string[]) => void;
  mealTypes: string[];
  onMealTypesChange: (m: string[]) => void;
  cuisines: string[];
  onCuisinesChange: (c: string[]) => void;
  activeCount: number;
  onClear: () => void;
  colors: ThemeColors;
  bottomInset: number;
}> = ({
  visible, onClose,
  sortBy, onSortChange,
  cookTime, onCookTimeChange,
  dietary, onDietaryChange,
  cookingMethods, onCookingMethodsChange,
  styles: styleTags, onStylesChange,
  difficulties, onDifficultiesChange,
  mealTypes, onMealTypesChange,
  cuisines, onCuisinesChange,
  activeCount, onClear, colors, bottomInset,
}) => {
  const slideY   = useRef(new Animated.Value(SHEET_H)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(slideY,    { toValue: 0,       useNativeDriver: true, tension: 68, friction: 12 }),
        Animated.timing(bgOpacity, { toValue: 1,       useNativeDriver: true, duration: 240 }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(slideY,    { toValue: SHEET_H, useNativeDriver: true, duration: 220 }),
        Animated.timing(bgOpacity, { toValue: 0,       useNativeDriver: true, duration: 200 }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted) return null;

  const SORT_LABELS: Record<SortOption, string> = { popular: 'Popular', newest: 'Newest', quick: 'Quick to Make' };
  const SORT_KEYS:   Record<string, SortOption>  = { Popular: 'popular', Newest: 'newest', 'Quick to Make': 'quick' };

  const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 16, paddingVertical: 9, borderRadius: 22,
        borderWidth: 1.5,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary : colors.backgroundSecondary,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#FFF' : colors.textMuted }}>{label}</Text>
    </TouchableOpacity>
  );

  const SectionLabel = ({ text }: { text: string }) => (
    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 22, marginBottom: 12 }}>{text}</Text>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.52)', opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>
      <Animated.View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: SHEET_H,
        backgroundColor: colors.background,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        transform: [{ translateY: slideY }],
        ...Platform.select({
          ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.14, shadowRadius: 20 },
          android: { elevation: 24 },
        }),
      }}>
        {/* Handle */}
        <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12 }} />

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>Filters</Text>
          {activeCount > 0 && (
            <TouchableOpacity onPress={onClear} activeOpacity={0.7}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
          <SectionLabel text="Meal Type" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MEAL_TYPE_OPTIONS.map(o => (
              <Chip
                key={o.key} label={o.label}
                active={mealTypes.includes(o.key)}
                onPress={() => onMealTypesChange(
                  mealTypes.includes(o.key)
                    ? mealTypes.filter(x => x !== o.key)
                    : [...mealTypes, o.key]
                )}
              />
            ))}
          </View>

          <SectionLabel text="Cuisine" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CUISINE_OPTIONS.map(o => (
              <Chip
                key={o.key} label={o.label}
                active={cuisines.includes(o.key)}
                onPress={() => onCuisinesChange(
                  cuisines.includes(o.key)
                    ? cuisines.filter(x => x !== o.key)
                    : [...cuisines, o.key]
                )}
              />
            ))}
          </View>

          <SectionLabel text="Sort By" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['popular', 'newest', 'quick'] as SortOption[]).map(k => (
              <Chip key={k} label={SORT_LABELS[k]} active={sortBy === k} onPress={() => onSortChange(k)} />
            ))}
          </View>

          <SectionLabel text="Cook Time" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {COOK_TIME_OPTIONS.map(o => (
              <Chip key={o.key} label={o.label} active={cookTime === o.key} onPress={() => onCookTimeChange(o.key)} />
            ))}
          </View>

          <SectionLabel text="Dietary" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DIETARY_OPTIONS.map(tag => (
              <Chip
                key={tag} label={tag}
                active={dietary.includes(tag)}
                onPress={() => onDietaryChange(dietary.includes(tag) ? dietary.filter(d => d !== tag) : [...dietary, tag])}
              />
            ))}
          </View>

          <SectionLabel text="Cooking Method" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {COOKING_METHOD_OPTIONS.map(m => (
              <Chip
                key={m.key} label={m.label}
                active={cookingMethods.includes(m.key)}
                onPress={() => onCookingMethodsChange(
                  cookingMethods.includes(m.key)
                    ? cookingMethods.filter(x => x !== m.key)
                    : [...cookingMethods, m.key]
                )}
              />
            ))}
          </View>

          <SectionLabel text="Style" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {STYLE_OPTIONS.map(s => (
              <Chip
                key={s.key} label={s.label}
                active={styleTags.includes(s.key)}
                onPress={() => onStylesChange(
                  styleTags.includes(s.key)
                    ? styleTags.filter(x => x !== s.key)
                    : [...styleTags, s.key]
                )}
              />
            ))}
          </View>

          <SectionLabel text="Difficulty" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DIFFICULTY_OPTIONS.map(d => (
              <Chip
                key={d.key} label={d.label}
                active={difficulties.includes(d.key)}
                onPress={() => onDifficultiesChange(
                  difficulties.includes(d.key)
                    ? difficulties.filter(x => x !== d.key)
                    : [...difficulties, d.key]
                )}
              />
            ))}
          </View>
        </ScrollView>

        <View style={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: bottomInset + 16 }}>
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
            onPress={onClose} activeOpacity={0.85}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFF' }}>
              {activeCount > 0 ? `Apply Filters (${activeCount})` : 'Done'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export const RecipeHubScreen: React.FC = () => {
  const { colors }        = useThemeStore();
  const navigation        = useNavigation<any>();
  const insets            = useSafeAreaInsets();
  const cachedFeed        = useDataStore(s => s.recipeFeed);
  const feedFresh         = useDataStore(s => s.isFresh('recipeFeed'));
  const user              = useAuthStore(s => s.user);

  // User dietary restrictions (powers the banner + downstream auto-filter on backend)
  const userRestrictions  = (user as any)?.profile_data?.preferences?.dietary_restrictions || [];
  const userAllergies     = (user as any)?.profile_data?.preferences?.allergies || [];

  // Tabs
  const [mainTab,      setMainTab]      = useState<MainTab>('browse');
  const [myTab,        setMyTab]        = useState<MyRecipesTab>('liked');

  // Active filters — the FilterSheet is now the single source of truth
  // (pills were removed because they conflicted with the sheet's state).
  const [sortBy,      setSortBy]      = useState<SortOption>('popular');
  const [cookTime,    setCookTime]    = useState<CookTimeOption>('any');
  const [dietary,     setDietary]     = useState<string[]>([]);
  const [cookingMethods, setCookingMethods] = useState<string[]>([]);
  const [styleTags,   setStyleTags]   = useState<string[]>([]);
  const [difficulties, setDifficulties] = useState<string[]>([]);
  const [mealTypes,   setMealTypes]   = useState<string[]>([]);
  const [cuisines,    setCuisines]    = useState<string[]>([]);
  const [filterOpen,  setFilterOpen]  = useState(false);

  // Token bumped on pull-to-refresh to force scenario strips to refetch
  const [refreshToken, setRefreshToken] = useState(0);

  // Search
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [searchText,  setSearchText]  = useState('');
  const [search,      setSearch]      = useState('');
  const searchTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Browse data
  const [recipes,     setRecipes]     = useState<Recipe[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const offsetRef     = useRef(0);

  // Curated
  const [hero,        setHero]        = useState<Recipe | null>(null);
  const [trending,    setTrending]    = useState<Recipe[]>([]);
  const [quick,       setQuick]       = useState<Recipe[]>([]);
  const [todayMeals,  setTodayMeals]  = useState<{ mealType: string; recipe: Recipe | null }[]>([]);

  // My Recipes
  const [liked,       setLiked]       = useState<Recipe[]>([]);
  const [saved,       setSaved]       = useState<Recipe[]>([]);
  const [created,     setCreated]     = useState<Recipe[]>([]);
  const [myLoading,   setMyLoading]   = useState(false);

  const activeFilterCount =
    (sortBy !== 'popular' ? 1 : 0)
    + (cookTime !== 'any' ? 1 : 0)
    + dietary.length
    + cookingMethods.length
    + styleTags.length
    + difficulties.length
    + mealTypes.length
    + cuisines.length;

  // ── Client-side filter/sort ────────────────────────────────────────────────

  const applyFilters = (list: Recipe[]): Recipe[] => {
    let r = list;
    if (cookTime !== 'any') {
      const max = parseInt(cookTime);
      r = r.filter(x => ((x.prep_time || 0) + (x.cook_time || 0)) <= max);
    }
    if (dietary.length > 0) {
      r = r.filter(x => {
        const tags = ((x as any).dietary_tags || []).map((t: string) => t.toLowerCase());
        return dietary.every(d => tags.includes(d.toLowerCase()));
      });
    }
    if (cookingMethods.length > 0) {
      r = r.filter(x => {
        const methods = (x.cooking_method || []).map(t => t.toLowerCase());
        return cookingMethods.some(m => methods.includes(m.toLowerCase()));
      });
    }
    if (styleTags.length > 0) {
      r = r.filter(x => {
        const styles = (x.style_tags || []).map(t => t.toLowerCase());
        return styleTags.some(s => styles.includes(s.toLowerCase()));
      });
    }
    if (difficulties.length > 0) {
      r = r.filter(x => difficulties.includes(x.difficulty));
    }
    if (mealTypes.length > 0) {
      r = r.filter(x => {
        const types = ((x as any).meal_type || []).map((t: string) => t.toLowerCase());
        return mealTypes.some(m => types.includes(m.toLowerCase()));
      });
    }
    if (cuisines.length > 0) {
      r = r.filter(x => {
        const c = (x.cuisine_type || '').toLowerCase();
        return cuisines.some(t => t.toLowerCase() === c);
      });
    }
    if (sortBy === 'newest') {
      r = [...r].sort((a, b) => (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0));
    } else if (sortBy === 'quick') {
      r = [...r].sort((a, b) => ((a.prep_time || 0) + (a.cook_time || 0)) - ((b.prep_time || 0) + (b.cook_time || 0)));
    }
    return r;
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const isPracticalMeal = (r: Recipe): boolean => {
    const practical = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
    const types = ((r as any).meal_type || []).map((t: string) => t.toLowerCase());
    // Practical = has at least one non-dessert meal type, OR has no meal_type at all
    return types.length === 0 || types.some((t: string) => practical.has(t));
  };

  const pickHero = (pool: Recipe[]): Recipe | null =>
    pool.find(x => x.image_url && isPracticalMeal(x))
    || pool.find(x => isPracticalMeal(x))
    || pool[0]
    || null;

  const pickTrending = (pool: Recipe[], excludeId: string | undefined): Recipe[] =>
    pool.filter(x => x.id !== excludeId && isPracticalMeal(x)).slice(0, 8);

  // ── Load recipes ──────────────────────────────────────────────────────────

  const loadRecipes = async (reset: boolean) => {
    if (reset) { setLoading(true); offsetRef.current = 0; setHero(null); setTrending([]); setQuick([]); }
    else        setLoadingMore(true);

    try {
      // Use cache when no filters are active (the default "browse all" view)
      const isDefaultPopular = reset && !search
        && sortBy === 'popular' && cookTime === 'any'
        && dietary.length === 0 && cookingMethods.length === 0
        && styleTags.length === 0 && difficulties.length === 0
        && mealTypes.length === 0 && cuisines.length === 0;

      if (isDefaultPopular && feedFresh && cachedFeed.length > 0) {
        const f = applyFilters(cachedFeed);
        const heroRecipe = pickHero(f);
        setRecipes(f);
        setHero(heroRecipe);
        setTrending(pickTrending(f, heroRecipe?.id));
        setQuick(f.filter(x => { const t = (x.prep_time || 0) + (x.cook_time || 0); return t > 0 && t <= 30; }).slice(0, 8));
        setLoading(false);
        return;
      }

      // Single-value hints for the still-single backend filters (meal_type,
      // cuisine_type). The new multi-select filters (cooking_methods,
      // style_tags) are passed through verbatim.
      const backendMealType = mealTypes.length === 1 ? mealTypes[0] : undefined;
      const backendCuisine  = cuisines.length === 1  ? cuisines[0]  : undefined;

      const results = await recipeService.getAllRecipes(
        FETCH_LIMIT, offsetRef.current,
        search || undefined,
        backendMealType,
        dietary.length > 0 ? dietary : undefined,
        backendCuisine,
        undefined, // maxDifficulty
        cookingMethods.length > 0 ? cookingMethods : undefined,
        styleTags.length > 0      ? styleTags      : undefined,
      );

      const filtered = applyFilters(results);
      offsetRef.current += results.length;

      if (reset) {
        const heroRecipe = pickHero(filtered);
        setRecipes(filtered);
        setHero(heroRecipe);
        setTrending(pickTrending(filtered, heroRecipe?.id));
        setQuick(filtered.filter(x => { const t = (x.prep_time || 0) + (x.cook_time || 0); return t > 0 && t <= 30; }).slice(0, 8));

        if (isDefaultPopular) {
          useDataStore.getState().setRecipeFeed(results);
        }
      } else {
        setRecipes(prev => [...prev, ...filtered]);
      }

      setHasMore(results.length === FETCH_LIMIT);
    } catch { /* silent */ }
    finally { setLoading(false); setLoadingMore(false); }
  };

  // ── Today's Menu ──────────────────────────────────────────────────────────

  const loadTodayMenu = async () => {
    try {
      const plan = await mealPlanService.getCurrentWeekMealPlan();
      if (!plan?.meals) { setTodayMeals([]); return; }
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const todayData = (plan.meals as any)[dayNames[new Date().getDay()]];
      if (!todayData) { setTodayMeals([]); return; }
      const mealTypes = plan.meal_types || DEFAULT_MEAL_TYPES;
      const rids: string[] = [];
      const entries: { mealType: string; recipeId: string | null }[] = [];
      for (const mt of mealTypes) {
        const slot = (todayData as any)[mt.key];
        const rid  = slot ? getRecipeIdFromSlot(slot) : null;
        entries.push({ mealType: mt.label, recipeId: rid || null });
        if (rid) rids.push(rid);
      }
      if (!rids.length) { setTodayMeals([]); return; }
      const recipesData = await mealPlanService.getRecipes(rids);
      const map: Record<string, Recipe> = {};
      (recipesData as Recipe[]).forEach(r => { if (r?.id) map[r.id] = r; });
      setTodayMeals(entries.filter(e => e.recipeId && map[e.recipeId]).map(e => ({ mealType: e.mealType, recipe: map[e.recipeId!] })));
    } catch { setTodayMeals([]); }
  };

  // ── My Recipes ────────────────────────────────────────────────────────────

  const loadMyRecipes = async () => {
    setMyLoading(true);
    try {
      const [l, s, c] = await Promise.all([
        recipeService.getLikedRecipes(30, 0),
        recipeService.getSavedRecipes(30, 0),
        recipeService.getMyRecipes(30, 0),
      ]);
      setLiked(l); setSaved(s); setCreated(c.filter(r => !r.is_ai_generated));
    } catch { /* silent */ }
    finally { setMyLoading(false); }
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  useFocusEffect(
    React.useCallback(() => {
      if (mainTab === 'browse') { loadRecipes(true); loadTodayMenu(); }
      else loadMyRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mainTab]),
  );

  // Reload when any filter / search changes
  const prevKey = useRef('');
  useEffect(() => {
    const key = [
      sortBy, cookTime,
      dietary.join(','), cookingMethods.join(','),
      styleTags.join(','), difficulties.join(','),
      mealTypes.join(','), cuisines.join(','),
      search,
    ].join('|');
    if (key === prevKey.current) return;
    prevKey.current = key;
    loadRecipes(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, cookTime, dietary, cookingMethods, styleTags, difficulties, mealTypes, cuisines, search]);

  // ── Search ────────────────────────────────────────────────────────────────

  const onSearchChange = (text: string) => {
    setSearchText(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) { setSearch(''); return; }
    searchTimer.current = setTimeout(() => setSearch(text.trim()), 380);
  };
  const clearSearch = () => { setSearchText(''); setSearch(''); setSearchOpen(false); };

  // ── Render ────────────────────────────────────────────────────────────────

  const goTo    = (r: Recipe) => navigation.navigate('RecipeDetail', { recipe: r });
  const goCreate = () => navigation.navigate('CreateRecipe');
  const heroLabel   = "Today's Pick";
  const trendLabel  = 'Trending This Week';
  const quickLabel  = 'Quick & Easy';

  const activeMyList = myTab === 'liked' ? liked : myTab === 'saved' ? saved : created;
  const s = createStyles(colors);

  // Open scenario collection in the main grid by setting the matching filter.
  // Clears other filters so the user sees a clean view of just that scenario.
  const openCollection = (def: ScenarioStripDef) => {
    setDietary([]);
    setStyleTags([]);
    setDifficulties([]);
    setMealTypes([]);
    setCuisines([]);
    setCookTime('any');
    setSortBy('popular');
    if (def.key === 'quick' || def.key === 'quick_weeknight') {
      setCookTime('30');
      setCookingMethods([]);
    } else if (def.key === 'healthy_light') {
      setCookingMethods([]);
      // No direct "low-calorie" filter currently; user can adjust via filter sheet.
    } else if (def.key === 'make_ahead') {
      setStyleTags(['make_ahead']);
      setCookingMethods([]);
    } else if (def.key === 'meal_prep') {
      setStyleTags(['meal_prep']);
      setCookingMethods([]);
    } else if (def.key === 'comfort_food') {
      setStyleTags(['comfort_food']);
      setCookingMethods([]);
    } else if (def.key === 'family_favorites') {
      setSortBy('popular');
      setCookingMethods([]);
    } else {
      // cooking-method keys map 1:1
      setCookingMethods([def.key]);
    }
  };

  // Build active filter pill list for the summary row above the grid
  const summaryPills: { key: string; label: string; onRemove: () => void }[] = [];
  if (sortBy !== 'popular') summaryPills.push({ key: `sort:${sortBy}`, label: sortBy, onRemove: () => setSortBy('popular') });
  if (cookTime !== 'any')   summaryPills.push({ key: `time:${cookTime}`, label: `≤ ${cookTime}m`, onRemove: () => setCookTime('any') });
  mealTypes.forEach(m => summaryPills.push({ key: `meal:${m}`, label: m, onRemove: () => setMealTypes(prev => prev.filter(x => x !== m)) }));
  cuisines.forEach(c => summaryPills.push({ key: `cuisine:${c}`, label: c, onRemove: () => setCuisines(prev => prev.filter(x => x !== c)) }));
  dietary.forEach(d => summaryPills.push({ key: `diet:${d}`, label: d, onRemove: () => setDietary(prev => prev.filter(x => x !== d)) }));
  cookingMethods.forEach(m => {
    const opt = COOKING_METHOD_OPTIONS.find(o => o.key === m);
    summaryPills.push({ key: `method:${m}`, label: opt?.label || m, onRemove: () => setCookingMethods(prev => prev.filter(x => x !== m)) });
  });
  styleTags.forEach(t => {
    const opt = STYLE_OPTIONS.find(o => o.key === t);
    summaryPills.push({ key: `style:${t}`, label: opt?.label || t, onRemove: () => setStyleTags(prev => prev.filter(x => x !== t)) });
  });
  difficulties.forEach(d => summaryPills.push({ key: `diff:${d}`, label: d, onRemove: () => setDifficulties(prev => prev.filter(x => x !== d)) }));

  const clearAllFilters = () => {
    setSortBy('popular');
    setCookTime('any');
    setDietary([]);
    setCookingMethods([]);
    setStyleTags([]);
    setDifficulties([]);
    setMealTypes([]);
    setCuisines([]);
  };

  // Smart empty-state suggestion: identify the most-restrictive filter to drop
  const mostRestrictiveFilter = (): { label: string; clear: () => void } | null => {
    if (cookingMethods.length > 0)     return { label: 'cooking method', clear: () => setCookingMethods([]) };
    if (styleTags.length > 0)          return { label: 'style', clear: () => setStyleTags([]) };
    if (difficulties.length > 0)       return { label: 'difficulty', clear: () => setDifficulties([]) };
    if (cookTime !== 'any')            return { label: 'cook time', clear: () => setCookTime('any') };
    if (dietary.length > 0)            return { label: 'dietary tag', clear: () => setDietary([]) };
    return null;
  };

  // Scenario strips only show on the default view (no filters, no search)
  const showScenarioStrips = !search && activeFilterCount === 0;

  const BrowseHeader = () => (
    <View style={{ paddingTop: 8 }}>
      {/* Dietary indicator — visible filtering */}
      <DietaryBanner
        restrictions={userRestrictions}
        allergies={userAllergies}
        onEdit={() => navigation.navigate('EditPreferences')}
        colors={colors}
      />
      {/* Active filter chips — tap × to remove */}
      <FilterSummary pills={summaryPills} onClearAll={clearAllFilters} colors={colors} />
      {!search && hero    && <HeroCard recipe={hero} label={heroLabel} onPress={() => goTo(hero)} colors={colors} />}
      {!search            && <TodayStrip meals={todayMeals} onPress={goTo} colors={colors} />}
      {/* Scenario collections — NYT-style named discovery (only on home view) */}
      {showScenarioStrips && SCENARIO_STRIPS.map(def => (
        <CollectionStrip
          key={def.key}
          def={def}
          onPress={goTo}
          onSeeAll={openCollection}
          colors={colors}
          refreshToken={refreshToken}
        />
      ))}
      {!search && !showScenarioStrips && <HRow title={trendLabel} recipes={trending} onPress={goTo} colors={colors} />}
      {!search && !showScenarioStrips && <HRow title={quickLabel}  recipes={quick}    onPress={goTo} colors={colors} />}
      <Text style={[s.sectionTitle, { paddingHorizontal: 16, marginBottom: 10 }]}>
        {search ? `Results for "${search}"` : showScenarioStrips ? 'Browse All' : 'More Recipes'}
      </Text>
    </View>
  );

  return (
    <View style={s.root}>
      <TabHeader
        title="Recipes"
        secondaryActions={[
          {
            icon: searchOpen ? 'close' : 'search',
            onPress: () => { if (searchOpen) clearSearch(); else setSearchOpen(true); },
            accessibilityLabel: searchOpen ? 'Close search' : 'Search recipes',
          },
        ]}
        primaryAction={{
          icon: 'add',
          onPress: goCreate,
          accessibilityLabel: 'Create recipe',
        }}
      />

      {/* ── Inline search bar ── */}
      {searchOpen && (
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={s.searchInput}
            placeholder="Search recipes..."
            placeholderTextColor={colors.textMuted}
            value={searchText}
            onChangeText={onSearchChange}
            autoFocus returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={clearSearch} activeOpacity={0.6}>
              <Ionicons name="close-circle" size={19} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Browse / My Recipes tabs ── */}
      <View style={s.tabRow}>
        {(['browse', 'myRecipes'] as MainTab[]).map(tab => (
          <TouchableOpacity
            key={tab} activeOpacity={0.7}
            onPress={() => { setMainTab(tab); if (tab === 'myRecipes') loadMyRecipes(); }}
            style={[s.tab, mainTab === tab && s.tabActive]}
          >
            <Text style={[s.tabText, mainTab === tab && s.tabTextActive]}>
              {tab === 'browse' ? 'Browse' : 'My Recipes'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mainTab === 'browse' ? (
        <>
          {/* ── Prominent full-width filter button ── */}
          {/* Replaces the previous pill row. The filter sheet is now the single
              source of truth — pills + sheet caused confusing conflicts. */}
          <View style={s.filterBarWrap}>
            <TouchableOpacity
              style={[s.filterBar, activeFilterCount > 0 && s.filterBarActive]}
              onPress={() => setFilterOpen(true)}
              activeOpacity={0.85}
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={activeFilterCount > 0 ? '#FFF' : colors.text}
                style={{ marginRight: 8 }}
              />
              <Text style={[s.filterBarText, activeFilterCount > 0 && s.filterBarTextActive]}>
                {activeFilterCount === 0
                  ? 'Filters'
                  : `Filters · ${activeFilterCount} active`}
              </Text>
              {activeFilterCount > 0 && (
                <TouchableOpacity
                  onPress={clearAllFilters}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={s.filterBarClearBtn}
                >
                  <Ionicons name="close-circle" size={18} color="#FFF" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Grid ── */}
          {loading && !recipes.length ? (
            <View style={s.loadingCenter}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : (
            <FlatList
              data={search ? recipes : recipes.slice(trending.length)}
              keyExtractor={(item, i) => `${item.id}-${i}`}
              numColumns={2}
              columnWrapperStyle={s.gridRow}
              contentContainerStyle={s.gridContent}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={BrowseHeader}
              ListEmptyComponent={
                !loading ? (
                  <View style={s.empty}>
                    <Ionicons name="search-outline" size={48} color={colors.textMuted} />
                    <Text style={s.emptyTitle}>
                      {search
                        ? `No recipes match "${search}"`
                        : 'No recipes match all your filters'}
                    </Text>
                    {(() => {
                      const suggestion = mostRestrictiveFilter();
                      if (suggestion) {
                        return (
                          <>
                            <Text style={s.emptySub}>Try removing the {suggestion.label} filter to see more options.</Text>
                            <TouchableOpacity style={s.ctaBtn} onPress={suggestion.clear} activeOpacity={0.8}>
                              <Ionicons name="close-circle-outline" size={20} color="#FFF" />
                              <Text style={s.ctaBtnText}>Remove {suggestion.label} filter</Text>
                            </TouchableOpacity>
                            {activeFilterCount > 1 && (
                              <TouchableOpacity onPress={clearAllFilters} activeOpacity={0.7} style={{ marginTop: 12 }}>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>or clear all filters</Text>
                              </TouchableOpacity>
                            )}
                          </>
                        );
                      }
                      if (search) {
                        return (
                          <>
                            <Text style={s.emptySub}>Try a different search term, or browse all recipes.</Text>
                            <TouchableOpacity style={s.ctaBtn} onPress={clearSearch} activeOpacity={0.8}>
                              <Ionicons name="close-circle-outline" size={20} color="#FFF" />
                              <Text style={s.ctaBtnText}>Clear search</Text>
                            </TouchableOpacity>
                          </>
                        );
                      }
                      return <Text style={s.emptySub}>Try a different category or search term</Text>;
                    })()}
                  </View>
                ) : null
              }
              ListFooterComponent={
                loadingMore
                  ? <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: 24 }} />
                  : <View style={{ height: 110 }} />
              }
              onEndReached={() => { if (!loadingMore && hasMore && !loading) loadRecipes(false); }}
              onEndReachedThreshold={1.2}
              windowSize={13} maxToRenderPerBatch={12} initialNumToRender={10}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={async () => {
                    setRefreshing(true);
                    useDataStore.getState().invalidate('recipeFeed');
                    useDataStore.getState().invalidate('recipeCollections');
                    setRefreshToken(t => t + 1);
                    await loadRecipes(true);
                    await loadTodayMenu();
                    setRefreshing(false);
                  }}
                  tintColor={colors.primary}
                />
              }
              renderItem={({ item }) => <RecipeCard recipe={item} onPress={() => goTo(item)} colors={colors} showActions />}
            />
          )}
        </>
      ) : (
        <>
          {/* ── My Recipes sub-tabs ── */}
          <View style={s.myTabRow}>
            {(['liked', 'saved', 'created'] as MyRecipesTab[]).map(tab => {
              const active = myTab === tab;
              const icon: keyof typeof Ionicons.glyphMap = tab === 'liked' ? 'heart-outline' : tab === 'saved' ? 'bookmark-outline' : 'create-outline';
              return (
                <TouchableOpacity key={tab} activeOpacity={0.7} onPress={() => setMyTab(tab)} style={[s.myTab, active && s.myTabActive]}>
                  <Ionicons name={icon} size={14} color={active ? colors.primary : colors.textMuted} />
                  <Text style={[s.myTabText, active && s.myTabTextActive]}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {myLoading ? (
            <View style={s.loadingCenter}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : activeMyList.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name={myTab === 'liked' ? 'heart-outline' : myTab === 'saved' ? 'bookmark-outline' : 'create-outline'} size={48} color={colors.textMuted} />
              <Text style={s.emptyTitle}>{myTab === 'liked' ? 'No liked recipes' : myTab === 'saved' ? 'No saved recipes' : 'No recipes yet'}</Text>
              <Text style={s.emptySub}>{myTab === 'created' ? "Create your own and they'll show up here" : "Explore recipes and save your favourites"}</Text>
              {myTab === 'created' && (
                <TouchableOpacity style={s.ctaBtn} onPress={goCreate} activeOpacity={0.8}>
                  <Ionicons name="add-circle-outline" size={20} color="#FFF" />
                  <Text style={s.ctaBtnText}>Create Recipe</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <FlatList
              data={activeMyList}
              keyExtractor={item => item.id}
              numColumns={2}
              columnWrapperStyle={s.gridRow}
              contentContainerStyle={s.gridContent}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={<View style={{ height: 110 }} />}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadMyRecipes(); setRefreshing(false); }} tintColor={colors.primary} />}
              renderItem={({ item }) => (
                <RecipeCard
                  recipe={item} onPress={() => goTo(item)} colors={colors} showActions
                  onLikeChange={(id, lk) => { if (!lk && myTab === 'liked') setLiked(prev => prev.filter(r => r.id !== id)); }}
                  onSaveChange={(id, sv) => { if (!sv && myTab === 'saved') setSaved(prev => prev.filter(r => r.id !== id)); }}
                />
              )}
            />
          )}
        </>
      )}

      {/* ── Filter Sheet ── */}
      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        sortBy={sortBy}              onSortChange={setSortBy}
        cookTime={cookTime}          onCookTimeChange={setCookTime}
        dietary={dietary}            onDietaryChange={setDietary}
        cookingMethods={cookingMethods}  onCookingMethodsChange={setCookingMethods}
        styles={styleTags}           onStylesChange={setStyleTags}
        difficulties={difficulties}  onDifficultiesChange={setDifficulties}
        mealTypes={mealTypes}        onMealTypesChange={setMealTypes}
        cuisines={cuisines}          onCuisinesChange={setCuisines}
        activeCount={activeFilterCount}
        onClear={clearAllFilters}
        colors={colors}
        bottomInset={insets.bottom}
      />
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root:      { flex: 1, backgroundColor: colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 10, marginBottom: 2, paddingHorizontal: 14, height: 44, backgroundColor: colors.backgroundSecondary, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primary + '40' },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },

  tabRow:       { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab:          { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  tabActive:    { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText:      { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: '#FFF' },

  // Prominent full-width filter button (replaces the old pill row)
  filterBarWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  filterBarActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterBarText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.2,
  },
  filterBarTextActive: { color: '#FFF' },
  filterBarClearBtn: {
    marginLeft: 12,
    padding: 2,
  },

  filterIcon:      { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.backgroundSecondary, borderWidth: 1.5, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 12, marginLeft: 4, flexShrink: 0 },
  filterIconActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterBadge:     { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  filterBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },

  sectionTitle:  { fontSize: 20, fontWeight: '800', color: colors.text },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  gridContent:   { paddingHorizontal: 16, paddingTop: 4 },
  gridRow:       { justifyContent: 'space-between' },

  empty:      { paddingTop: 60, alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 },
  emptySub:   { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  ctaBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 20, gap: 8 },
  ctaBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  myTabRow:      { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  myTab:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border, gap: 6 },
  myTabActive:   { backgroundColor: colors.primary + '15', borderColor: colors.primary },
  myTabText:     { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  myTabTextActive: { color: colors.primary },
});
