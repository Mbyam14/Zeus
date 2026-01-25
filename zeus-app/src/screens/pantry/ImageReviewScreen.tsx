import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DetectedPantryItem, PantryItemCreate, PantryCategory } from '../../types/pantry';
import { pantryService } from '../../services/pantryService';
import { useThemeStore } from '../../store/themeStore';

const CATEGORY_EMOJIS: Record<PantryCategory, string> = {
  Produce: '🥬', Dairy: '🥛', Protein: '🍗', Grains: '🌾',
  Spices: '🌶️', Condiments: '🧂', Beverages: '☕', Frozen: '🧊',
  Pantry: '🥫', Other: '📦'
};

interface ImageReviewScreenProps {
  route: {
    params: {
      detectedItems: DetectedPantryItem[];
      imageUri: string;
      analysisNotes?: string;
    };
  };
  navigation: any;
}

export const ImageReviewScreen: React.FC<ImageReviewScreenProps> = ({
  route,
  navigation,
}) => {
  const { detectedItems, imageUri, analysisNotes } = route.params;
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  // Track which items are selected for adding
  const [selectedItems, setSelectedItems] = useState<Set<number>>(() => {
    // Pre-select items that are not already in pantry
    const initialSelected = new Set<number>();
    detectedItems.forEach((item, index) => {
      if (!item.already_in_pantry) {
        initialSelected.add(index);
      }
    });
    return initialSelected;
  });

  const [adding, setAdding] = useState(false);

  const toggleItem = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const selectAll = () => {
    const newSelected = new Set<number>();
    detectedItems.forEach((_, index) => newSelected.add(index));
    setSelectedItems(newSelected);
  };

  const deselectAll = () => {
    setSelectedItems(new Set());
  };

  const selectNewOnly = () => {
    const newSelected = new Set<number>();
    detectedItems.forEach((item, index) => {
      if (!item.already_in_pantry) {
        newSelected.add(index);
      }
    });
    setSelectedItems(newSelected);
  };

  const handleAddSelected = async () => {
    if (selectedItems.size === 0) {
      Alert.alert('No Items Selected', 'Please select at least one item to add.');
      return;
    }

    setAdding(true);

    try {
      const itemsToAdd: PantryItemCreate[] = Array.from(selectedItems).map(index => {
        const item = detectedItems[index];
        return {
          item_name: item.item_name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          expires_at: undefined
        };
      });

      await pantryService.bulkAddPantryItems(itemsToAdd);

      Alert.alert(
        'Success!',
        `Added ${itemsToAdd.length} item${itemsToAdd.length > 1 ? 's' : ''} to your pantry.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } catch (error) {
      console.error('Failed to add items:', error);
      Alert.alert('Error', 'Failed to add items to pantry. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return '#2ECC71';
    if (confidence >= 0.5) return '#F39C12';
    return '#E74C3C';
  };

  const newItemsCount = detectedItems.filter(i => !i.already_in_pantry).length;
  const existingItemsCount = detectedItems.filter(i => i.already_in_pantry).length;
  const selectedCount = selectedItems.size;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review Items</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Image Preview */}
      <View style={styles.imagePreviewContainer}>
        <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
      </View>

      {/* Summary */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>{detectedItems.length}</Text>
          <Text style={styles.summaryLabel}>Detected</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNumber, { color: '#2ECC71' }]}>{newItemsCount}</Text>
          <Text style={styles.summaryLabel}>New</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNumber, { color: '#F39C12' }]}>{existingItemsCount}</Text>
          <Text style={styles.summaryLabel}>In Pantry</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNumber, { color: colors.primary }]}>{selectedCount}</Text>
          <Text style={styles.summaryLabel}>Selected</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickActionButton} onPress={selectNewOnly}>
          <Text style={styles.quickActionText}>New Only</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionButton} onPress={selectAll}>
          <Text style={styles.quickActionText}>Select All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionButton} onPress={deselectAll}>
          <Text style={styles.quickActionText}>Deselect All</Text>
        </TouchableOpacity>
      </View>

      {/* Analysis Notes */}
      {analysisNotes && (
        <View style={styles.notesContainer}>
          <Text style={styles.notesText}>{analysisNotes}</Text>
        </View>
      )}

      {/* Items List */}
      <ScrollView style={styles.itemsList} contentContainerStyle={styles.itemsListContent}>
        {detectedItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.itemCard,
              selectedItems.has(index) && styles.itemCardSelected,
              item.already_in_pantry && styles.itemCardExisting
            ]}
            onPress={() => toggleItem(index)}
          >
            <View style={styles.itemCheckbox}>
              {selectedItems.has(index) ? (
                <View style={styles.checkboxChecked}>
                  <Text style={styles.checkboxCheckmark}>✓</Text>
                </View>
              ) : (
                <View style={styles.checkboxUnchecked} />
              )}
            </View>

            <View style={styles.itemContent}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemEmoji}>{CATEGORY_EMOJIS[item.category]}</Text>
                <Text style={styles.itemName}>{item.item_name}</Text>
                {item.already_in_pantry && (
                  <View style={styles.existingBadge}>
                    <Text style={styles.existingBadgeText}>In Pantry</Text>
                  </View>
                )}
              </View>

              <View style={styles.itemDetails}>
                {item.quantity && (
                  <Text style={styles.itemQuantity}>
                    {item.quantity} {item.unit || 'units'}
                  </Text>
                )}
                <Text style={styles.itemCategory}>{item.category}</Text>
                <View style={[styles.confidenceBadge, { backgroundColor: getConfidenceColor(item.confidence) }]}>
                  <Text style={styles.confidenceText}>{Math.round(item.confidence * 100)}%</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Add Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.addButton, selectedCount === 0 && styles.addButtonDisabled]}
          onPress={handleAddSelected}
          disabled={adding || selectedCount === 0}
        >
          {adding ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.addButtonText}>
              Add {selectedCount} Item{selectedCount !== 1 ? 's' : ''} to Pantry
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  headerSpacer: {
    width: 60,
  },
  imagePreviewContainer: {
    height: 120,
    backgroundColor: colors.backgroundSecondary,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  summaryContainer: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  quickActions: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  quickActionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  notesContainer: {
    padding: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  notesText: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  itemsList: {
    flex: 1,
  },
  itemsListContent: {
    padding: 12,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  itemCardSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  itemCardExisting: {
    opacity: 0.7,
  },
  itemCheckbox: {
    marginRight: 12,
    justifyContent: 'center',
  },
  checkboxUnchecked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  checkboxChecked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxCheckmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  itemEmoji: {
    fontSize: 18,
    marginRight: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  existingBadge: {
    backgroundColor: '#F39C12',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  existingBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  itemDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  itemQuantity: {
    fontSize: 14,
    color: colors.textMuted,
  },
  itemCategory: {
    fontSize: 12,
    color: colors.textMuted,
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  confidenceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  footer: {
    padding: 16,
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
