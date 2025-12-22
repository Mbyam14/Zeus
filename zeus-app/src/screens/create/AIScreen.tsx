import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { callEdgeFunction } from '../../lib/supabase';

interface AIScreenProps {
  navigation: any;
}

type MealType = 'Appetizer' | 'Breakfast' | 'Lunch' | 'Dinner' | 'Dessert';

interface RecipeSuggestion {
  title: string;
  description: string;
}

export const AIScreen: React.FC<AIScreenProps> = ({ navigation }) => {
  const [ingredients, setIngredients] = useState('');
  const [selectedMealTypes, setSelectedMealTypes] = useState<MealType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<RecipeSuggestion[]>([]);

  const mealTypes: MealType[] = ['Appetizer', 'Breakfast', 'Lunch', 'Dinner', 'Dessert'];

  const toggleMealType = (mealType: MealType) => {
    setSelectedMealTypes(prev =>
      prev.includes(mealType)
        ? prev.filter(mt => mt !== mealType)
        : [...prev, mealType]
    );
  };

  const handleFind = async () => {
    if (!ingredients.trim()) {
      return;
    }

    setIsLoading(true);
    setSuggestions([]);

    try {
      // Call Supabase Edge Function
      const data = await callEdgeFunction('generate-recipes', {
        ingredients: ingredients.split(',').map(i => i.trim()).filter(i => i),
        mealTypes: selectedMealTypes,
      });

      if (data.suggestions && Array.isArray(data.suggestions)) {
        setSuggestions(data.suggestions);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error: any) {
      console.error('Error fetching suggestions:', error);

      // Show detailed error message
      let errorMessage = 'Failed to generate recipe suggestions. ';

      if (error?.message) {
        errorMessage += `\n\nDetails: ${error.message}`;
      }

      if (error?.context) {
        errorMessage += `\n\nContext: ${JSON.stringify(error.context)}`;
      }

      Alert.alert('Error', errorMessage, [{ text: 'OK' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRecipe = (suggestion: RecipeSuggestion) => {
    // TODO: Navigate to recipe detail or create screen with pre-filled data
    console.log('Selected recipe:', suggestion);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Recipe Generator</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Key Ingredients</Text>

        {/* Ingredients Input */}
        <View style={styles.section}>
          <TextInput
            style={styles.input}
            value={ingredients}
            onChangeText={setIngredients}
            placeholder="Enter ingredients, comma separated (e.g., chicken, rice, tomatoes)"
            placeholderTextColor="#95A5A6"
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Meal Type Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>Meal Type</Text>
          <View style={styles.tagContainer}>
            {mealTypes.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.tag,
                  selectedMealTypes.includes(type) && styles.tagActive,
                ]}
                onPress={() => toggleMealType(type)}
              >
                <Text
                  style={[
                    styles.tagText,
                    selectedMealTypes.includes(type) && styles.tagTextActive,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Find Button */}
        <TouchableOpacity
          style={[styles.findButton, (!ingredients.trim() || isLoading) && styles.findButtonDisabled]}
          onPress={handleFind}
          disabled={!ingredients.trim() || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.findButtonText}>Find Recipes</Text>
          )}
        </TouchableOpacity>

        {/* Loading State */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Generating recipe suggestions...</Text>
          </View>
        )}

        {/* Recipe Suggestions */}
        {!isLoading && suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <Text style={styles.suggestionsTitle}>Recipe Suggestions</Text>
            {suggestions.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionCard}
                onPress={() => handleSelectRecipe(suggestion)}
              >
                <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                <Text style={styles.suggestionDescription}>{suggestion.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 28,
    color: '#FF6B35',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
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
    minHeight: 80,
    textAlignVertical: 'top',
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
  findButton: {
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
  findButtonDisabled: {
    backgroundColor: '#BDC3C7',
    opacity: 0.6,
  },
  findButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  loadingContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#7F8C8D',
    marginTop: 8,
  },
  suggestionsContainer: {
    marginTop: 32,
  },
  suggestionsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
  },
  suggestionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E1E8ED',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  suggestionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 4,
  },
  suggestionDescription: {
    fontSize: 14,
    color: '#7F8C8D',
  },
});
