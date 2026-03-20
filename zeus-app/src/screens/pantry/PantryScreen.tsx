import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  SectionList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { PantryItem, PantryCategory, PantryItemCreate, IngredientLibraryItem, DetectedPantryItem } from '../../types/pantry';
import { pantryService } from '../../services/pantryService';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';
import { PantryItemSkeleton } from '../../components/SkeletonLoader';
import { EmptyState } from '../../components/EmptyState';
import { smartAIService, CookTonightResult } from '../../services/smartAIService';

const CATEGORIES: PantryCategory[] = [
  'Produce', 'Dairy', 'Protein', 'Grains', 'Spices', 'Condiments', 'Beverages', 'Frozen', 'Canned & Jarred', 'Baking', 'Oils & Vinegars', 'Snacks', 'Other'
];

const UNITS = ['cups', 'tbsp', 'tsp', 'fl oz', 'pieces', 'items', 'cans', 'boxes', 'cloves', 'heads', 'lbs', 'oz', 'Custom'];

const CATEGORY_EMOJIS: Record<PantryCategory, string> = {
  Produce: '🥬', Dairy: '🥛', Protein: '🍗', Grains: '🌾',
  Spices: '🌶️', Condiments: '🧂', Beverages: '☕', Frozen: '🧊',
  'Canned & Jarred': '🥫', Baking: '🧁', 'Oils & Vinegars': '🫒', Snacks: '🍿', Other: '📦'
};

// Common pantry staples for quick-add
interface QuickAddItem {
  name: string;
  category: PantryCategory;
  defaultUnit: string;
}

const QUICK_ADD_ITEMS: { category: string; emoji: string; items: QuickAddItem[] }[] = [
  {
    category: 'Dairy & Eggs',
    emoji: '🥛',
    items: [
      { name: 'Eggs', category: 'Dairy', defaultUnit: 'pieces' },
      { name: 'Milk', category: 'Dairy', defaultUnit: 'cups' },
      { name: 'Butter', category: 'Dairy', defaultUnit: 'tbsp' },
      { name: 'Cheese', category: 'Dairy', defaultUnit: 'oz' },
      { name: 'Greek Yogurt', category: 'Dairy', defaultUnit: 'cups' },
      { name: 'Heavy Cream', category: 'Dairy', defaultUnit: 'cups' },
      { name: 'Sour Cream', category: 'Dairy', defaultUnit: 'cups' },
    ]
  },
  {
    category: 'Produce',
    emoji: '🥬',
    items: [
      { name: 'Onions', category: 'Produce', defaultUnit: 'pieces' },
      { name: 'Garlic', category: 'Produce', defaultUnit: 'cloves' },
      { name: 'Tomatoes', category: 'Produce', defaultUnit: 'pieces' },
      { name: 'Potatoes', category: 'Produce', defaultUnit: 'lbs' },
      { name: 'Carrots', category: 'Produce', defaultUnit: 'pieces' },
      { name: 'Bell Peppers', category: 'Produce', defaultUnit: 'pieces' },
      { name: 'Lemons', category: 'Produce', defaultUnit: 'pieces' },
      { name: 'Limes', category: 'Produce', defaultUnit: 'pieces' },
      { name: 'Lettuce', category: 'Produce', defaultUnit: 'heads' },
      { name: 'Spinach', category: 'Produce', defaultUnit: 'oz' },
    ]
  },
  {
    category: 'Proteins',
    emoji: '🍗',
    items: [
      { name: 'Chicken Breast', category: 'Protein', defaultUnit: 'lbs' },
      { name: 'Ground Beef', category: 'Protein', defaultUnit: 'lbs' },
      { name: 'Bacon', category: 'Protein', defaultUnit: 'oz' },
      { name: 'Salmon', category: 'Protein', defaultUnit: 'lbs' },
      { name: 'Shrimp', category: 'Protein', defaultUnit: 'lbs' },
      { name: 'Tofu', category: 'Protein', defaultUnit: 'oz' },
    ]
  },
  {
    category: 'Pantry Staples',
    emoji: '🥫',
    items: [
      { name: 'Olive Oil', category: 'Pantry', defaultUnit: 'cups' },
      { name: 'Vegetable Oil', category: 'Pantry', defaultUnit: 'cups' },
      { name: 'All-Purpose Flour', category: 'Grains', defaultUnit: 'cups' },
      { name: 'Sugar', category: 'Pantry', defaultUnit: 'cups' },
      { name: 'Brown Sugar', category: 'Pantry', defaultUnit: 'cups' },
      { name: 'Rice', category: 'Grains', defaultUnit: 'cups' },
      { name: 'Pasta', category: 'Grains', defaultUnit: 'oz' },
      { name: 'Bread', category: 'Grains', defaultUnit: 'pieces' },
      { name: 'Chicken Broth', category: 'Pantry', defaultUnit: 'cups' },
      { name: 'Canned Tomatoes', category: 'Pantry', defaultUnit: 'cans' },
      { name: 'Beans', category: 'Pantry', defaultUnit: 'cans' },
    ]
  },
  {
    category: 'Spices & Seasonings',
    emoji: '🌶️',
    items: [
      { name: 'Salt', category: 'Spices', defaultUnit: 'tsp' },
      { name: 'Black Pepper', category: 'Spices', defaultUnit: 'tsp' },
      { name: 'Garlic Powder', category: 'Spices', defaultUnit: 'tsp' },
      { name: 'Onion Powder', category: 'Spices', defaultUnit: 'tsp' },
      { name: 'Paprika', category: 'Spices', defaultUnit: 'tsp' },
      { name: 'Cumin', category: 'Spices', defaultUnit: 'tsp' },
      { name: 'Italian Seasoning', category: 'Spices', defaultUnit: 'tsp' },
      { name: 'Cinnamon', category: 'Spices', defaultUnit: 'tsp' },
    ]
  },
  {
    category: 'Condiments',
    emoji: '🧂',
    items: [
      { name: 'Soy Sauce', category: 'Condiments', defaultUnit: 'tbsp' },
      { name: 'Hot Sauce', category: 'Condiments', defaultUnit: 'tbsp' },
      { name: 'Ketchup', category: 'Condiments', defaultUnit: 'tbsp' },
      { name: 'Mustard', category: 'Condiments', defaultUnit: 'tbsp' },
      { name: 'Mayonnaise', category: 'Condiments', defaultUnit: 'tbsp' },
      { name: 'Honey', category: 'Condiments', defaultUnit: 'tbsp' },
      { name: 'Vinegar', category: 'Condiments', defaultUnit: 'tbsp' },
    ]
  },
];

