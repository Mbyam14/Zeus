import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { recipeService } from '../../services/recipeService';
import { Recipe, Ingredient, Instruction, DifficultyLevel, MealType } from '../../types/recipe';
import { useThemeStore } from '../../store/themeStore';

const DIFFICULTIES: DifficultyLevel[] = ['Easy', 'Medium', 'Hard'];
const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'];
const DIETARY_TAGS = ['Vegan', 'Vegetarian', 'Gluten-Free', 'Dairy-Free', 'Keto', 'Paleo', 'Nut-Free', 'Low-Carb', 'High-Protein'];

export const EditRecipeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useThemeStore();
  const styles = createStyles(colors);
  const originalRecipe: Recipe = route.params.recipe;

  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(originalRecipe.title);
  const [description, setDescription] = useState(originalRecipe.description || '');
  const [servings, setServings] = useState(String(originalRecipe.servings || 2));
  const [prepTime, setPrepTime] = useState(String(originalRecipe.prep_time || ''));
  const [cookTime, setCookTime] = useState(String(originalRecipe.cook_time || ''));
  const [cuisineType, setCuisineType] = useState(originalRecipe.cuisine_type || '');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(originalRecipe.difficulty || 'Easy');
  const [mealTypes, setMealTypes] = useState<string[]>(originalRecipe.meal_type || []);
  const [dietaryTags, setDietaryTags] = useState<string[]>(originalRecipe.dietary_tags || []);
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    originalRecipe.ingredients?.length ? originalRecipe.ingredients : [{ name: '', quantity: '', unit: '' }]
  );
  const [instructions, setInstructions] = useState<Instruction[]>(
    originalRecipe.instructions?.length ? originalRecipe.instructions : [{ step: 1, instruction: '' }]
  );
  const [calories, setCalories] = useState(String(originalRecipe.calories || ''));
  const [proteinGrams, setProteinGrams] = useState(String(originalRecipe.protein_grams || ''));
  const [carbsGrams, setCarbsGrams] = useState(String(originalRecipe.carbs_grams || ''));
  const [fatGrams, setFatGrams] = useState(String(originalRecipe.fat_grams || ''));

  const toggleMealType = (type: string) => {
    setMealTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleDietaryTag = (tag: string) => {
    setDietaryTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    setIngredients(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addIngredient = () => {
    setIngredients(prev => [...prev, { name: '', quantity: '', unit: '' }]);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length <= 1) return;
    setIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const updateInstruction = (index: number, value: string) => {
    setInstructions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], instruction: value };
      return updated;
    });
  };

  const addInstruction = () => {
    setInstructions(prev => [...prev, { step: prev.length + 1, instruction: '' }]);
  };

  const removeInstruction = (index: number) => {
    if (instructions.length <= 1) return;
    setInstructions(prev =>
      prev.filter((_, i) => i !== index).map((inst, i) => ({ ...inst, step: i + 1 }))
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Recipe title is required');
      return;
    }

    const validIngredients = ingredients.filter(i => i.name.trim());
    const validInstructions = instructions
      .filter(i => i.instruction.trim())
      .map((inst, i) => ({ ...inst, step: i + 1 }));

    if (validIngredients.length === 0) {
      Alert.alert('Error', 'At least one ingredient is required');
      return;
    }
    if (validInstructions.length === 0) {
      Alert.alert('Error', 'At least one instruction is required');
      return;
    }

    setSaving(true);
    try {
      const updateData: any = {
        title: title.trim(),
        description: description.trim() || undefined,
        servings: parseInt(servings) || 2,
        prep_time: parseInt(prepTime) || undefined,
        cook_time: parseInt(cookTime) || undefined,
        cuisine_type: cuisineType.trim() || undefined,
        difficulty,
        meal_type: mealTypes,
        dietary_tags: dietaryTags,
        ingredients: validIngredients,
        instructions: validInstructions,
        calories: parseInt(calories) || undefined,
        protein_grams: parseFloat(proteinGrams) || undefined,
        carbs_grams: parseFloat(carbsGrams) || undefined,
        fat_grams: parseFloat(fatGrams) || undefined,
      };

      await recipeService.updateRecipe(originalRecipe.id, updateData);
      Alert.alert('Success', 'Recipe updated!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Failed to update recipe:', error);
      Alert.alert('Error', 'Failed to update recipe');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Recipe',
      `Are you sure you want to delete "${title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await recipeService.deleteRecipe(originalRecipe.id);
              // Go back two screens (edit + detail or edit + list)
              navigation.pop(2);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete recipe');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Recipe</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerButton}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Title */}
          <Text style={styles.sectionTitle}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Recipe title"
            placeholderTextColor={colors.textMuted}
          />

          {/* Description */}
          <Text style={styles.sectionTitle}>Description</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={description}
            onChangeText={setDescription}
            placeholder="Brief description"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
          />

          {/* Quick Details */}
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailsGrid}>
            <View style={styles.detailField}>
              <Text style={styles.fieldLabel}>Servings</Text>
              <TextInput
                style={styles.smallInput}
                value={servings}
                onChangeText={setServings}
                keyboardType="numeric"
                placeholder="2"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.detailField}>
              <Text style={styles.fieldLabel}>Prep (min)</Text>
              <TextInput
                style={styles.smallInput}
                value={prepTime}
                onChangeText={setPrepTime}
                keyboardType="numeric"
                placeholder="15"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.detailField}>
              <Text style={styles.fieldLabel}>Cook (min)</Text>
              <TextInput
                style={styles.smallInput}
                value={cookTime}
                onChangeText={setCookTime}
                keyboardType="numeric"
                placeholder="30"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Cuisine</Text>
          <TextInput
            style={styles.input}
            value={cuisineType}
            onChangeText={setCuisineType}
            placeholder="e.g. Italian, Mexican"
            placeholderTextColor={colors.textMuted}
          />

          {/* Difficulty */}
          <Text style={styles.sectionTitle}>Difficulty</Text>
          <View style={styles.pillRow}>
            {DIFFICULTIES.map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.pill, difficulty === d && styles.pillActive]}
                onPress={() => setDifficulty(d)}
              >
                <Text style={[styles.pillText, difficulty === d && styles.pillTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Meal Types */}
          <Text style={styles.sectionTitle}>Meal Type</Text>
          <View style={styles.pillRow}>
            {MEAL_TYPES.map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.pill, mealTypes.includes(type) && styles.pillActive]}
                onPress={() => toggleMealType(type)}
              >
                <Text style={[styles.pillText, mealTypes.includes(type) && styles.pillTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Dietary Tags */}
          <Text style={styles.sectionTitle}>Dietary Tags</Text>
          <View style={styles.pillRow}>
            {DIETARY_TAGS.map(tag => (
              <TouchableOpacity
                key={tag}
                style={[styles.pill, dietaryTags.includes(tag) && styles.pillActive]}
                onPress={() => toggleDietaryTag(tag)}
              >
                <Text style={[styles.pillText, dietaryTags.includes(tag) && styles.pillTextActive]}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Nutrition */}
          <Text style={styles.sectionTitle}>Nutrition (per serving)</Text>
          <View style={styles.detailsGrid}>
            <View style={styles.detailField}>
              <Text style={styles.fieldLabel}>Calories</Text>
              <TextInput
                style={styles.smallInput}
                value={calories}
                onChangeText={setCalories}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.detailField}>
              <Text style={styles.fieldLabel}>Protein (g)</Text>
              <TextInput
                style={styles.smallInput}
                value={proteinGrams}
                onChangeText={setProteinGrams}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.detailField}>
              <Text style={styles.fieldLabel}>Carbs (g)</Text>
              <TextInput
                style={styles.smallInput}
                value={carbsGrams}
                onChangeText={setCarbsGrams}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.detailField}>
              <Text style={styles.fieldLabel}>Fat (g)</Text>
              <TextInput
                style={styles.smallInput}
                value={fatGrams}
                onChangeText={setFatGrams}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {/* Ingredients */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            <TouchableOpacity onPress={addIngredient}>
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {ingredients.map((ing, index) => (
            <View key={index} style={styles.ingredientRow}>
              <TextInput
                style={[styles.input, { flex: 2, marginBottom: 0, marginRight: 8 }]}
                value={ing.name}
                onChangeText={v => updateIngredient(index, 'name', v)}
                placeholder="Ingredient"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0, marginRight: 8 }]}
                value={ing.quantity}
                onChangeText={v => updateIngredient(index, 'quantity', v)}
                placeholder="Qty"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0, marginRight: 8 }]}
                value={ing.unit}
                onChangeText={v => updateIngredient(index, 'unit', v)}
                placeholder="Unit"
                placeholderTextColor={colors.textMuted}
              />
              <TouchableOpacity onPress={() => removeIngredient(index)} style={styles.removeButton}>
                <Text style={styles.removeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Instructions */}
          <View style={[styles.sectionHeader, { marginTop: 20 }]}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <TouchableOpacity onPress={addInstruction}>
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {instructions.map((inst, index) => (
            <View key={index} style={styles.instructionRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <TextInput
                style={[styles.input, styles.multilineInput, { flex: 1, marginBottom: 0, marginRight: 8 }]}
                value={inst.instruction}
                onChangeText={v => updateInstruction(index, v)}
                placeholder={`Step ${index + 1}`}
                placeholderTextColor={colors.textMuted}
                multiline
              />
              <TouchableOpacity onPress={() => removeInstruction(index)} style={styles.removeButton}>
                <Text style={styles.removeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Delete */}
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete Recipe</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerButton: {
      minWidth: 60,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    cancelText: {
      fontSize: 16,
      color: colors.textMuted,
    },
    saveText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.primary,
      textAlign: 'right',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 10,
      marginTop: 8,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
    multilineInput: {
      minHeight: 60,
      textAlignVertical: 'top',
    },
    smallInput: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      textAlign: 'center',
    },
    detailsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 16,
    },
    detailField: {
      flex: 1,
      minWidth: 80,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    pill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pillText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textMuted,
    },
    pillTextActive: {
      color: '#fff',
    },
    ingredientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    instructionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    stepNumber: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
      marginTop: 10,
    },
    stepNumberText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#fff',
    },
    addButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.primary,
    },
    removeButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    removeButtonText: {
      fontSize: 20,
      color: '#E74C3C',
      fontWeight: '700',
    },
    deleteButton: {
      marginTop: 32,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E74C3C',
      alignItems: 'center',
    },
    deleteButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#E74C3C',
    },
  });
