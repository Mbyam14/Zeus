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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
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
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
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

    Alert.alert('Success', 'Recipe created successfully!');
    console.log('Recipe to submit:', recipe);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with Gradient */}
      <LinearGradient
        colors={['#FF6B35', '#FF8C42']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerSubtitle}>Share Your Creation</Text>
            <Text style={styles.headerTitle}>Create Recipe</Text>
          </View>
          <TouchableOpacity
            style={styles.aiButton}
            onPress={() => navigation?.navigate('AIRecipe')}
          >
            <Text style={styles.aiButtonIcon}>✨</Text>
            <Text style={styles.aiButtonText}>AI</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Recipe Photo Card */}
          <View style={styles.card}>
            {recipe.image_url ? (
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: recipe.image_url }}
                  style={styles.recipeImage}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.3)']}
                  style={styles.imageOverlay}
                />
                <TouchableOpacity
                  style={styles.changePhotoButton}
                  onPress={showImageOptions}
                >
                  <Text style={styles.changePhotoText}>Change Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => updateField('image_url', '')}
                >
                  <Text style={styles.removeImageIcon}>×</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addPhotoCard}
                onPress={showImageOptions}
                activeOpacity={0.7}
              >
                <View style={styles.addPhotoIconContainer}>
                  <Text style={styles.addPhotoIcon}>📸</Text>
                </View>
                <Text style={styles.addPhotoTitle}>Add a Cover Photo</Text>
                <Text style={styles.addPhotoSubtitle}>Make your recipe stand out</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Basic Info Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Basic Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Recipe Title <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={recipe.title}
                onChangeText={(value) => updateField('title', value)}
                placeholder="e.g., Grandma's Chocolate Chip Cookies"
                placeholderTextColor="#95A5A6"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={recipe.description}
                onChangeText={(value) => updateField('description', value)}
                placeholder="Tell us what makes this recipe special..."
                placeholderTextColor="#95A5A6"
                multiline
                numberOfLines={4}
              />
            </View>
          </View>

          {/* Quick Facts Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Quick Facts</Text>

            <View style={styles.factsGrid}>
              <View style={styles.factItem}>
                <Text style={styles.factIcon}>👥</Text>
                <Text style={styles.factLabel}>Servings</Text>
                <TextInput
                  style={styles.factInput}
                  value={recipe.servings}
                  onChangeText={(value) => updateField('servings', value)}
                  placeholder="4"
                  placeholderTextColor="#95A5A6"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.factItem}>
                <Text style={styles.factIcon}>⏱️</Text>
                <Text style={styles.factLabel}>Prep</Text>
                <TextInput
                  style={styles.factInput}
                  value={recipe.prep_time}
                  onChangeText={(value) => updateField('prep_time', value)}
                  placeholder="15"
                  placeholderTextColor="#95A5A6"
                  keyboardType="numeric"
                />
                <Text style={styles.factUnit}>min</Text>
              </View>

              <View style={styles.factItem}>
                <Text style={styles.factIcon}>🔥</Text>
                <Text style={styles.factLabel}>Cook</Text>
                <TextInput
                  style={styles.factInput}
                  value={recipe.cook_time}
                  onChangeText={(value) => updateField('cook_time', value)}
                  placeholder="30"
                  placeholderTextColor="#95A5A6"
                  keyboardType="numeric"
                />
                <Text style={styles.factUnit}>min</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Cuisine Type</Text>
              <TextInput
                style={styles.input}
                value={recipe.cuisine_type}
                onChangeText={(value) => updateField('cuisine_type', value)}
                placeholder="e.g., Italian, Mexican, Asian"
                placeholderTextColor="#95A5A6"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Difficulty Level <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.difficultyRow}>
                {(['Easy', 'Medium', 'Hard'] as DifficultyLevel[]).map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.difficultyChip,
                      recipe.difficulty === level && styles.difficultyChipActive,
                    ]}
                    onPress={() => updateField('difficulty', level)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.difficultyText,
                        recipe.difficulty === level && styles.difficultyTextActive,
                      ]}
                    >
                      {level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Meal Type Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Meal Type</Text>
            <Text style={styles.cardSubtitle}>Select all that apply</Text>

            <View style={styles.chipGrid}>
              {(['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'] as MealType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.chip,
                    recipe.meal_type.includes(type) && styles.chipActive,
                  ]}
                  onPress={() => toggleMealType(type)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      recipe.meal_type.includes(type) && styles.chipTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Ingredients Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Ingredients</Text>
                <Text style={styles.cardSubtitle}>What you'll need</Text>
              </View>
              <TouchableOpacity style={styles.addButton} onPress={addIngredient}>
                <Text style={styles.addButtonIcon}>+</Text>
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>

            {recipe.ingredients.map((ingredient, index) => (
              <View key={index} style={styles.ingredientRow}>
                <View style={styles.ingredientNumber}>
                  <Text style={styles.ingredientNumberText}>{index + 1}</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.ingredientName]}
                  value={ingredient.name}
                  onChangeText={(value) => updateIngredient(index, 'name', value)}
                  placeholder="Ingredient"
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
                    style={styles.deleteButton}
                    onPress={() => removeIngredient(index)}
                  >
                    <Text style={styles.deleteButtonText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {/* Instructions Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Instructions</Text>
                <Text style={styles.cardSubtitle}>Step by step</Text>
              </View>
              <TouchableOpacity style={styles.addButton} onPress={addInstruction}>
                <Text style={styles.addButtonIcon}>+</Text>
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>

            {recipe.instructions.map((instruction, index) => (
              <View key={index} style={styles.instructionRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{instruction.step}</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.instructionInput]}
                  value={instruction.instruction}
                  onChangeText={(value) => updateInstruction(index, value)}
                  placeholder={`Describe step ${instruction.step}...`}
                  placeholderTextColor="#95A5A6"
                  multiline
                />
                {recipe.instructions.length > 1 && (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => removeInstruction(index)}
                  >
                    <Text style={styles.deleteButtonText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#FF6B35', '#FF8C42']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGradient}
            >
              <Text style={styles.submitIcon}>✓</Text>
              <Text style={styles.submitButtonText}>Create Recipe</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.bottomPadding} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F0',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#FF6B35',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 4,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  aiButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiButtonIcon: {
    fontSize: 16,
  },
  aiButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#7F8C8D',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
  },
  recipeImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  changePhotoButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  changePhotoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E50',
  },
  removeImageButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageIcon: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '300',
  },
  addPhotoCard: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  addPhotoIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF5F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  addPhotoIcon: {
    fontSize: 40,
  },
  addPhotoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4,
  },
  addPhotoSubtitle: {
    fontSize: 14,
    color: '#7F8C8D',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 8,
  },
  required: {
    color: '#FF6B35',
  },
  input: {
    backgroundColor: '#FFF8F0',
    borderWidth: 1,
    borderColor: '#E1E8ED',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#2C3E50',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  factsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  factItem: {
    flex: 1,
    backgroundColor: '#FFF8F0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  factIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  factLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7F8C8D',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  factInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8ED',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 18,
    fontWeight: '700',
    color: '#2C3E50',
    textAlign: 'center',
    minWidth: 60,
  },
  factUnit: {
    fontSize: 12,
    color: '#7F8C8D',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E1E8ED',
    marginVertical: 16,
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: 12,
  },
  difficultyChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E1E8ED',
    backgroundColor: '#FFF8F0',
    alignItems: 'center',
  },
  difficultyChipActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  difficultyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7F8C8D',
  },
  difficultyTextActive: {
    color: '#FFFFFF',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#E1E8ED',
    backgroundColor: '#FFF8F0',
  },
  chipActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7F8C8D',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B35',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  addButtonIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ingredientRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  ingredientNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF5F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ingredientNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF6B35',
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
    gap: 10,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  stepBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#FF6B35',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  stepBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  instructionInput: {
    flex: 1,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFE5E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  deleteButtonText: {
    fontSize: 24,
    fontWeight: '300',
    color: '#E74C3C',
  },
  submitButton: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#FF6B35',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  submitIcon: {
    fontSize: 20,
    color: '#FFFFFF',
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bottomPadding: {
    height: 40,
  },
});
