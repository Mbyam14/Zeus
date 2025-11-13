import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';

interface MealPlan {
  id: string;
  date: string;
  meal_type: string;
  recipe_title: string;
}

const mockMealPlans: MealPlan[] = [
  { id: '1', date: '2025-11-06', meal_type: 'Breakfast', recipe_title: 'Avocado Toast' },
  { id: '2', date: '2025-11-06', meal_type: 'Lunch', recipe_title: 'Caesar Salad' },
  { id: '3', date: '2025-11-06', meal_type: 'Dinner', recipe_title: 'Spaghetti Carbonara' },
  { id: '4', date: '2025-11-07', meal_type: 'Breakfast', recipe_title: 'Pancakes' },
  { id: '5', date: '2025-11-07', meal_type: 'Dinner', recipe_title: 'Asian Stir Fry' },
];

export const MealPlanScreen: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState('2025-11-06');

  // Generate days for the week
  const getDaysOfWeek = () => {
    const days = [];
    const today = new Date('2025-11-06');

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      days.push({
        date: date.toISOString().split('T')[0],
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: date.getDate(),
      });
    }
    return days;
  };

  const daysOfWeek = getDaysOfWeek();
  const mealsForSelectedDate = mockMealPlans.filter(m => m.date === selectedDate);

  const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Meal Plan</Text>
        <TouchableOpacity style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView>
        {/* Calendar Week View */}
        <View style={styles.calendarContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {daysOfWeek.map((day) => (
              <TouchableOpacity
                key={day.date}
                style={[
                  styles.dayCard,
                  selectedDate === day.date && styles.dayCardSelected,
                ]}
                onPress={() => setSelectedDate(day.date)}
              >
                <Text
                  style={[
                    styles.dayName,
                    selectedDate === day.date && styles.dayNameSelected,
                  ]}
                >
                  {day.dayName}
                </Text>
                <Text
                  style={[
                    styles.dayNum,
                    selectedDate === day.date && styles.dayNumSelected,
                  ]}
                >
                  {day.dayNum}
                </Text>
                {mockMealPlans.filter(m => m.date === day.date).length > 0 && (
                  <View style={styles.planIndicator} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Selected Date */}
        <View style={styles.selectedDateContainer}>
          <Text style={styles.selectedDateText}>
            {new Date(selectedDate).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>

        {/* Meals for Selected Date */}
        <View style={styles.mealsContainer}>
          {mealTypes.map((mealType) => {
            const meal = mealsForSelectedDate.find(m => m.meal_type === mealType);

            return (
              <View key={mealType} style={styles.mealCard}>
                <View style={styles.mealHeader}>
                  <Text style={styles.mealType}>{mealType}</Text>
                  <Text style={styles.mealTime}>
                    {mealType === 'Breakfast' && '7:00 AM'}
                    {mealType === 'Lunch' && '12:00 PM'}
                    {mealType === 'Dinner' && '6:00 PM'}
                    {mealType === 'Snack' && '3:00 PM'}
                  </Text>
                </View>

                {meal ? (
                  <TouchableOpacity style={styles.plannedMeal}>
                    <View style={styles.mealImagePlaceholder}>
                      <Text style={styles.mealEmoji}>🍽️</Text>
                    </View>
                    <View style={styles.mealInfo}>
                      <Text style={styles.mealTitle}>{meal.recipe_title}</Text>
                      <Text style={styles.mealSubtext}>View Recipe →</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.emptyMeal}>
                    <Text style={styles.addMealIcon}>+</Text>
                    <Text style={styles.addMealText}>Add {mealType}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Shopping List Section */}
        <View style={styles.shoppingListSection}>
          <View style={styles.shoppingListHeader}>
            <Text style={styles.shoppingListTitle}>Shopping List</Text>
            <TouchableOpacity>
              <Text style={styles.shoppingListLink}>View All →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.shoppingListPreview}>
            <View style={styles.shoppingItem}>
              <Text style={styles.shoppingItemIcon}>✓</Text>
              <Text style={styles.shoppingItemText}>Spaghetti - 400g</Text>
            </View>
            <View style={styles.shoppingItem}>
              <Text style={styles.shoppingItemIcon}>○</Text>
              <Text style={styles.shoppingItemText}>Eggs - 12 count</Text>
            </View>
            <View style={styles.shoppingItem}>
              <Text style={styles.shoppingItemIcon}>○</Text>
              <Text style={styles.shoppingItemText}>Mixed vegetables - 500g</Text>
            </View>
          </View>
        </View>
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
    color: '#2C3E50',
  },
  addButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  calendarContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  dayCard: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    minWidth: 60,
  },
  dayCardSelected: {
    backgroundColor: '#FF6B35',
  },
  dayName: {
    fontSize: 12,
    color: '#7F8C8D',
    marginBottom: 4,
    fontWeight: '600',
  },
  dayNameSelected: {
    color: '#FFFFFF',
  },
  dayNum: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  dayNumSelected: {
    color: '#FFFFFF',
  },
  planIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#004E89',
    marginTop: 4,
  },
  selectedDateContainer: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  selectedDateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
  },
  mealsContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  mealCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mealType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
  },
  mealTime: {
    fontSize: 14,
    color: '#7F8C8D',
  },
  plannedMeal: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mealImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  mealEmoji: {
    fontSize: 28,
  },
  mealInfo: {
    flex: 1,
  },
  mealTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4,
  },
  mealSubtext: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '500',
  },
  emptyMeal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#E1E8ED',
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  addMealIcon: {
    fontSize: 20,
    color: '#7F8C8D',
    marginRight: 8,
  },
  addMealText: {
    fontSize: 14,
    color: '#7F8C8D',
    fontWeight: '500',
  },
  shoppingListSection: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    marginBottom: 24,
  },
  shoppingListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  shoppingListTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  shoppingListLink: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '500',
  },
  shoppingListPreview: {
    gap: 12,
  },
  shoppingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  shoppingItemIcon: {
    fontSize: 20,
    marginRight: 12,
    color: '#2ECC71',
  },
  shoppingItemText: {
    fontSize: 16,
    color: '#2C3E50',
  },
});
