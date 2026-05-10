import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  Dimensions,
  RefreshControl,
  Animated,
  Modal,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Recipe } from '../../types/recipe';
import { recipeService } from '../../services/recipeService';
import { mealPlanService } from '../../services/mealPlanService';
import { getRecipeIdFromSlot, DEFAULT_MEAL_TYPES } from '../../types/mealplan';
import { useThemeStore, ThemeColors } from '../../store/themeStore';
import { useDataStore } from '../../store/dataStore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 48) / 2;
const H_CARD_W = 160;
const SHEET_H = SCREEN_H * 0.72;
const FETCH_LIMIT = 60;

type MainTab = 'browse' | 'myRecipes';
type MyRecipesTab = 'liked' | 'saved' | 'created';
type SortOption = 'popular' | 'newest' | 'quick';
type CookTimeOption = 'any' | '15' | '30' | '60';

interface CategoryDef {
  key: string;
  label: string;
  emoji: string;
  mealType?: string;
  cuisine?: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'popular',       label: 'Popular',       emoji: '🔥' },
  { key: 'dinner',        label: 'Dinner',         emoji: '🍽️', mealType: 'Dinner' },
  { key: 'lunch',         label: 'Lunch',          emoji: '🥗', mealType: 'Lunch' },
  { key: 'breakfast',     label: 'Breakfast',      emoji: '🍳', mealType: 'Breakfast' },
  { key: 'snack',         label: 'Snack',          emoji: '🍎', mealType: 'Snack' },
  { key: 'dessert',       label: 'Dessert',        emoji: '🍰', mealType: 'Dessert' },
  { key: 'italian',       label: 'Italian',        emoji: '🍝', cuisine: 'Italian' },
  { key: 'mexican',       label: 'Mexican',        emoji: '🌮', cuisine: 'Mexican' },
  { key: 'asian',         label: 'Asian',          emoji: '🥢', cuisine: 'Asian' },
  { key: 'mediterranean', label: 'Mediterranean',  emoji: '🫒', cuisine: 'Mediterranean' },
  { key: 'american',      label: 'American',       emoji: '🍔', cuisine: 'American' },
  { key: 'indian',        label: 'Indian',         emoji: '🍛', cuisine: 'Indian' },
  { key: 'japanese',      label: 'Japanese',       emoji: '🍱', cuisine: 'Japanese' },
  { key: 'thai',          label: 'Thai',           emoji: '🌶️', cuisine: 'Thai' },
];

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Keto', 'Paleo', 'Pescatarian'];
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
  info:          { padding: 10, paddingBottom: 12 },
  title:         { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6, lineHeight: 19 },
  chips:         { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip:          { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.border, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  chipText:      { fontSize: 11, fontWeight: '600', color: colors.textMuted },
});

// ─── Horizontal Row ───────────────────────────────────────────────────────────

