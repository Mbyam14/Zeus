/**
 * GroceryListScreen
 *
 * Display and manage grocery list generated from meal plan.
 * Features:
 * - Items grouped by category with collapsible sections
 * - Purchase tracking with checkboxes
 * - Pantry item indicators
 * - Filter tabs (all, need to buy, purchased, in pantry)
 * - Progress ring + summary stats
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  SectionList,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { groceryListService } from '../../services/groceryListService';
import { mealPlanService } from '../../services/mealPlanService';
import { InstacartCheckoutModal } from '../../components/InstacartCheckoutModal';
import {
  GroceryList,
  GroceryListItem,
  GroceryListFilter,
  GroceryCategory,
  CATEGORY_EMOJIS,
  CATEGORY_COLORS,
} from '../../types/grocerylist';
import { useThemeStore } from '../../store/themeStore';
import { GroceryItemSkeleton } from '../../components/SkeletonLoader';
import { EmptyState } from '../../components/EmptyState';

export const GroceryListScreen: React.FC = () => {
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  const [groceryList, setGroceryList] = useState<GroceryList | null>(null);
  const [mealPlanId, setMealPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filter, setFilter] = useState<GroceryListFilter>('all');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showInstacartModal, setShowInstacartModal] = useState<boolean>(false);

  useFocusEffect(
    useCallback(() => {
      loadGroceryList();
    }, [])
  );

  const loadGroceryList = async () => {
    try {
      setLoading(true);
      const currentMealPlan = await mealPlanService.getCurrentWeekMealPlan();
      if (!currentMealPlan) {
        setMealPlanId(null);
        setGroceryList(null);
        setLoading(false);
        return;
      }
      setMealPlanId(currentMealPlan.id);
      const existingList = await groceryListService.getGroceryListByMealPlan(currentMealPlan.id);
      setGroceryList(existingList || null);
    } catch (error: any) {
      console.error('Error loading grocery list:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateList = async () => {
    if (!mealPlanId) {
      Alert.alert('No Meal Plan', 'Create a meal plan first from the Meal Plan tab.');
      return;
    }
    try {
      setGenerating(true);
      const newList = await groceryListService.generateGroceryList(mealPlanId);
      setGroceryList(newList);
    } catch (error: any) {
      console.error('Error generating grocery list:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to generate grocery list');
    } finally {
      setGenerating(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await handleGenerateList();
    setRefreshing(false);
  };

  const handleToggleItemPurchased = async (item: GroceryListItem) => {
    const previousList = groceryList;
    setGroceryList((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.items.map((i) =>
        i.id === item.id ? { ...i, is_purchased: !i.is_purchased } : i
      );
      const itemsByCategory: Record<string, GroceryListItem[]> = {};
      updatedItems.forEach((i) => {
        if (!itemsByCategory[i.category]) itemsByCategory[i.category] = [];
        itemsByCategory[i.category].push(i);
      });
      return {
        ...prev,
        items: updatedItems,
        items_by_category: itemsByCategory,
        purchased_items_count: updatedItems.filter((i) => i.is_purchased).length,
      };
    });
    try {
      await groceryListService.toggleItemPurchased(item.id, !item.is_purchased);
    } catch {
      setGroceryList(previousList);
    }
  };

  const handleMarkAllPurchased = () => {
    Alert.alert('Mark All Purchased', 'Mark all items as purchased?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark All',
        onPress: async () => {
          if (!groceryList) return;
          try {
            setLoading(true);
            const updatedList = await groceryListService.markAllPurchased(groceryList.id);
            setGroceryList(updatedList);
          } catch {
            Alert.alert('Error', 'Failed to mark all items as purchased');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleClearList = () => {
    Alert.alert('Clear Grocery List', 'Clear this list? You can regenerate it anytime.', [
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
          } catch {
            Alert.alert('Error', 'Failed to clear grocery list');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const toggleSection = (category: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const getFilteredItems = (): GroceryListItem[] => {
    if (!groceryList) return [];
    switch (filter) {
      case 'needed':
        return groceryList.items.filter((i) => !i.is_purchased && !i.have_in_pantry);
      case 'purchased':
        return groceryList.items.filter((i) => i.is_purchased);
      case 'in-pantry':
        return groceryList.items.filter((i) => i.have_in_pantry);
      default:
        return groceryList.items;
    }
  };

  const getSectionedItems = () => {
    const filtered = getFilteredItems();
    const grouped: Record<string, GroceryListItem[]> = {};
    filtered.forEach((item) => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });
    return Object.entries(grouped)
      .map(([category, items]) => ({
        title: category as GroceryCategory,
        data: collapsedSections.has(category) ? [] : items,
        fullCount: items.length,
        purchasedCount: items.filter((i) => i.is_purchased).length,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  };

  // === Stats ===
  const totalItems = groceryList?.total_items || 0;
  const purchasedCount = groceryList?.purchased_items_count || 0;
  const pantryCount = groceryList?.items_in_pantry_count || 0;
  const needCount = totalItems - purchasedCount - pantryCount;
  const progress = totalItems > 0 ? purchasedCount / totalItems : 0;

  // === LOADING STATE ===
  if (loading && !groceryList) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Grocery List</Text>
        </View>
        <GroceryItemSkeleton />
        <GroceryItemSkeleton />
      </View>
    );
  }

  // === EMPTY STATE ===
  if (!groceryList && !loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Grocery List</Text>
        </View>
        {!mealPlanId ? (
          <EmptyState
            icon="calendar-outline"
            title="No Meal Plan Yet"
            description="Create a meal plan first, then come back to generate your smart shopping list."
            actionLabel="Go to Meal Plans"
          />
        ) : (
          <EmptyState
            icon="cart-outline"
            title="Ready to Shop?"
            description="Generate a grocery list from your meal plan with smart pantry matching — we'll check what you already have."
            actionLabel={generating ? 'Generating...' : 'Generate List'}
            onAction={generating ? undefined : handleGenerateList}
          />
        )}
      </View>
    );
  }

  // === MAIN VIEW ===
  const sections = getSectionedItems();

  const renderItem = ({ item }: { item: GroceryListItem }) => (
    <TouchableOpacity
      style={[styles.itemRow, item.is_purchased && styles.itemRowPurchased]}
      onPress={() => handleToggleItemPurchased(item)}
      activeOpacity={0.6}
    >
      <View style={[styles.checkbox, item.is_purchased && styles.checkboxChecked]}>
        {item.is_purchased && (
          <Ionicons name="checkmark" size={14} color="#FFF" />
        )}
      </View>

      <View style={styles.itemContent}>
        <Text
          style={[styles.itemName, item.is_purchased && styles.itemNamePurchased]}
          numberOfLines={1}
        >
          {item.item_name?.trim()}
        </Text>
        {item.unit && item.unit.includes('+') ? (
          <Text style={styles.itemQty}>{item.unit}</Text>
        ) : item.needed_quantity !== undefined && item.needed_quantity > 0 ? (
          <Text style={styles.itemQty}>
            {item.needed_quantity} {item.unit || ''}
          </Text>
        ) : null}
      </View>

      {item.have_in_pantry && (
        <View style={styles.pantryChip}>
          <Ionicons name="home-outline" size={11} color={colors.success} />
          <Text style={styles.pantryChipText}>Pantry</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderSectionHeader = ({
    section,
  }: {
    section: { title: GroceryCategory; data: GroceryListItem[]; fullCount: number; purchasedCount: number };
  }) => {
    const emoji = CATEGORY_EMOJIS[section.title];
    const color = CATEGORY_COLORS[section.title] || colors.textMuted;
    const isCollapsed = collapsedSections.has(section.title);
    const allDone = section.purchasedCount === section.fullCount;

    return (
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection(section.title)}
        activeOpacity={0.7}
      >
        <View style={[styles.sectionDot, { backgroundColor: color }]} />
        <Text style={styles.sectionEmoji}>{emoji}</Text>
        <Text style={[styles.sectionTitle, allDone && styles.sectionTitleDone]}>
          {section.title}
        </Text>
        <View style={styles.sectionRight}>
          <Text style={styles.sectionCount}>
            {section.purchasedCount}/{section.fullCount}
          </Text>
          <Ionicons
            name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </View>
      </TouchableOpacity>
    );
  };

  const filters: { key: GroceryListFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: totalItems },
    { key: 'needed', label: 'To Buy', count: Math.max(0, needCount) },
    { key: 'purchased', label: 'Done', count: purchasedCount },
    { key: 'in-pantry', label: 'Pantry', count: pantryCount },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Grocery List</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={handleRefresh}>
            <Ionicons name="refresh-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={handleClearList}>
            <Ionicons name="trash-outline" size={20} color={colors.error || '#FF3B30'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress Card */}
      <View style={styles.progressCard}>
        <View style={styles.progressRingContainer}>
          <View style={styles.progressRingOuter}>
            <View style={styles.progressRingInner}>
              <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
            </View>
            {/* Simple visual ring using border */}
            <View
              style={[
                styles.progressRingFill,
                {
                  borderTopColor: progress > 0 ? colors.success : colors.border,
                  borderRightColor: progress > 0.25 ? colors.success : colors.border,
                  borderBottomColor: progress > 0.5 ? colors.success : colors.border,
                  borderLeftColor: progress > 0.75 ? colors.success : colors.border,
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalItems}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{Math.max(0, needCount)}</Text>
            <Text style={styles.statLabel}>To Buy</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.success }]}>{purchasedCount}</Text>
            <Text style={styles.statLabel}>Done</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#8B5CF6' }]}>{pantryCount}</Text>
            <Text style={styles.statLabel}>Pantry</Text>
          </View>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {filters.map((f) => {
          const isActive = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                {f.label}
              </Text>
              <View style={[styles.filterBadge, isActive && styles.filterBadgeActive]}>
                <Text style={[styles.filterBadgeText, isActive && styles.filterBadgeTextActive]}>
                  {f.count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Items List */}
      {sections.length > 0 ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          stickySectionHeadersEnabled={true}
          ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        />
      ) : (
        <View style={styles.emptyFilterContainer}>
          <Ionicons name="filter-outline" size={40} color={colors.border} />
          <Text style={styles.emptyFilterText}>No items match this filter</Text>
        </View>
      )}

      {/* Bottom Actions */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.bottomBtnSecondary}
          onPress={handleMarkAllPurchased}
        >
          <Ionicons name="checkmark-done-outline" size={18} color={colors.primary} />
          <Text style={styles.bottomBtnSecondaryText}>Mark All Done</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomBtnPrimary}
          onPress={() => setShowInstacartModal(true)}
        >
          <Ionicons name="cart-outline" size={18} color={colors.buttonText} />
          <Text style={styles.bottomBtnPrimaryText}>Order Instacart</Text>
        </TouchableOpacity>
      </View>

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

    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'ios' ? 60 : 16,
      paddingBottom: 12,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.primary,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    headerBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },

    // Center / Empty
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    emptyIconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.primary + '15',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    emptyTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
    },
    generateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 14,
      marginTop: 24,
      gap: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    generateButtonText: {
      color: colors.buttonText,
      fontSize: 16,
      fontWeight: '600',
    },

    // Progress Card
    progressCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 4,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 16,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    progressRingContainer: {
      marginRight: 16,
    },
    progressRingOuter: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: 'center',
      alignItems: 'center',
    },
    progressRingInner: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.backgroundSecondary,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2,
    },
    progressRingFill: {
      position: 'absolute',
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 5,
      zIndex: 1,
    },
    progressPercent: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    statsGrid: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    statLabel: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
      fontWeight: '500',
    },
    statDivider: {
      width: 1,
      height: 28,
    },

    // Filter Tabs
    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
    },
    filterTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    filterTabActive: {
      backgroundColor: colors.primary + '15',
      borderColor: colors.primary,
    },
    filterTabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
    },
    filterTabTextActive: {
      color: colors.primary,
    },
    filterBadge: {
      backgroundColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 5,
      paddingVertical: 1,
      minWidth: 20,
      alignItems: 'center',
    },
    filterBadgeActive: {
      backgroundColor: colors.primary,
    },
    filterBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
    },
    filterBadgeTextActive: {
      color: colors.buttonText,
    },

    // Section Headers
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + '60',
    },
    sectionDot: {
      width: 4,
      height: 20,
      borderRadius: 2,
      marginRight: 8,
    },
    sectionEmoji: {
      fontSize: 16,
      marginRight: 6,
    },
    sectionTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    sectionTitleDone: {
      color: colors.textMuted,
    },
    sectionRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sectionCount: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '500',
    },

    // Items
    listContent: {
      paddingBottom: 90,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 20,
      backgroundColor: colors.backgroundSecondary,
    },
    itemRowPurchased: {
      opacity: 0.55,
    },
    itemSeparator: {
      height: 1,
      backgroundColor: colors.border + '40',
      marginLeft: 52,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      marginRight: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkboxChecked: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    itemContent: {
      flex: 1,
    },
    itemName: {
      fontSize: 15,
      color: colors.text,
      fontWeight: '500',
    },
    itemNamePurchased: {
      textDecorationLine: 'line-through',
      color: colors.textMuted,
    },
    itemQty: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
    pantryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.success + '15',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 8,
      gap: 3,
      marginLeft: 8,
    },
    pantryChipText: {
      fontSize: 11,
      color: colors.success,
      fontWeight: '600',
    },

    // Empty filter
    emptyFilterContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    emptyFilterText: {
      fontSize: 15,
      color: colors.textMuted,
    },

    // Bottom Bar
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      paddingVertical: 10,
      paddingHorizontal: 16,
      paddingBottom: Platform.OS === 'ios' ? 24 : 10,
      backgroundColor: colors.backgroundSecondary,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 10,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 5,
    },
    bottomBtnSecondary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.primary,
      gap: 6,
    },
    bottomBtnSecondaryText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    bottomBtnPrimary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
      gap: 6,
    },
    bottomBtnPrimaryText: {
      color: colors.buttonText,
      fontSize: 14,
      fontWeight: '600',
    },
  });
