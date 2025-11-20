import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ingredient, Instruction, DifficultyLevel, MealType } from '../../types/recipe';

interface RecipeForm {
  title: string;
  description: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  servings: string;
  prep_time: string;
  cook_time: string;
  cuisine_type: string;
  difficulty: DifficultyLevel;
  meal_type: MealType[];
  dietary_tags: string[];
  image_url: string;
}

interface CreateScreenProps {
  navigation?: any;
}

export const CreateScreen: React.FC<CreateScreenProps> = ({ navigation }) => {
  const [recipe, setRecipe] = useState<RecipeForm>({
    title: '',
    description: '',
    ingredients: [{ name: '', quantity: '', unit: '' }],
    instructions: [{ step: 1, instruction: '' }],
    servings: '',
    prep_time: '',
    cook_time: '',
    cuisine_type: '',
    difficulty: 'Easy',
    meal_type: [],
    dietary_tags: [],
    image_url: '',
  });

  const updateField = (field: keyof RecipeForm, value: any) => {
    setRecipe(prev => ({ ...prev, [field]: value }));
  };

  const addIngredient = () => {
    setRecipe(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { name: '', quantity: '', unit: '' }],
    }));
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    setRecipe(prev => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) =>
        i === index ? { ...ing, [field]: value } : ing
      ),
    }));
  };

  const removeIngredient = (index: number) => {
    if (recipe.ingredients.length > 1) {
      setRecipe(prev => ({
        ...prev,
        ingredients: prev.ingredients.filter((_, i) => i !== index),
      }));
    }
  };

  const addInstruction = () => {
    setRecipe(prev => ({
      ...prev,
      instructions: [
        ...prev.instructions,
        { step: prev.instructions.length + 1, instruction: '' },
      ],
    }));
  };

  const updateInstruction = (index: number, value: string) => {
    setRecipe(prev => ({
      ...prev,
      instructions: prev.instructions.map((inst, i) =>
        i === index ? { ...inst, instruction: value } : inst
      ),
    }));
  };

  const removeInstruction = (index: number) => {
    if (recipe.instructions.length > 1) {
      setRecipe(prev => ({
        ...prev,
        instructions: prev.instructions
          .filter((_, i) => i !== index)
          .map((inst, i) => ({ ...inst, step: i + 1 })),
      }));
    }
  };

  const toggleMealType = (mealType: MealType) => {
    setRecipe(prev => ({
      ...prev,
      meal_type: prev.meal_type.includes(mealType)
        ? prev.meal_type.filter(mt => mt !== mealType)
        : [...prev.meal_type, mealType],
    }));
  };

  const pickImageFromGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Permission to access gallery is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      // TODO: In future, upload to your backend/cloud storage and get URL
      // For now, we'll use the local URI
      updateField('image_url', result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Permission to access camera is required!');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      // TODO: In future, upload to your backend/cloud storage and get URL
      // For now, we'll use the local URI
      updateField('image_url', result.assets[0].uri);
    }
  };

  const showImageOptions = () => {
    Alert.alert(
      'Add Photo',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Gallery', onPress: pickImageFromGallery },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleSubmit = () => {
    // Validation
    if (!recipe.title.trim()) {
      Alert.alert('Error', 'Please enter a recipe title');
      return;
    }
    if (recipe.ingredients.some(ing => !ing.name.trim())) {
      Alert.alert('Error', 'Please fill in all ingredient names');
      return;
    }
    if (recipe.instructions.some(inst => !inst.instruction.trim())) {
      Alert.alert('Error', 'Please fill in all instructions');
      return;
    }
    if (!recipe.servings || parseInt(recipe.servings) <= 0) {
      Alert.alert('Error', 'Please enter valid servings');
      return;
    }

    // TODO: Submit to API
    Alert.alert('Success', 'Recipe created successfully!');
    console.log('Recipe to submit:', recipe);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Create Recipe</Text>
        <TouchableOpacity
          style={styles.aiButton}
          onPress={() => navigation?.navigate('AIRecipe')}
        >
          <Text style={styles.aiButtonText}>AI</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={recipe.title}
            onChangeText={(value) => updateField('title', value)}
            placeholder="Enter recipe title"
            placeholderTextColor="#95A5A6"
          />
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={recipe.description}
            onChangeText={(value) => updateField('description', value)}
            placeholder="Describe your recipe"
            placeholderTextColor="#95A5A6"
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Recipe Photo */}
        <View style={styles.section}>
          <Text style={styles.label}>Recipe Photo</Text>

          {recipe.image_url ? (
            <View style={styles.imagePreviewContainer}>
              <Image
                source={{ uri: recipe.image_url }}
                style={styles.imagePreview}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => updateField('image_url', '')}
              >
                <Text style={styles.removeImageText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addPhotoButton}
              onPress={showImageOptions}
            >
              <Text style={styles.addPhotoIcon}>📷</Text>
              <Text style={styles.addPhotoText}>Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Basic Info Row */}
        <View style={styles.rowSection}>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Servings *</Text>
            <TextInput
              style={styles.input}
              value={recipe.servings}
              onChangeText={(value) => updateField('servings', value)}
              placeholder="4"
              placeholderTextColor="#95A5A6"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.rowItem}>
            <Text style={styles.label}>Prep Time (min)</Text>
            <TextInput
              style={styles.input}
              value={recipe.prep_time}
              onChangeText={(value) => updateField('prep_time', value)}
              placeholder="15"
              placeholderTextColor="#95A5A6"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.rowItem}>
            <Text style={styles.label}>Cook Time (min)</Text>
            <TextInput
              style={styles.input}
              value={recipe.cook_time}
              onChangeText={(value) => updateField('cook_time', value)}
              placeholder="30"
              placeholderTextColor="#95A5A6"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Cuisine & Difficulty */}
        <View style={styles.rowSection}>
          <View style={[styles.rowItem, { flex: 1.5 }]}>
            <Text style={styles.label}>Cuisine Type</Text>
            <TextInput
              style={styles.input}
              value={recipe.cuisine_type}
              onChangeText={(value) => updateField('cuisine_type', value)}
              placeholder="Italian, Asian, etc."
              placeholderTextColor="#95A5A6"
            />
          </View>

          <View style={styles.rowItem}>
            <Text style={styles.label}>Difficulty *</Text>
            <View style={styles.difficultyButtons}>
              {(['Easy', 'Medium', 'Hard'] as DifficultyLevel[]).map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.difficultyButton,
                    recipe.difficulty === level && styles.difficultyButtonActive,
                  ]}
                  onPress={() => updateField('difficulty', level)}
                >
                  <Text
                    style={[
                      styles.difficultyButtonText,
                      recipe.difficulty === level && styles.difficultyButtonTextActive,
                    ]}
                  >
                    {level}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Meal Type */}
        <View style={styles.section}>
          <Text style={styles.label}>Meal Type</Text>
          <View style={styles.tagContainer}>
            {(['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'] as MealType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.tag,
                  recipe.meal_type.includes(type) && styles.tagActive,
                ]}
                onPress={() => toggleMealType(type)}
              >
                <Text
                  style={[
                    styles.tagText,
                    recipe.meal_type.includes(type) && styles.tagTextActive,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Ingredients */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ingredients *</Text>
            <TouchableOpacity style={styles.addButton} onPress={addIngredient}>
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {recipe.ingredients.map((ingredient, index) => (
            <View key={index} style={styles.ingredientRow}>
              <TextInput
                style={[styles.input, styles.ingredientName]}
                value={ingredient.name}
                onChangeText={(value) => updateIngredient(index, 'name', value)}
                placeholder="Ingredient name"
                placeholderTextColor="#95A5A6"
              />
              <TextInput
                style={[styles.input, styles.ingredientQty]}
                value={ingredient.quantity}
                onChangeText={(value) => updateIngredient(index, 'quantity', value)}
                placeholder="Qty"
                placeholderTextColor="#95A5A6"
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, styles.ingredientUnit]}
                value={ingredient.unit}
                onChangeText={(value) => updateIngredient(index, 'unit', value)}
                placeholder="Unit"
                placeholderTextColor="#95A5A6"
              />
              {recipe.ingredients.length > 1 && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeIngredient(index)}
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Instructions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Instructions *</Text>
            <TouchableOpacity style={styles.addButton} onPress={addInstruction}>
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {recipe.instructions.map((instruction, index) => (
            <View key={index} style={styles.instructionRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{instruction.step}</Text>
              </View>
              <TextInput
                style={[styles.input, styles.instructionInput]}
                value={instruction.instruction}
                onChangeText={(value) => updateInstruction(index, value)}
                placeholder="Enter instruction"
                placeholderTextColor="#95A5A6"
                multiline
              />
              {recipe.instructions.length > 1 && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeInstruction(index)}
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Submit Button */}
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>Create Recipe</Text>
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  aiButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  aiButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  rowSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  rowItem: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8ED',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2C3E50',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  difficultyButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  difficultyButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E1E8ED',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  difficultyButtonActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  difficultyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7F8C8D',
  },
  difficultyButtonTextActive: {
    color: '#FFFFFF',
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E1E8ED',
    backgroundColor: '#FFFFFF',
  },
  tagActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  tagText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7F8C8D',
  },
  tagTextActive: {
    color: '#FFFFFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  addButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FF6B35',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  ingredientRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  ingredientName: {
    flex: 2,
  },
  ingredientQty: {
    flex: 0.7,
  },
  ingredientUnit: {
    flex: 0.8,
  },
  instructionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  instructionInput: {
    flex: 1,
    minHeight: 48,
    textAlignVertical: 'top',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E74C3C',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  removeButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  bottomPadding: {
    height: 32,
  },
  imagePreviewContainer: {
    position: 'relative',
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E1E8ED',
  },
  removeImageButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addPhotoButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E1E8ED',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  addPhotoIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  addPhotoText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7F8C8D',
  },
});