const HRow: React.FC<{ title: string; recipes: Recipe[]; onPress: (r: Recipe) => void; colors: ThemeColors }> = ({
  title, recipes, onPress, colors,
}) => {
  if (!recipes.length) return null;
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, paddingHorizontal: 16, marginBottom: 12 }}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {recipes.map(r => (
          <RecipeCard key={r.id} recipe={r} onPress={() => onPress(r)} colors={colors} width={H_CARD_W} compact showActions />
        ))}
      </ScrollView>
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
  activeCount: number;
  onClear: () => void;
  colors: ThemeColors;
  bottomInset: number;
}> = ({ visible, onClose, sortBy, onSortChange, cookTime, onCookTimeChange, dietary, onDietaryChange, activeCount, onClear, colors, bottomInset }) => {
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

  // Tabs
  const [mainTab,      setMainTab]      = useState<MainTab>('browse');
  const [myTab,        setMyTab]        = useState<MyRecipesTab>('liked');

  // Category pills & filters
  const [category,    setCategory]    = useState<CategoryDef>(CATEGORIES[0]);
  const [sortBy,      setSortBy]      = useState<SortOption>('popular');
  const [cookTime,    setCookTime]    = useState<CookTimeOption>('any');
  const [dietary,     setDietary]     = useState<string[]>([]);
  const [filterOpen,  setFilterOpen]  = useState(false);

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

  const activeFilterCount = (sortBy !== 'popular' ? 1 : 0) + (cookTime !== 'any' ? 1 : 0) + dietary.length;

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
    if (sortBy === 'newest') {
      r = [...r].sort((a, b) => (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0));
    } else if (sortBy === 'quick') {
      r = [...r].sort((a, b) => ((a.prep_time || 0) + (a.cook_time || 0)) - ((b.prep_time || 0) + (b.cook_time || 0)));
    }
    return r;
  };

  // ── Load recipes ──────────────────────────────────────────────────────────

  const loadRecipes = async (reset: boolean) => {
    if (reset) { setLoading(true); offsetRef.current = 0; setHero(null); setTrending([]); setQuick([]); }
    else        setLoadingMore(true);

    try {
      // Use cache for default Popular view
      if (reset && category.key === 'popular' && !search && sortBy === 'popular' && cookTime === 'any' && dietary.length === 0) {
        if (feedFresh && cachedFeed.length > 0) {
          const f = applyFilters(cachedFeed);
          setRecipes(f);
          setHero(f[0] || null);
          setTrending(f.slice(0, 8));
          setQuick(f.filter(x => { const t = (x.prep_time || 0) + (x.cook_time || 0); return t > 0 && t <= 30; }).slice(0, 8));
          setLoading(false);
          return;
        }
      }

      const results = await recipeService.getAllRecipes(
        FETCH_LIMIT, offsetRef.current,
        search || undefined,
        category.mealType,
        undefined,
        category.cuisine,
      );

      const filtered = applyFilters(results);
      offsetRef.current += results.length;

      if (reset) {
        setRecipes(filtered);
        setHero(filtered[0] || null);
        setTrending(filtered.slice(0, 8));
        setQuick(filtered.filter(x => { const t = (x.prep_time || 0) + (x.cook_time || 0); return t > 0 && t <= 30; }).slice(0, 8));

        if (category.key === 'popular' && !search && sortBy === 'popular' && cookTime === 'any' && dietary.length === 0) {
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

  // Reload when category / filters / search change
  const prevKey = useRef('');
  useEffect(() => {
    const key = `${category.key}|${sortBy}|${cookTime}|${dietary.join(',')}|${search}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    loadRecipes(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.key, sortBy, cookTime, dietary, search]);

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
  const heroLabel   = category.key === 'popular' ? "Today's Pick" : `Top ${category.label}`;
  const trendLabel  = category.key === 'popular' ? 'Trending This Week' : `Popular ${category.label}`;
  const quickLabel  = category.key === 'popular' ? 'Quick & Easy'       : `Quick ${category.label}`;

  const activeMyList = myTab === 'liked' ? liked : myTab === 'saved' ? saved : created;
  const s = createStyles(colors);

  const BrowseHeader = () => (
    <View style={{ paddingTop: 8 }}>
      {!search && hero    && <HeroCard recipe={hero} label={heroLabel} onPress={() => goTo(hero)} colors={colors} />}
      {!search            && <TodayStrip meals={todayMeals} onPress={goTo} colors={colors} />}
      {!search            && <HRow title={trendLabel} recipes={trending} onPress={goTo} colors={colors} />}
      {!search            && <HRow title={quickLabel}  recipes={quick}    onPress={goTo} colors={colors} />}
      <Text style={[s.sectionTitle, { paddingHorizontal: 16, marginBottom: 10 }]}>
        {search ? `Results for "${search}"` : trending.length > 0 ? 'More Recipes' : 'All Recipes'}
      </Text>
    </View>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Recipes</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.iconBtn} onPress={() => { if (searchOpen) clearSearch(); else setSearchOpen(true); }} activeOpacity={0.7}>
            <Ionicons name={searchOpen ? 'close' : 'search'} size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={goCreate} activeOpacity={0.7}>
            <Ionicons name="add" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

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
          {/* ── Category pills + filter icon ── */}
          <View style={s.pillsRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillsContent}>
              {CATEGORIES.map(cat => {
                const active = category.key === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key} activeOpacity={0.75}
                    onPress={() => setCategory(cat)}
                    style={[s.pill, active && s.pillActive]}
                  >
                    <Text style={s.pillEmoji}>{cat.emoji}</Text>
                    <Text style={[s.pillText, active && s.pillTextActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[s.filterIcon, activeFilterCount > 0 && s.filterIconActive]}
              onPress={() => setFilterOpen(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="options-outline" size={20} color={activeFilterCount > 0 ? '#FFF' : colors.text} />
              {activeFilterCount > 0 && (
                <View style={s.filterBadge}>
                  <Text style={s.filterBadgeText}>{activeFilterCount}</Text>
                </View>
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
                    <Text style={s.emptyTitle}>No recipes found</Text>
                    <Text style={s.emptySub}>Try a different category or adjust your filters</Text>
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
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadRecipes(true); await loadTodayMenu(); setRefreshing(false); }} tintColor={colors.primary} />}
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
        sortBy={sortBy}       onSortChange={setSortBy}
        cookTime={cookTime}   onCookTimeChange={setCookTime}
        dietary={dietary}     onDietaryChange={setDietary}
        activeCount={activeFilterCount}
        onClear={() => { setSortBy('popular'); setCookTime('any'); setDietary([]); }}
        colors={colors}
        bottomInset={insets.bottom}
      />
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root:      { flex: 1, backgroundColor: colors.background },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 8 : 14, paddingBottom: 14, backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 28, fontWeight: '800', color: colors.primary },
  iconBtn:   { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '18', justifyContent: 'center', alignItems: 'center' },
  addBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 10, marginBottom: 2, paddingHorizontal: 14, height: 44, backgroundColor: colors.backgroundSecondary, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primary + '40' },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },

  tabRow:       { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab:          { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  tabActive:    { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText:      { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: '#FFF' },

  pillsRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.backgroundSecondary },
  pillsContent: { paddingHorizontal: 14, gap: 8, paddingRight: 6 },
  pill:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background, gap: 5 },
  pillActive:   { backgroundColor: colors.primary, borderColor: colors.primary },
  pillEmoji:    { fontSize: 14 },
  pillText:     { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  pillTextActive: { color: '#FFF' },

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
