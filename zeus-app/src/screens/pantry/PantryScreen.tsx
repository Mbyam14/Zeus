import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PantryItem, PantryCategory, PantryItemCreate, IngredientLibraryItem } from '../../types/pantry';
import { pantryService } from '../../services/pantryService';

const CATEGORIES: PantryCategory[] = [
  'Produce', 'Dairy', 'Protein', 'Grains', 'Spices', 'Condiments', 'Beverages', 'Frozen', 'Pantry', 'Other'
];

const UNITS = ['cups', 'tbsp', 'tsp', 'fl oz', 'pieces', 'items', 'cans', 'boxes', 'cloves', 'heads', 'lbs', 'oz', 'Custom'];

const CATEGORY_EMOJIS: Record<PantryCategory, string> = {
  Produce: '🥬', Dairy: '🥛', Protein: '🍗', Grains: '🌾',
  Spices: '🌶️', Condiments: '🧂', Beverages: '☕', Frozen: '🧊',
  Pantry: '🥫', Other: '📦'
};

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
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    loadPantryItems();
  }, [selectedCategory, searchQuery]);

  const loadPantryItems = async () => {
    try {
      setLoading(true);
      const items = await pantryService.getPantryItems({
        category: selectedCategory || undefined,
        search: searchQuery || undefined
      });
      setPantryItems(items);
    } catch (error) {
      Alert.alert('Error', 'Failed to load pantry items');
      console.error('Load pantry items error:', error);
    } finally {
      setLoading(false);
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
        await pantryService.updatePantryItem(editingItem.id, newItem);
        Alert.alert('Success', 'Pantry item updated!');
      } else {
        await pantryService.createPantryItem(newItem);
        Alert.alert('Success', 'Item added to pantry!');
      }

      setShowAddModal(false);
      resetForm();
      loadPantryItems();
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

  const handleDateSelect = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formatted = `${year}-${month}-${day}`;
    setNewItem(prev => ({ ...prev, expires_at: formatted }));
    setShowDatePicker(false);
  };

  const openDatePicker = () => {
    if (newItem.expires_at) {
      const parts = newItem.expires_at.split('-');
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        setSelectedDate(date);
      }
    }
    setShowDatePicker(true);
  };

  const handlePhotoUpload = () => {
    Alert.alert('Photo Upload', 'Coming soon - S3 integration pending', [{ text: 'OK' }]);
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

  const renderPantryItem = ({ item }: { item: PantryItem }) => {
    const expirationColor = item.is_expired ? '#E74C3C' : item.is_expiring_soon ? '#F39C12' : '#2C3E50';

    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => handleEditItem(item)}
      >
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
              Exp: {new Date(item.expires_at).toLocaleDateString()}
            </Text>
          )}
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
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🥘</Text>
      <Text style={styles.emptyTitle}>No Pantry Items</Text>
      <Text style={styles.emptyText}>Add your first pantry item to get started!</Text>
      <TouchableOpacity style={styles.emptyButton} onPress={() => setShowAddModal(true)}>
        <Text style={styles.emptyButtonText}>Add Item</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pantry</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.photoButton} onPress={handlePhotoUpload}>
            <Text style={styles.photoButtonText}>📷</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => { resetForm(); setShowAddModal(true); }}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search pantry items..."
          placeholderTextColor="#95A5A6"
        />
      </View>

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

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      ) : pantryItems.length === 0 ? (
        renderEmptyState()
      ) : (
        <SectionList
          sections={groupedItems()}
          renderItem={renderPantryItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={true}
        />
      )}

      <Modal visible={showAddModal} animationType="slide" transparent={true} onRequestClose={() => { setShowAddModal(false); resetForm(); }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingItem ? 'Edit Item' : 'Add to Pantry'}</Text>
                <TouchableOpacity onPress={() => { setShowAddModal(false); resetForm(); }}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="always">
              <View style={styles.formSection}>
                <Text style={styles.label}>Item Name *</Text>
                <TextInput
                  style={styles.input}
                  value={newItem.item_name}
                  onChangeText={handleIngredientSearch}
                  placeholder="Search ingredients..."
                  placeholderTextColor="#95A5A6"
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
                    placeholderTextColor="#95A5A6"
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
                        placeholderTextColor="#95A5A6"
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
                  <Text style={[styles.dropdownText, !newItem.expires_at && { color: '#95A5A6' }]}>
                    {newItem.expires_at || 'Select Date'}
                  </Text>
                  <Text style={styles.dropdownArrow}>📅</Text>
                </TouchableOpacity>
                {newItem.expires_at && (
                  <TouchableOpacity
                    style={styles.clearDateButton}
                    onPress={() => setNewItem(prev => ({ ...prev, expires_at: undefined }))}
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
          </View>

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

          {/* Date Picker Modal */}
          <Modal visible={showDatePicker} animationType="fade" transparent={true} onRequestClose={() => setShowDatePicker(false)}>
            <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowDatePicker(false)}>
              <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                <View style={styles.datePickerContainer}>
                  <View style={styles.pickerHeader}>
                    <Text style={styles.pickerTitle}>Select Expiration Date</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.pickerClose}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.datePickerContent}>
                    <View style={styles.dateInputRow}>
                      <TextInput
                        style={styles.dateInput}
                        value={selectedDate.getMonth() + 1 + ''}
                        onChangeText={(text) => {
                          const month = parseInt(text) || 1;
                          if (month >= 1 && month <= 12) {
                            const newDate = new Date(selectedDate);
                            newDate.setMonth(month - 1);
                            setSelectedDate(newDate);
                          }
                        }}
                        placeholder="MM"
                        keyboardType="numeric"
                        maxLength={2}
                      />
                      <Text style={styles.dateSeparator}>/</Text>
                      <TextInput
                        style={styles.dateInput}
                        value={selectedDate.getDate() + ''}
                        onChangeText={(text) => {
                          const day = parseInt(text) || 1;
                          if (day >= 1 && day <= 31) {
                            const newDate = new Date(selectedDate);
                            newDate.setDate(day);
                            setSelectedDate(newDate);
                          }
                        }}
                        placeholder="DD"
                        keyboardType="numeric"
                        maxLength={2}
                      />
                      <Text style={styles.dateSeparator}>/</Text>
                      <TextInput
                        style={[styles.dateInput, { flex: 1.5 }]}
                        value={selectedDate.getFullYear() + ''}
                        onChangeText={(text) => {
                          const year = parseInt(text);
                          if (year && year >= 2000 && year <= 2100) {
                            const newDate = new Date(selectedDate);
                            newDate.setFullYear(year);
                            setSelectedDate(newDate);
                          }
                        }}
                        placeholder="YYYY"
                        keyboardType="numeric"
                        maxLength={4}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.dateConfirmButton}
                      onPress={() => handleDateSelect(selectedDate)}
                    >
                      <Text style={styles.dateConfirmText}>Confirm</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

        </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E1E8ED' },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#FF6B35' },
  headerButtons: { flexDirection: 'row', gap: 12 },
  photoButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F8F9FA', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E1E8ED' },
  photoButtonText: { fontSize: 20 },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FF6B35', justifyContent: 'center', alignItems: 'center' },
  addButtonText: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF' },
  searchContainer: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FFFFFF' },
  searchInput: { backgroundColor: '#F8F9FA', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#2C3E50', borderWidth: 1, borderColor: '#E1E8ED' },
  filterScroll: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E1E8ED', paddingHorizontal: 20, paddingVertical: 12, height: 60, flexGrow: 0 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, height: 36, borderRadius: 20, backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E1E8ED', marginRight: 8, justifyContent: 'center', alignItems: 'center' },
  filterPillActive: { backgroundColor: '#FF6B35', borderColor: '#FF6B35' },
  filterPillText: { fontSize: 14, fontWeight: '600', color: '#7F8C8D' },
  filterPillTextActive: { color: '#FFFFFF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8F9FA', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50' },
  sectionCount: { fontSize: 14, color: '#7F8C8D' },
  itemCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E1E8ED', elevation: 2 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#2C3E50', flex: 1 },
  expirationBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  expirationText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
  itemDetails: { flexDirection: 'row', gap: 12 },
  itemQuantity: { fontSize: 14, color: '#7F8C8D' },
  itemExpiry: { fontSize: 14 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50', marginBottom: 8 },
  emptyText: { fontSize: 16, color: '#7F8C8D', textAlign: 'center', marginBottom: 24 },
  emptyButton: { backgroundColor: '#FF6B35', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  emptyButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginBottom: 20 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#2C3E50' },
  modalClose: { fontSize: 28, color: '#7F8C8D' },
  modalScroll: { paddingHorizontal: 24 },
  formSection: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#2C3E50', marginBottom: 8 },
  input: { backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E1E8ED', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#2C3E50' },
  suggestionsContainer: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E8ED', borderRadius: 8, marginTop: 8, maxHeight: 200 },
  suggestionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#E1E8ED' },
  suggestionText: { fontSize: 16, color: '#2C3E50' },
  suggestionCategory: { fontSize: 12, color: '#7F8C8D' },
  dropdown: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E1E8ED', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12 },
  dropdownText: { fontSize: 16, color: '#2C3E50', flex: 1 },
  dropdownArrow: { fontSize: 12, color: '#7F8C8D', marginLeft: 8 },
  rowSection: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  rowItem: { flex: 1 },
  saveButton: { backgroundColor: '#FF6B35', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8, marginBottom: 16, elevation: 4 },
  saveButtonText: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  deleteButtonModal: { backgroundColor: '#E74C3C', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 32, elevation: 4 },
  deleteButtonModalText: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pickerContainer: { backgroundColor: '#FFFFFF', borderRadius: 16, width: '100%', maxHeight: '70%', overflow: 'hidden' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E1E8ED' },
  pickerTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50' },
  pickerClose: { fontSize: 24, color: '#7F8C8D' },
  pickerOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  pickerOptionText: { fontSize: 16, color: '#2C3E50' },
  pickerCheck: { fontSize: 20, color: '#FF6B35', fontWeight: 'bold' },
  datePickerContainer: { backgroundColor: '#FFFFFF', borderRadius: 16, width: '100%', padding: 20 },
  datePickerContent: { paddingTop: 20 },
  dateInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  dateInput: { flex: 1, backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E1E8ED', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 18, color: '#2C3E50', textAlign: 'center', marginHorizontal: 4 },
  dateSeparator: { fontSize: 24, color: '#7F8C8D', marginHorizontal: 4 },
  dateConfirmButton: { backgroundColor: '#FF6B35', paddingVertical: 16, borderRadius: 12, alignItems: 'center', elevation: 4 },
  dateConfirmText: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  clearDateButton: { marginTop: 8, alignItems: 'center', paddingVertical: 8 },
  clearDateText: { fontSize: 14, color: '#E74C3C', textDecorationLine: 'underline' },
});
