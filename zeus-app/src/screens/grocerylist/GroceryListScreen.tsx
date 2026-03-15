/**
 * GroceryListScreen
 *
 * Display and manage grocery list generated from meal plan.
 * Features:
 * - Items grouped by category
 * - Purchase tracking with checkboxes
 * - Pantry item indicators
 * - Filter options (all, needed, purchased)
 * - Summary statistics
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  SectionList,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { groceryListService } from '../../services/groceryListService';
import { mealPlanService } from '../../services/mealPlanService';
import { InstacartCheckoutModal } from '../../components/InstacartCheckoutModal';
import {
  GroceryList,
  GroceryListItem,
  GroceryListFilter,
  GroceryCategory,
  RecipeWarning,
  CATEGORY_EMOJIS,
  CATEGORY_COLORS,
} from '../../types/grocerylist';
import { useThemeStore } from '../../store/themeStore';

export const GroceryListScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  // State
  const [groceryList, setGroceryList] = useState<GroceryList | null>(null);
  const [mealPlanId, setMealPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filter, setFilter] = useState<GroceryListFilter>('all');
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set());
  const [showWarnings, setShowWarnings] = useState<boolean>(false);
  const [showInstacartModal, setShowInstacartModal] = useState<boolean>(false);

  // Load grocery list on focus (re-fetches when navigating to this tab)
  useFocusEffect(
    useCallback(() => {
      loadGroceryList();
    }, [])
  );

  /**
   * Load grocery list from API
   */
  const loadGroceryList = async () => {
    try {
      setLoading(true);

      // First, get the current meal plan
      const currentMealPlan = await mealPlanService.getCurrentWeekMealPlan();

      if (!currentMealPlan) {
        // No meal plan exists
        setMealPlanId(null);
        setGroceryList(null);
        setLoading(false);
        return;
      }

      setMealPlanId(currentMealPlan.id);

      // Try to find existing grocery list for this meal plan
      const existingList = await groceryListService.getGroceryListByMealPlan(currentMealPlan.id);

      if (existingList) {
        setGroceryList(existingList);
      } else {
        // No list exists, show generate prompt
        setGroceryList(null);
      }
    } catch (error: any) {
      console.error('Error loading grocery list:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load grocery list');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Generate new grocery list from meal plan
   */
  const handleGenerateList = async () => {
    if (!mealPlanId) {
      Alert.alert('No Meal Plan', 'Please generate a meal plan first from the Meal Plan tab.');
      return;
    }

    try {
      setLoading(true);
      const newList = await groceryListService.generateGroceryList(mealPlanId);
      setGroceryList(newList);
      Alert.alert('Success', 'Grocery list generated successfully!');
    } catch (error: any) {
      console.error('Error generating grocery list:', error);
      Alert.alert(
        'Error',
        error.response?.data?.detail || 'Failed to generate grocery list'
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Refresh grocery list (regenerate)
   */
  const handleRefresh = async () => {
    setRefreshing(true);
    await handleGenerateList();
    setRefreshing(false);
  };

  /**
   * Toggle item purchased status
   */
  const handleToggleItemPurchased = async (item: GroceryListItem) => {
    const previousList = groceryList; // Save for rollback

    // Optimistic update - update UI immediately
    setGroceryList((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.items.map((i) =>
        i.id === item.id ? { ...i, is_purchased: !i.is_purchased } : i
      );
      const itemsByCategory: Record<string, GroceryListItem[]> = {};
      updatedItems.forEach((i) => {
        if (!itemsByCategory[i.category]) {
          itemsByCategory[i.category] = [];
        }
        itemsByCategory[i.category].push(i);
      });
      const purchasedCount = updatedItems.filter((i) => i.is_purchased).length;
      return {
        ...prev,
        items: updatedItems,
        items_by_category: itemsByCategory,
        purchased_items_count: purchasedCount,
      };
    });

    try {
      await groceryListService.toggleItemPurchased(item.id, !item.is_purchased);
    } catch (error: any) {
      console.error('Error toggling item:', error);
      // Rollback on failure
      setGroceryList(previousList);
      Alert.alert('Error', 'Failed to update item. Please try again.');
    }
  };

  /**
   * Mark all items as purchased
   */
  const handleMarkAllPurchased = () => {
    Alert.alert(
      'Mark All Purchased',
      'Mark all items in this list as purchased?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark All',
          style: 'default',
          onPress: async () => {
            if (!groceryList) return;

            try {
              setLoading(true);
              const updatedList = await groceryListService.markAllPurchased(
                groceryList.id
              );
              setGroceryList(updatedList);
              Alert.alert('Success', 'All items marked as purchased!');
            } catch (error: any) {
              console.error('Error marking all purchased:', error);
              Alert.alert('Error', 'Failed to mark all items as purchased');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  /**
   * Clear/delete the grocery list
   */
  const handleClearList = () => {
    Alert.alert(
      'Clear Grocery List',
      'Are you sure you want to clear this grocery list? You can regenerate it anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            if (!groceryList) return;

            try {
              setLoading(true);
              await groceryListService.deleteGroceryList(groceryList.id);
              setGroceryList(null);
            } catch (error: any) {
              console.error('Error clearing grocery list:', error);
              Alert.alert('Error', 'Failed to clear grocery list');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  /**
   * Filter items based on current filter
   */
  const getFilteredItems = (): GroceryListItem[] => {
    if (!groceryList) return [];

    switch (filter) {
      case 'needed':
        return groceryList.items.filter((item) => !item.is_purchased && !item.have_in_pantry);
      case 'purchased':
        return groceryList.items.filter((item) => item.is_purchased);
      case 'in-pantry':
        return groceryList.items.filter((item) => item.have_in_pantry);
      case 'all':
      default:
        return groceryList.items;
    }
  };

  /**
   * Group filtered items by category for SectionList
   */
  const getSectionedItems = () => {
    const filteredItems = getFilteredItems();
    const grouped: Record<string, GroceryListItem[]> = {};

    filteredItems.forEach((item) => {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    });

    // Convert to sections array
    return Object.entries(grouped)
      .map(([category, items]) => ({
        title: category as GroceryCategory,
        data: items,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  };

  /**
   * Render individual grocery item
   */
  const renderItem = ({ item }: { item: GroceryListItem }) => {
    const isToggling = togglingItems.has(item.id);

    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => handleToggleItemPurchased(item)}
        disabled={isToggling}
      >
        {/* Checkbox */}
        <View style={styles.checkbox}>
          {isToggling ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons
              name={item.is_purchased ? 'checkbox' : 'square-outline'}
              size={24}
              color={item.is_purchased ? colors.success : colors.textMuted}
            />
          )}
        </View>

        {/* Item details */}
        <View style={styles.itemDetails}>
          <Text
            style={[
              styles.itemName,
              item.is_purchased && styles.itemNamePurchased,
            ]}
          >
            {item.item_name?.trim()}
          </Text>

          <View style={styles.itemMeta}>
            {/* Quantity - handle combined units like "2 cups + 3 tablespoons" */}
            {item.unit && item.unit.includes('+') ? (
              <Text style={styles.itemQuantity}>
                {item.unit}
              </Text>
            ) : item.needed_quantity !== undefined && item.needed_quantity > 0 ? (
              <Text style={styles.itemQuantity}>
                {item.needed_quantity} {item.unit || ''}
              </Text>
            ) : null}

            {/* Pantry indicator */}
            {item.have_in_pantry && (
              <View style={styles.pantryBadge}>
                <Ionicons name="home" size={12} color={colors.success} />
                <Text style={styles.pantryBadgeText}>In Pantry</Text>
              </View>
            )}
          </View>

          {/* Pantry quantity info */}
          {item.have_in_pantry && item.pantry_quantity && (
            <Text style={styles.pantryInfo}>
              Have: {item.pantry_quantity} {item.pantry_unit || ''}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  /**
   * Render section header (category)
   */
  const renderSectionHeader = ({
    section,
  }: {
    section: { title: GroceryCategory; data: GroceryListItem[] };
  }) => {
    const emoji = CATEGORY_EMOJIS[section.title];
    const color = CATEGORY_COLORS[section.title];

    return (
      <View style={[styles.sectionHeader, { backgroundColor: color + '20' }]}>
        <Text style={styles.sectionHeaderText}>
          {emoji} {section.title}
        </Text>
        <Text style={styles.sectionHeaderCount}>({section.data.length})</Text>
      </View>
    );
  };

  /**
   * Render filter buttons
   */
  const renderFilters = () => (
    <View style={styles.filterContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === 'all' && styles.filterButtonTextActive,
            ]}
          >
            All ({groceryList?.total_items || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, filter === 'needed' && styles.filterButtonActive]}
          onPress={() => setFilter('needed')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === 'needed' && styles.filterButtonTextActive,
            ]}
          >
            Need to Buy
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'purchased' && styles.filterButtonActive,
          ]}
          onPress={() => setFilter('purchased')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === 'purchased' && styles.filterButtonTextActive,
            ]}
          >
            Purchased ({groceryList?.purchased_items_count || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'in-pantry' && styles.filterButtonActive,
          ]}
          onPress={() => setFilter('in-pantry')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filter === 'in-pantry' && styles.filterButtonTextActive,
            ]}
          >
            In Pantry ({groceryList?.items_in_pantry_count || 0})
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  /**
   * Render empty state (no list generated yet)
   */
  if (loading && !groceryList) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Grocery List</Text>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!groceryList && !loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Grocery List</Text>
        </View>

        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={80} color={colors.border} />
          {!mealPlanId ? (
            <>
              <Text style={styles.emptyTitle}>No Meal Plan Found</Text>
              <Text style={styles.emptyText}>
                Create a meal plan first to generate a grocery list. Go to the Meal Plan tab to get started!
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.emptyTitle}>No Grocery List Yet</Text>
              <Text style={styles.emptyText}>
                Generate a grocery list from your meal plan to see all the ingredients you need to buy.
              </Text>
              <TouchableOpacity
                style={styles.generateButton}
                onPress={handleGenerateList}
              >
                <Ionicons name="list" size={20} color={colors.buttonText} />
                <Text style={styles.generateButtonText}>Generate Grocery List</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  // Main render with grocery list
  const sections = getSectionedItems();
  const progress = groceryList && groceryList.total_items > 0
    ? (groceryList.purchased_items_count / groceryList.total_items) * 100
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Grocery List</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity style={styles.moreButton} onPress={handleClearList}>
            <Ionicons name="trash-outline" size={22} color={colors.error || '#FF3B30'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.moreButton} onPress={handleMarkAllPurchased}>
            <Ionicons name="checkmark-done" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>{groceryList?.name}</Text>
        <Text style={styles.summaryDate}>
          Week of {(() => {
            const dateStr = groceryList?.week_start_date;
            if (!dateStr) return 'Unknown';
            try {
              // Handle YYYY-MM-DD format explicitly to avoid timezone issues
              const parts = String(dateStr).split('-');
              if (parts.length === 3) {
                const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                if (!isNaN(d.getTime())) {
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                }
              }
              const d = new Date(dateStr);
              return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleDateString();
            } catch {
              return String(dateStr);
            }
          })()}
        </Text>

        {/* Progress Bar */}
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {groceryList?.purchased_items_count} / {groceryList?.total_items} items
          </Text>
        </View>
      </View>

      {/* Warnings Banner */}
      {groceryList?.warnings && groceryList.warnings.length > 0 && (
        <TouchableOpacity
          style={styles.warningBanner}
          onPress={() => setShowWarnings(!showWarnings)}
        >
          <View style={styles.warningHeader}>
            <Ionicons name="warning" size={20} color={colors.warning} />
            <Text style={styles.warningTitle}>
              {groceryList.warnings.length} recipe{groceryList.warnings.length > 1 ? 's' : ''} without ingredients
            </Text>
            <Ionicons
              name={showWarnings ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.warning}
            />
          </View>
          {showWarnings && (
            <View style={styles.warningList}>
              {groceryList.warnings.map((warning, index) => (
                <View key={index} style={styles.warningItem}>
                  <Text style={styles.warningRecipeTitle}>{warning.recipe_title}</Text>
                  <Text style={styles.warningReason}>{warning.reason}</Text>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Filters */}
      {renderFilters()}

      {/* Items List */}
      {sections.length > 0 ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          stickySectionHeadersEnabled={true}
        />
      ) : (
        <View style={styles.emptyFilterContainer}>
          <Text style={styles.emptyFilterText}>No items match this filter</Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonSecondary]}
          onPress={handleRefresh}
        >
          <Ionicons name="refresh" size={20} color={colors.primary} />
          <Text style={styles.actionButtonTextSecondary}>Regenerate</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonPrimary]}
          onPress={() => setShowInstacartModal(true)}
        >
          <Ionicons name="cart" size={20} color={colors.buttonText} />
          <Text style={styles.actionButtonText}>Order with Instacart</Text>
        </TouchableOpacity>
      </View>

      {/* Instacart Checkout Modal */}
      <InstacartCheckoutModal
        visible={showInstacartModal}
        groceryList={groceryList}
        onClose={() => setShowInstacartModal(false)}
      />
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: Platform.OS === 'ios' ? 60 : 16,
      paddingBottom: 16,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.primary,
      flex: 1,
    },
    moreButton: {
      padding: 4,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    emptyTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
      marginTop: 16,
    },
    emptyText: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 24,
    },
    generateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
      marginTop: 24,
    },
    generateButtonText: {
      color: colors.buttonText,
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 8,
    },
    summaryCard: {
      backgroundColor: colors.backgroundSecondary,
      padding: 16,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 12,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    summaryTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
    },
    summaryDate: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 4,
    },
    progressBarContainer: {
      marginTop: 12,
    },
    progressBarBackground: {
      height: 8,
      backgroundColor: colors.border,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: colors.success,
      borderRadius: 4,
    },
    progressText: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 4,
      textAlign: 'right',
    },
    filterContainer: {
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    filterButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: colors.backgroundSecondary,
      marginRight: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterButtonText: {
      fontSize: 14,
      color: colors.textMuted,
      fontWeight: '500',
    },
    filterButtonTextActive: {
      color: colors.buttonText,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 100,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      marginTop: 8,
      marginBottom: 4,
    },
    sectionHeaderText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
      flex: 1,
    },
    sectionHeaderCount: {
      fontSize: 14,
      color: colors.textMuted,
    },
    itemCard: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundSecondary,
      padding: 12,
      marginVertical: 4,
      borderRadius: 8,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    checkbox: {
      marginRight: 12,
      justifyContent: 'center',
    },
    itemDetails: {
      flex: 1,
    },
    itemName: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
    },
    itemNamePurchased: {
      textDecorationLine: 'line-through',
      color: colors.textMuted,
    },
    itemMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      flexWrap: 'wrap',
    },
    itemQuantity: {
      fontSize: 14,
      color: colors.textMuted,
      marginRight: 8,
    },
    pantryBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.successLight,
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    pantryBadgeText: {
      fontSize: 12,
      color: colors.success,
      marginLeft: 4,
      fontWeight: '500',
    },
    pantryInfo: {
      fontSize: 12,
      color: colors.success,
      marginTop: 2,
    },
    emptyFilterContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyFilterText: {
      fontSize: 16,
      color: colors.textMuted,
    },
    actionButtons: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.backgroundSecondary,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 5,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 8,
      marginBottom: 8,
    },
    actionButtonPrimary: {
      backgroundColor: colors.primary,
    },
    actionButtonSecondary: {
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    actionButtonText: {
      color: colors.buttonText,
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 8,
    },
    actionButtonTextSecondary: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 8,
    },
    warningBanner: {
      backgroundColor: colors.warningLight,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    warningHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    warningTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.warningDark,
      marginLeft: 8,
    },
    warningList: {
      marginTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.warning,
      paddingTop: 12,
    },
    warningItem: {
      marginBottom: 8,
    },
    warningRecipeTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    warningReason: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