interface PantryScreenProps {
  navigation?: any;
}

export const PantryScreen: React.FC<PantryScreenProps> = ({ navigation }) => {
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PantryCategory | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);

  const { colors } = useThemeStore();
  const styles = createStyles(colors);
  const [newItem, setNewItem] = useState<PantryItemCreate>({
    item_name: '',
    quantity: undefined,
    unit: 'pieces',
    category: 'Other',
    expires_at: undefined
  });

  const [ingredientSuggestions, setIngredientSuggestions] = useState<IngredientLibraryItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [customUnit, setCustomUnit] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [selectedQuickItems, setSelectedQuickItems] = useState<Set<string>>(new Set());
  const [addingQuickItems, setAddingQuickItems] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expiringItems, setExpiringItems] = useState<PantryItem[]>([]);
  const [showExpiringBanner, setShowExpiringBanner] = useState(false);

  // Cook Tonight
  const [cookTonightModal, setCookTonightModal] = useState(false);
  const [cookTonightLoading, setCookTonightLoading] = useState(false);
  const [cookTonightResult, setCookTonightResult] = useState<CookTonightResult | null>(null);

  const handleCookTonight = async () => {
    setCookTonightModal(true);
    setCookTonightLoading(true);
    setCookTonightResult(null);
    try {
      const result = await smartAIService.getCookTonightSuggestion(30);
      setCookTonightResult(result);
    } catch {
      setCookTonightResult({ suggestion: null, message: 'Failed to get suggestion. Try again.' });
    } finally {
      setCookTonightLoading(false);
    }
  };

  useEffect(() => {
    loadPantryItems();
  }, [selectedCategory, searchQuery]);

  // Reload pantry when screen comes into focus (e.g., returning from ImageReviewScreen)
  useFocusEffect(
    useCallback(() => {
      loadPantryItems();
      loadExpiringItems();
      return () => {
        setShowAddDropdown(false);
      };
    }, [selectedCategory, searchQuery])
  );

  const loadExpiringItems = async () => {
    try {
      const items = await pantryService.getExpiringItems(3);
      setExpiringItems(items);
      setShowExpiringBanner(items.length > 0);
    } catch {
      // silently fail
    }
  };

  const loadPantryItems = async () => {
    try {
      setLoading(true);
      console.log('🔄 Loading pantry items...');
      const items = await pantryService.getPantryItems({
        category: selectedCategory || undefined,
        search: searchQuery || undefined
      });
      console.log(`✅ Loaded ${items.length} pantry items`);
      setPantryItems(items);
    } catch (error) {
      Alert.alert('Error', 'Failed to load pantry items');
      console.error('❌ Load pantry items error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Quick-add handlers
  const toggleQuickItem = (itemName: string) => {
    setSelectedQuickItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemName)) {
        newSet.delete(itemName);
      } else {
        newSet.add(itemName);
      }
      return newSet;
    });
  };

  const handleQuickAdd = async () => {
    if (selectedQuickItems.size === 0) {
      Alert.alert('No Items Selected', 'Please select at least one item to add.');
      return;
    }

    setAddingQuickItems(true);
    try {
      // Find the selected items and create pantry items
      const itemsToAdd: PantryItemCreate[] = [];
      QUICK_ADD_ITEMS.forEach(category => {
        category.items.forEach(item => {
          if (selectedQuickItems.has(item.name)) {
            itemsToAdd.push({
              item_name: item.name,
              quantity: 1,
              unit: item.defaultUnit,
              category: item.category,
              expires_at: undefined
            });
          }
        });
      });

      await pantryService.bulkAddPantryItems(itemsToAdd);
      Alert.alert('Success!', `Added ${itemsToAdd.length} item${itemsToAdd.length > 1 ? 's' : ''} to your pantry.`);
      setShowQuickAddModal(false);
      setSelectedQuickItems(new Set());
      loadPantryItems();
    } catch (error) {
      console.error('Quick add error:', error);
      Alert.alert('Error', 'Failed to add items. Please try again.');
    } finally {
      setAddingQuickItems(false);
    }
  };

  const handleIngredientSearch = async (text: string) => {
    setNewItem(prev => ({ ...prev, item_name: text }));

    if (text.length >= 2) {
      try {
        const suggestions = await pantryService.searchIngredients(text, newItem.category, 10);
        setIngredientSuggestions(suggestions);
        setShowSuggestions(suggestions.length > 0);
      } catch (error) {
        console.error('Ingredient search error:', error);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectIngredient = (ingredient: IngredientLibraryItem) => {
    setNewItem(prev => ({
      ...prev,
      item_name: ingredient.name,
      category: ingredient.category,
      unit: ingredient.common_units[0] || 'pieces'
    }));
    setShowSuggestions(false);
  };

  const handleSavePantryItem = async () => {
    if (!newItem.item_name.trim()) {
      Alert.alert('Error', 'Please enter an item name');
      return;
    }

    try {
      if (editingItem) {
        console.log('📝 Updating pantry item:', editingItem.id, 'expires_at:', newItem.expires_at);

        // Update on backend - if expiration was cleared, tell backend explicitly
        const updatePayload = {
          ...newItem,
          clear_expires_at: !newItem.expires_at && !!editingItem.expires_at,
        };
        const updatedItem = await pantryService.updatePantryItem(editingItem.id, updatePayload);
        console.log('✅ Backend returned:', JSON.stringify(updatedItem, null, 2));

        // Optimistically update local state immediately with the backend response
        setPantryItems(prevItems =>
          prevItems.map(item =>
            item.id === editingItem.id ? updatedItem : item
          )
        );

        console.log('🔄 Updated local state with backend response');
        Alert.alert('Success', 'Pantry item updated!');
      } else {
        await pantryService.createPantryItem(newItem);
        Alert.alert('Success', 'Item added to pantry!');
      }

      setShowAddModal(false);
      resetForm();

      // Force reload pantry items from backend to ensure sync
      await loadPantryItems();
    } catch (error) {
      Alert.alert('Error', 'Failed to save pantry item');
      console.error('Save pantry item error:', error);
    }
  };

  const handleDeleteItem = (item: PantryItem) => {
    Alert.alert(
      'Delete Item',
      `Remove ${item.item_name} from pantry?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await pantryService.deletePantryItem(item.id);
              loadPantryItems();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete item');
            }
          }
        }
      ]
    );
  };

  const handleEditItem = (item: PantryItem) => {
    console.log('📝 Editing pantry item:', {
      id: item.id,
      name: item.item_name,
      expires_at: item.expires_at,
      expires_at_type: typeof item.expires_at
    });

    setEditingItem(item);
    setNewItem({
      item_name: item.item_name,
      quantity: item.quantity,
      unit: item.unit || 'pieces',
      category: item.category,
      expires_at: item.expires_at
    });
    setShowAddModal(true);
  };

  const resetForm = () => {
    setEditingItem(null);
    setNewItem({
      item_name: '',
      quantity: undefined,
      unit: 'pieces',
      category: 'Other',
      expires_at: undefined
    });
    setShowSuggestions(false);
    setCustomUnit('');
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }

    if (event.type === 'set' && selectedDate) {
      // Format as YYYY-MM-DD
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const formatted = `${year}-${month}-${day}`;

      console.log('📅 Selected date:', { year, month, day, formatted });
      setNewItem(prev => ({ ...prev, expires_at: formatted }));

      if (Platform.OS === 'ios') {
        setTempDate(selectedDate);
      }
    } else if (event.type === 'dismissed') {
      setShowDatePicker(false);
    }
  };

  const confirmIOSDate = () => {
    setShowDatePicker(false);
  };

  const openDatePicker = () => {
    if (newItem.expires_at) {
      const parts = newItem.expires_at.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        setTempDate(new Date(year, month, day));
      }
    } else {
      setTempDate(new Date());
    }
    setShowDatePicker(true);
  };

  const handlePhotoUpload = () => {
    Alert.alert(
      'Scan Pantry Items',
      'Take a photo of your fridge, pantry, or cabinet to automatically detect items.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Take Photo',
          onPress: () => launchCamera()
        },
        {
          text: 'Choose from Gallery',
          onPress: () => launchGallery()
        }
      ]
    );
  };

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0]);
    }
  };

  const launchGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Gallery permission is required to select photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0]);
    }
  };

  const processImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.base64) {
      Alert.alert('Error', 'Failed to process image. Please try again.');
      return;
    }

    setAnalyzingImage(true);

    try {
      console.log('Analyzing image...');
      const imageType = asset.mimeType || 'image/jpeg';
      const response = await pantryService.analyzeImage(asset.base64, imageType);
      console.log('Analysis complete:', response.analysis_notes);

      if (response.detected_items.length === 0) {
        Alert.alert(
          'No Items Found',
          'Could not detect any food items in this image. Try taking a clearer photo with better lighting.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Navigate to review screen
      navigation?.navigate('ImageReview', {
        detectedItems: response.detected_items,
        imageUri: asset.uri,
        analysisNotes: response.analysis_notes
      });
    } catch (error: any) {
      console.error('Image analysis failed:', error);
      const message = error.response?.data?.detail || 'Failed to analyze image. Please try again.';
      Alert.alert('Analysis Failed', message);
    } finally {
      setAnalyzingImage(false);
    }
  };

  const groupedItems = () => {
    const grouped: Record<PantryCategory, PantryItem[]> = {
      Produce: [], Dairy: [], Protein: [], Grains: [],
      Spices: [], Condiments: [], Beverages: [], Frozen: [],
      Pantry: [], Other: []
    };

    pantryItems.forEach(item => {
      if (grouped[item.category]) {
        grouped[item.category].push(item);
      } else {
        grouped.Other.push(item);
      }
    });

    return CATEGORIES.map(category => ({
      title: category,
      data: grouped[category] || []
    })).filter(section => section.data.length > 0);
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === pantryItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(pantryItems.map(item => item.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedItems(new Set());
  };

  const handleDeleteSelected = () => {
    if (selectedItems.size === 0) return;
    Alert.alert(
      'Delete Selected',
      `Remove ${selectedItems.size} item${selectedItems.size > 1 ? 's' : ''} from your pantry?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await pantryService.bulkDeletePantryItems(Array.from(selectedItems));
              exitSelectionMode();
              loadPantryItems();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete selected items');
            }
          },
        },
      ]
    );
  };

  const renderPantryItem = ({ item }: { item: PantryItem }) => {
    const expirationColor = item.is_expired ? colors.error : item.is_expiring_soon ? colors.warning : colors.text;
    const isSelected = selectedItems.has(item.id);

    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => selectionMode ? toggleItemSelection(item.id) : handleEditItem(item)}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            setSelectedItems(new Set([item.id]));
          }
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {selectionMode && (
            <View style={{
              width: 24, height: 24, borderRadius: 12, borderWidth: 2,
              borderColor: isSelected ? colors.primary : colors.border,
              backgroundColor: isSelected ? colors.primary : 'transparent',
              justifyContent: 'center', alignItems: 'center', marginRight: 12,
            }}>
              {isSelected && <Text style={{ color: colors.buttonText, fontSize: 14, fontWeight: 'bold' }}>✓</Text>}
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>{item.item_name}</Text>
              {(item.is_expiring_soon || item.is_expired) && (
                <View style={[styles.expirationBadge, { backgroundColor: expirationColor }]}>
                  <Text style={styles.expirationText}>
                    {item.is_expired ? 'Expired' : 'Soon'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.itemDetails}>
              {item.quantity && (
                <Text style={styles.itemQuantity}>
                  {item.quantity} {item.unit || 'items'}
                </Text>
              )}
              {item.expires_at && (
                <Text style={[styles.itemExpiry, { color: expirationColor }]}>
                  Exp: {(() => {
                    const parts = item.expires_at.split('-');
                    if (parts.length === 3) {
                      return `${parts[1]}/${parts[2]}/${parts[0]}`;
                    }
                    return item.expires_at;
                  })()}
                </Text>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: { title: PantryCategory } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>
        {CATEGORY_EMOJIS[section.title]} {section.title}
      </Text>
      <Text style={styles.sectionCount}>
        {groupedItems().find(s => s.title === section.title)?.data.length || 0}
      </Text>
    </View>
  );

  const renderEmptyState = () => (
    <EmptyState
      icon="cube-outline"
      title="Your Pantry is Empty"
      description="Add items to your pantry so Zeus can suggest recipes based on what you have and build smarter grocery lists."
      actionLabel="Add Items"
      onAction={() => setShowAddDropdown(true)}
    />
  );

  return (
    <View style={styles.container}>
      {selectionMode ? (
        <View style={styles.header}>
          <TouchableOpacity onPress={exitSelectionMode}>
            <Text style={{ fontSize: 16, color: colors.primary, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { fontSize: 18 }]}>
            {selectedItems.size} Selected
          </Text>
          <TouchableOpacity onPress={toggleSelectAll}>
            <Text style={{ fontSize: 16, color: colors.primary, fontWeight: '600' }}>
              {selectedItems.size === pantryItems.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pantry</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddDropdown(!showAddDropdown)}
          >
            <Text style={styles.addButtonText}>{showAddDropdown ? '×' : '+'}</Text>
          </TouchableOpacity>
        </View>

        {/* Add Dropdown Menu */}
        {showAddDropdown && (
          <View style={styles.dropdownMenu}>
            <TouchableOpacity
              style={styles.dropdownMenuItem}
              onPress={() => {
                setShowAddDropdown(false);
                navigation?.navigate('IngredientSearch');
              }}
            >
              <View style={styles.dropdownMenuIcon}>
                <Text style={styles.dropdownMenuIconText}>🔍</Text>
              </View>
              <Text style={styles.dropdownMenuText}>Search & Add</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dropdownMenuItem, analyzingImage && styles.dropdownMenuItemDisabled]}
              onPress={() => {
                if (!analyzingImage) {
                  setShowAddDropdown(false);
                  handlePhotoUpload();
                }
              }}
              disabled={analyzingImage}
            >
              <View style={styles.dropdownMenuIcon}>
                {analyzingImage ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.dropdownMenuIconText}>📷</Text>
                )}
              </View>
              <Text style={styles.dropdownMenuText}>Scan Items</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownMenuItem}
              onPress={() => {
                setShowAddDropdown(false);
                resetForm();
                setShowAddModal(true);
              }}
            >
              <View style={styles.dropdownMenuIcon}>
                <Text style={styles.dropdownMenuIconText}>✏️</Text>
              </View>
              <Text style={styles.dropdownMenuText}>Add Manually</Text>
            </TouchableOpacity>

            {pantryItems.length > 0 && (
              <TouchableOpacity
                style={styles.dropdownMenuItem}
                onPress={() => {
                  setShowAddDropdown(false);
                  setSelectionMode(true);
                }}
              >
                <View style={styles.dropdownMenuIcon}>
                  <Text style={styles.dropdownMenuIconText}>☑️</Text>
                </View>
                <Text style={styles.dropdownMenuText}>Select</Text>
              </TouchableOpacity>
            )}

            {pantryItems.length > 0 && (
              <TouchableOpacity
                style={styles.dropdownMenuItem}
                onPress={() => {
                  setShowAddDropdown(false);
                  Alert.alert(
                    'Clear All Items',
                    `Remove all ${pantryItems.length} items from your pantry?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear All',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await pantryService.clearAllPantryItems();
                            loadPantryItems();
                          } catch (error) {
                            Alert.alert('Error', 'Failed to clear pantry items');
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <View style={styles.dropdownMenuIcon}>
                  <Text style={styles.dropdownMenuIconText}>🗑️</Text>
                </View>
                <Text style={[styles.dropdownMenuText, { color: colors.error }]}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      )}

      {/* Dropdown Backdrop */}
      {showAddDropdown && (
        <TouchableOpacity
          style={styles.dropdownBackdrop}
          activeOpacity={1}
          onPress={() => setShowAddDropdown(false)}
        />
      )}

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search pantry items..."
            placeholderTextColor={colors.textMuted}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearSearchButton}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterPill, !selectedCategory && styles.filterPillActive]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={[styles.filterPillText, !selectedCategory && styles.filterPillTextActive]}>
              All
            </Text>
          </TouchableOpacity>

          {CATEGORIES.map(category => (
            <TouchableOpacity
              key={category}
              style={[styles.filterPill, selectedCategory === category && styles.filterPillActive]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text style={[styles.filterPillText, selectedCategory === category && styles.filterPillTextActive]}>
                {CATEGORY_EMOJIS[category]} {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Expiring Items Banner */}
      {showExpiringBanner && expiringItems.length > 0 && (
        <View style={styles.expiringBanner}>
          <View style={styles.expiringBannerContent}>
            <Text style={styles.expiringBannerIcon}>⚠️</Text>
            <View style={styles.expiringBannerTextContainer}>
              <Text style={styles.expiringBannerTitle}>
                {expiringItems.length} item{expiringItems.length !== 1 ? 's' : ''} expiring soon
              </Text>
              <Text style={styles.expiringBannerSubtitle}>
                {expiringItems.slice(0, 3).map(i => i.item_name).join(', ')}
                {expiringItems.length > 3 ? ` +${expiringItems.length - 3} more` : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.expiringBannerButton}
            onPress={() => {
              // Navigate to Recipe Hub (Recipes tab)
              (navigation as any).navigate('Recipes');
            }}
          >
            <Text style={styles.expiringBannerButtonText}>Find Recipes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.expiringBannerDismiss}
            onPress={() => setShowExpiringBanner(false)}
          >
            <Text style={styles.expiringBannerDismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <PantryItemSkeleton />
      ) : pantryItems.length === 0 ? (
        renderEmptyState()
      ) : (
        <SectionList
          sections={groupedItems()}
          renderItem={renderPantryItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.listContent, selectionMode && { paddingBottom: 100 }]}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        />
      )}

      {/* Selection Mode Bottom Bar */}
      {selectionMode && selectedItems.size > 0 && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
          paddingHorizontal: 24, paddingVertical: 16, paddingBottom: 32,
          shadowColor: colors.shadow, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 8,
        }}>
          <TouchableOpacity
            onPress={handleDeleteSelected}
            style={{
              backgroundColor: colors.error, borderRadius: 12, paddingVertical: 14,
              justifyContent: 'center', alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.buttonText, fontSize: 16, fontWeight: '700' }}>
              Delete {selectedItems.size} Item{selectedItems.size > 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Analyzing Image Overlay */}
      {analyzingImage && (
        <View style={styles.analyzingOverlay}>
          <View style={styles.analyzingContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.analyzingTitle}>Analyzing Image...</Text>
            <Text style={styles.analyzingText}>Our AI is detecting pantry items in your photo</Text>
          </View>
        </View>
      )}

      {/* Quick Add Modal */}
      <Modal visible={showQuickAddModal} animationType="slide" transparent={true} onRequestClose={() => { setShowQuickAddModal(false); setSelectedQuickItems(new Set()); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.quickAddModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quick Add Staples</Text>
              <TouchableOpacity onPress={() => { setShowQuickAddModal(false); setSelectedQuickItems(new Set()); }}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.quickAddSubtitle}>
              Tap items to select, then add them all at once
            </Text>

            <ScrollView style={styles.quickAddScroll} showsVerticalScrollIndicator={false}>
              {QUICK_ADD_ITEMS.map((category, categoryIndex) => (
                <View key={categoryIndex} style={styles.quickAddCategory}>
                  <Text style={styles.quickAddCategoryTitle}>
                    {category.emoji} {category.category}
                  </Text>
                  <View style={styles.quickAddItemsGrid}>
                    {category.items.map((item, itemIndex) => (
                      <TouchableOpacity
                        key={itemIndex}
                        style={[
                          styles.quickAddItem,
                          selectedQuickItems.has(item.name) && styles.quickAddItemSelected
                        ]}
                        onPress={() => toggleQuickItem(item.name)}
                      >
                        <Text style={[
                          styles.quickAddItemText,
                          selectedQuickItems.has(item.name) && styles.quickAddItemTextSelected
                        ]}>
                          {item.name}
                        </Text>
                        {selectedQuickItems.has(item.name) && (
                          <Text style={styles.quickAddCheckmark}>✓</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
              <View style={{ height: 100 }} />
            </ScrollView>

            <View style={styles.quickAddFooter}>
              <TouchableOpacity
                style={[
                  styles.quickAddButton2,
                  selectedQuickItems.size === 0 && styles.quickAddButtonDisabled
                ]}
                onPress={handleQuickAdd}
                disabled={addingQuickItems || selectedQuickItems.size === 0}
              >
                {addingQuickItems ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : (
                  <Text style={styles.quickAddButtonText2}>
                    Add {selectedQuickItems.size} Item{selectedQuickItems.size !== 1 ? 's' : ''} to Pantry
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showAddModal} animationType="slide" transparent={true} onRequestClose={() => { setShowAddModal(false); resetForm(); }}>
        <KeyboardAvoidingView
          behavior="padding"
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => Keyboard.dismiss()}
          >
            <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingItem ? 'Edit Item' : 'Add to Pantry'}</Text>
                <TouchableOpacity onPress={() => { setShowAddModal(false); resetForm(); }}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.formSection}>
                <Text style={styles.label}>Item Name *</Text>
                <TextInput
                  style={styles.input}
                  value={newItem.item_name}
                  onChangeText={handleIngredientSearch}
                  placeholder="Search ingredients..."
                  placeholderTextColor={colors.textMuted}
                />

                {showSuggestions && (
                  <View style={styles.suggestionsContainer}>
                    {ingredientSuggestions.map((suggestion) => (
                      <TouchableOpacity
                        key={suggestion.id}
                        style={styles.suggestionItem}
                        onPress={() => handleSelectIngredient(suggestion)}
                      >
                        <Text style={styles.suggestionText}>
                          {CATEGORY_EMOJIS[suggestion.category]} {suggestion.name}
                        </Text>
                        <Text style={styles.suggestionCategory}>{suggestion.category}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.formSection}>
                <Text style={styles.label}>Category *</Text>
                <TouchableOpacity
                  style={styles.dropdown}
                  onPress={() => {
                    // console.log('Category dropdown pressed');
                    setShowCategoryPicker(true);
                  }}
                >
                  <Text style={styles.dropdownText}>
                    {CATEGORY_EMOJIS[newItem.category]} {newItem.category}
                  </Text>
                  <Text style={styles.dropdownArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.rowSection}>
                <View style={styles.rowItem}>
                  <Text style={styles.label}>Quantity</Text>
                  <TextInput
                    style={styles.input}
                    value={newItem.quantity?.toString() || ''}
                    onChangeText={text => setNewItem(prev => ({ ...prev, quantity: text ? parseFloat(text) : undefined }))}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.rowItem}>
                  <Text style={styles.label}>Unit</Text>
                  {customUnit ? (
                    <>
                      <TextInput
                        style={styles.input}
                        value={newItem.unit || ''}
                        onChangeText={text => setNewItem(prev => ({ ...prev, unit: text }))}
                        placeholder="Enter custom unit"
                        placeholderTextColor={colors.textMuted}
                      />
                      <TouchableOpacity
                        style={styles.clearDateButton}
                        onPress={() => {
                          setCustomUnit('');
                          setNewItem(prev => ({ ...prev, unit: 'pieces' }));
                        }}
                      >
                        <Text style={styles.clearDateText}>Use Preset Units</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={styles.dropdown}
                      onPress={() => {
                        // console.log('Unit dropdown pressed');
                        setShowUnitPicker(true);
                      }}
                    >
                      <Text style={styles.dropdownText}>{newItem.unit || 'Select'}</Text>
                      <Text style={styles.dropdownArrow}>▼</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.label}>Expiration Date (Optional)</Text>
                <TouchableOpacity
                  style={styles.dropdown}
                  onPress={openDatePicker}
                >
                  <Text style={[styles.dropdownText, !newItem.expires_at && { color: colors.textMuted }]}>
                    {newItem.expires_at || 'Select Date'}
                  </Text>
                  <Text style={styles.dropdownArrow}>📅</Text>
                </TouchableOpacity>
                {newItem.expires_at && (
                  <TouchableOpacity
                    style={styles.clearDateButton}
                    onPress={() => {
                      console.log('Clearing expiration date');
                      setNewItem(prev => {
                        const updated = { ...prev, expires_at: undefined };
                        console.log('Updated newItem:', updated);
                        return updated;
                      });
                    }}
                  >
                    <Text style={styles.clearDateText}>Clear Date</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={handleSavePantryItem}>
                <Text style={styles.saveButtonText}>{editingItem ? 'Update Item' : 'Add to Pantry'}</Text>
              </TouchableOpacity>

              {editingItem && (
                <TouchableOpacity
                  style={styles.deleteButtonModal}
                  onPress={() => {
                    setShowAddModal(false);
                    handleDeleteItem(editingItem);
                  }}
                >
                  <Text style={styles.deleteButtonModalText}>Delete Item</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>

          {/* Category Picker Modal */}
          <Modal visible={showCategoryPicker} animationType="fade" transparent={true} onRequestClose={() => setShowCategoryPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowCategoryPicker(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Select Category</Text>
                <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                  <Text style={styles.pickerClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView>
                {CATEGORIES.map(category => (
                  <TouchableOpacity
                    key={category}
                    style={styles.pickerOption}
                    onPress={() => {
                      setNewItem(prev => ({ ...prev, category }));
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Text style={styles.pickerOptionText}>
                      {CATEGORY_EMOJIS[category]} {category}
                    </Text>
                    {newItem.category === category && <Text style={styles.pickerCheck}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

          {/* Unit Picker Modal */}
          <Modal visible={showUnitPicker} animationType="fade" transparent={true} onRequestClose={() => setShowUnitPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowUnitPicker(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Select Unit</Text>
                <TouchableOpacity onPress={() => setShowUnitPicker(false)}>
                  <Text style={styles.pickerClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView>
                {UNITS.map(unit => (
                  <TouchableOpacity
                    key={unit}
                    style={styles.pickerOption}
                    onPress={() => {
                      if (unit === 'Custom') {
                        setCustomUnit('custom');
                        setNewItem(prev => ({ ...prev, unit: '' }));
                      } else {
                        setCustomUnit('');
                        setNewItem(prev => ({ ...prev, unit }));
                      }
                      setShowUnitPicker(false);
                    }}
                  >
                    <Text style={styles.pickerOptionText}>{unit}</Text>
                    {newItem.unit === unit && <Text style={styles.pickerCheck}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

          {/* Date Picker */}
          {showDatePicker && (
            <>
              {Platform.OS === 'ios' && (
                <Modal visible={showDatePicker} animationType="slide" transparent={true}>
                  <View style={styles.iosDatePickerModal}>
                    <View style={styles.iosDatePickerContainer}>
                      <View style={styles.iosDatePickerHeader}>
                        <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                          <Text style={styles.iosDatePickerCancel}>Cancel</Text>
                        </TouchableOpacity>
                        <Text style={styles.iosDatePickerTitle}>Select Date</Text>
                        <TouchableOpacity onPress={confirmIOSDate}>
                          <Text style={styles.iosDatePickerDone}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={tempDate}
                        mode="date"
                        display="spinner"
                        onChange={handleDateChange}
                        minimumDate={new Date()}
                      />
                    </View>
                  </View>
                </Modal>
              )}
              {Platform.OS === 'android' && (
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                  minimumDate={new Date()}
                />
              )}
            </>
          )}

        </KeyboardAvoidingView>
      </Modal>

      {/* Cook Tonight FAB */}
      {pantryItems.length > 0 && !selectionMode && (
        <TouchableOpacity
          style={{
            position: 'absolute', bottom: 24, right: 20,
            backgroundColor: colors.primary, borderRadius: 28,
            paddingHorizontal: 20, paddingVertical: 14,
            flexDirection: 'row', alignItems: 'center', gap: 8,
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
          }}
          onPress={handleCookTonight}
          activeOpacity={0.8}
        >
          <Ionicons name="sparkles" size={20} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '700' }}>Cook Tonight</Text>
        </TouchableOpacity>
      )}

      {/* Cook Tonight Modal */}
      <Modal visible={cookTonightModal} transparent animationType="slide" onRequestClose={() => setCookTonightModal(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '75%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles" size={22} color={colors.primary} />
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>Cook Tonight</Text>
              </View>
              <TouchableOpacity onPress={() => setCookTonightModal(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {cookTonightLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 14, color: colors.textMuted, fontSize: 15 }}>Finding the perfect recipe...</Text>
                <Text style={{ marginTop: 6, color: colors.textMuted, fontSize: 13 }}>Based on your pantry and what's expiring</Text>
              </View>
            ) : cookTonightResult?.suggestion ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 6 }}>
                  {cookTonightResult.suggestion.recipe_title}
                </Text>
                <Text style={{ fontSize: 14, color: colors.primary, marginBottom: 12, lineHeight: 20 }}>
                  {cookTonightResult.suggestion.why}
                </Text>

                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                  {cookTonightResult.suggestion.prep_time_minutes && (
                    <View style={{ backgroundColor: colors.backgroundSecondary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                      <Text style={{ fontSize: 13, color: colors.text, fontWeight: '500' }}>{cookTonightResult.suggestion.prep_time_minutes} min</Text>
                    </View>
                  )}
                  {cookTonightResult.suggestion.calories_estimate && (
                    <View style={{ backgroundColor: colors.backgroundSecondary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="flame-outline" size={16} color={colors.textMuted} />
                      <Text style={{ fontSize: 13, color: colors.text, fontWeight: '500' }}>{cookTonightResult.suggestion.calories_estimate} cal</Text>
                    </View>
                  )}
                </View>

                {cookTonightResult.suggestion.pantry_items_used?.length > 0 && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 }}>From your pantry:</Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary }}>{cookTonightResult.suggestion.pantry_items_used.join(', ')}</Text>
                  </View>
                )}

                {cookTonightResult.suggestion.items_to_buy?.length > 0 && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 }}>You'll need:</Text>
                    <Text style={{ fontSize: 14, color: colors.error }}>{cookTonightResult.suggestion.items_to_buy.join(', ')}</Text>
                  </View>
                )}

                {cookTonightResult.suggestion.quick_instructions?.length > 0 && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Quick steps:</Text>
                    {cookTonightResult.suggestion.quick_instructions.map((step, i) => (
                      <View key={i} style={{ flexDirection: 'row', marginBottom: 8, gap: 8 }}>
                        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>{i + 1}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.text }}>{step}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            ) : (
              <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 20, fontSize: 15 }}>
                {cookTonightResult?.message || 'Add items to your pantry to get suggestions!'}
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 16, paddingBottom: 16, backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 100 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: colors.primary },
  headerButtons: { flexDirection: 'row', gap: 12 },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  addButtonText: { fontSize: 28, fontWeight: 'bold', color: colors.backgroundSecondary },
  dropdownMenu: { position: 'absolute', top: 70, right: 24, backgroundColor: colors.card, borderRadius: 12, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, overflow: 'hidden', minWidth: 160, zIndex: 101 },
  dropdownMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropdownMenuItemDisabled: { opacity: 0.5 },
  dropdownMenuIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  dropdownMenuIconText: { fontSize: 18 },
  dropdownMenuText: { fontSize: 16, fontWeight: '500', color: colors.text },
  dropdownBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 },
  quickAddModalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '85%', marginTop: 'auto' },
  quickAddSubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 20, marginBottom: 16 },
  quickAddScroll: { flex: 1, paddingHorizontal: 20 },
  quickAddCategory: { marginBottom: 20 },
  quickAddCategoryTitle: { fontSize: 16, fontWeight: 'bold', color: colors.text, marginBottom: 12 },
  quickAddItemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickAddItem: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 },
  quickAddItemSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  quickAddItemText: { fontSize: 14, color: colors.text },
  quickAddItemTextSelected: { color: colors.buttonText, fontWeight: '600' },
  quickAddCheckmark: { fontSize: 12, color: colors.buttonText, fontWeight: 'bold' },
  quickAddFooter: { padding: 20, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  quickAddButton2: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  quickAddButtonDisabled: { backgroundColor: colors.textMuted, opacity: 0.5 },
  quickAddButtonText2: { fontSize: 18, fontWeight: 'bold', color: colors.buttonText },
  searchContainer: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.backgroundSecondary },
  searchInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1.5, borderColor: colors.primary + '40', height: 40 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  clearSearchButton: { fontSize: 14, color: colors.textMuted, padding: 4 },
  filterContainer: { backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 10, elevation: 5 },
  filterScroll: { paddingHorizontal: 20, paddingVertical: 12, height: 60, flexGrow: 0 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, height: 36, borderRadius: 20, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, marginRight: 8, justifyContent: 'center', alignItems: 'center' },
  filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterPillText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  filterPillTextActive: { color: colors.backgroundSecondary },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 20, paddingBottom: 200 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  sectionCount: { fontSize: 14, color: colors.textMuted },
  itemCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border, elevation: 2 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemName: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1 },
  expirationBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  expirationText: { fontSize: 11, fontWeight: '600', color: colors.backgroundSecondary },
  itemDetails: { flexDirection: 'row', gap: 12 },
  itemQuantity: { fontSize: 14, color: colors.textMuted },
  itemExpiry: { fontSize: 14 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 16, color: colors.textMuted, textAlign: 'center', marginBottom: 24 },
  emptyButton: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  emptyButtonText: { fontSize: 16, fontWeight: '600', color: colors.backgroundSecondary },
  analyzingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  analyzingContent: { backgroundColor: colors.backgroundSecondary, borderRadius: 16, padding: 32, alignItems: 'center', marginHorizontal: 32 },
  analyzingTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginTop: 16, marginBottom: 8 },
  analyzingText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.backgroundSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginBottom: 20 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: colors.text },
  modalClose: { fontSize: 28, color: colors.textMuted },
  modalScroll: { paddingHorizontal: 24 },
  formSection: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: colors.text },
  suggestionsContainer: { backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 8, maxHeight: 200 },
  suggestionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { fontSize: 16, color: colors.text },
  suggestionCategory: { fontSize: 12, color: colors.textMuted },
  dropdown: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12 },
  dropdownText: { fontSize: 16, color: colors.text, flex: 1 },
  dropdownArrow: { fontSize: 12, color: colors.textMuted, marginLeft: 8 },
  rowSection: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  rowItem: { flex: 1 },
  saveButton: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8, marginBottom: 16, elevation: 4 },
  saveButtonText: { fontSize: 18, fontWeight: 'bold', color: colors.backgroundSecondary },
  deleteButtonModal: { backgroundColor: colors.error, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 32, elevation: 4 },
  deleteButtonModalText: { fontSize: 18, fontWeight: 'bold', color: colors.backgroundSecondary },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pickerContainer: { backgroundColor: colors.backgroundSecondary, borderRadius: 16, width: '100%', maxHeight: '70%', overflow: 'hidden' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  pickerClose: { fontSize: 24, color: colors.textMuted },
  pickerOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.background },
  pickerOptionText: { fontSize: 16, color: colors.text },
  pickerCheck: { fontSize: 20, color: colors.primary, fontWeight: 'bold' },
  datePickerContainer: { backgroundColor: colors.backgroundSecondary, borderRadius: 16, width: '100%', padding: 20 },
  datePickerContent: { paddingTop: 20 },
  dateFormatLabel: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 12, fontWeight: '600' },
  dateInputRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 24 },
  dateInputContainer: { flex: 1, alignItems: 'center' },
  dateInputLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4, fontWeight: '600' },
  dateInput: { flex: 1, width: '100%', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 18, color: colors.text, textAlign: 'center', marginHorizontal: 4 },
  dateSeparator: { fontSize: 24, color: colors.textMuted, marginHorizontal: 4, marginBottom: 8 },
  dateConfirmButton: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', elevation: 4 },
  dateConfirmText: { fontSize: 18, fontWeight: 'bold', color: colors.backgroundSecondary },
  clearDateButton: { marginTop: 8, alignItems: 'center', paddingVertical: 8 },
  clearDateText: { fontSize: 14, color: colors.error, textDecorationLine: 'underline' },
  iosDatePickerModal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  iosDatePickerContainer: { backgroundColor: colors.backgroundSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  iosDatePickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  iosDatePickerCancel: { fontSize: 16, color: colors.primary },
  iosDatePickerTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  iosDatePickerDone: { fontSize: 16, fontWeight: '600', color: colors.primary },
  expiringBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.warningLight, marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.warning },
  expiringBannerContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  expiringBannerIcon: { fontSize: 18, marginRight: 8 },
  expiringBannerTextContainer: { flex: 1 },
  expiringBannerTitle: { fontSize: 13, fontWeight: '600', color: colors.warningDark },
  expiringBannerSubtitle: { fontSize: 11, color: colors.warningDark, marginTop: 2 },
  expiringBannerButton: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginLeft: 8 },
  expiringBannerButtonText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  expiringBannerDismiss: { padding: 4, marginLeft: 6 },
  expiringBannerDismissText: { fontSize: 14, color: colors.warningDark },
});
