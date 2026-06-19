import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore, ThemeColors } from '../../store/themeStore';
import { RecipeHubScreen } from '../recipes/RecipeHubScreen';
import { consumePendingPickHandler } from '../../lib/pendingRecipePick';
import { setPendingCreateHandler } from '../../lib/pendingRecipeCreate';
import { Recipe } from '../../types/recipe';

interface Props {
  navigation: any;
  route: {
    params?: {
      /** Pretty label for the meal slot (e.g. "Breakfast") shown in the title */
      mealLabel?: string;
      /** Pre-applied meal-type filter for the recipe grid */
      mealTypeHint?: string;
      /** 'browse' (default) shows full Recipe Hub; 'created' shows only user's created recipes */
      source?: 'browse' | 'created';
    };
  };
}

export const RecipePickerScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  const mealLabel    = route.params?.mealLabel;
  const mealTypeHint = route.params?.mealTypeHint;
  const source       = route.params?.source ?? 'browse';

  const [addOwnSheetOpen, setAddOwnSheetOpen] = useState(false);

  // The picked recipe is handed back via the module-level registry; we
  // consume it here once and forward to whichever screen registered it.
  const handlePick = (recipe: Recipe) => {
    const handler = consumePendingPickHandler();
    if (handler) handler(recipe);
    navigation.goBack();
  };

  const handleView = (recipe: Recipe) => {
    navigation.navigate('RecipeDetail', { recipe });
  };

  const handleUseCreated = () => {
    setAddOwnSheetOpen(false);
    // Push another copy of this screen in 'created' mode. The pending pick
    // handler is still registered (we don't consume on push), so when the
    // user picks from Created, it'll be handed back to MealPlanEdit.
    navigation.push('RecipePicker', {
      mealLabel,
      source: 'created',
    });
  };

  const handleCreateNew = () => {
    // When the create flow finishes, the new recipe should land in the slot —
    // same registry path as picking an existing recipe.
    setPendingCreateHandler((recipe) => {
      const handler = consumePendingPickHandler();
      if (handler) handler(recipe);
      // CreateScreen pops itself on save; popping again returns us to MealPlanEdit.
      navigation.goBack();
    });
    setAddOwnSheetOpen(false);
    navigation.navigate('CreateRecipe');
  };

  const titleText = source === 'created'
    ? 'My Created Recipes'
    : mealLabel ? `Choose ${mealLabel}` : 'Choose Recipe';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>{source === 'created' ? 'Back' : 'Cancel'}</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{titleText}</Text>
        {source === 'browse' ? (
          <TouchableOpacity
            onPress={() => setAddOwnSheetOpen(true)}
            style={styles.addOwnBtn}
            accessibilityLabel="Add your own recipe"
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
            <Text style={styles.addOwnBtnText}>Add Your Own</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <RecipeHubScreen
          pickMode={{
            source,
            onAdd:  (r) => handlePick(r as any),
            onView: (r) => handleView(r as any),
            mealTypeHint,
          }}
        />
      </View>

      {/* "Add Your Own" bottom sheet */}
      <Modal
        visible={addOwnSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddOwnSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setAddOwnSheetOpen(false)}
        >
          <View
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Your Own</Text>
            <Text style={styles.sheetSubtitle}>
              Pick from recipes you've created, or build a new one.
            </Text>

            <TouchableOpacity style={styles.sheetItem} onPress={handleUseCreated}>
              <View style={[styles.sheetIcon, { backgroundColor: colors.primary + '1A' }]}>
                <Ionicons name="bookmark-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>Use a Recipe I Created</Text>
                <Text style={styles.sheetItemSub}>Browse your created recipes</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetItem} onPress={handleCreateNew}>
              <View style={[styles.sheetIcon, { backgroundColor: colors.primary + '1A' }]}>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>Create New Recipe</Text>
                <Text style={styles.sheetItemSub}>Build one from scratch — added to this slot when saved</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetCancel} onPress={() => setAddOwnSheetOpen(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default RecipePickerScreen;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  cancel: { fontSize: 16, color: colors.primary },
  title:  { fontSize: 17, fontWeight: '700', color: colors.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  addOwnBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '10',
  },
  addOwnBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 18, paddingTop: 10,
  },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },
  sheetSubtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 12,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 14, marginBottom: 10,
  },
  sheetIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sheetItemTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  sheetItemSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sheetCancel: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  sheetCancelText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
});
