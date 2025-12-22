-- Add sample recipes to Zeus database
-- Run this in your Supabase SQL Editor

-- Get your user ID (replace with actual user ID from your users table)
-- You can find it by running: SELECT id, username, email FROM users;

-- For now, I'll use a placeholder - REPLACE 'YOUR_USER_ID_HERE' with your actual user ID

-- Recipe 2: Quick Asian Stir Fry
INSERT INTO recipes (
    user_id,
    title,
    description,
    image_url,
    ingredients,
    instructions,
    servings,
    prep_time,
    cook_time,
    cuisine_type,
    difficulty,
    meal_type,
    dietary_tags,
    is_ai_generated,
    likes_count
) VALUES (
    (SELECT id FROM users LIMIT 1),  -- Uses first user in the database
    'Quick Asian Stir Fry',
    'Colorful vegetable stir fry with soy sauce and ginger',
    'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&q=80',
    '[
        {"name": "Mixed vegetables", "quantity": "500", "unit": "g"},
        {"name": "Soy sauce", "quantity": "3", "unit": "tbsp"},
        {"name": "Fresh ginger", "quantity": "2", "unit": "tbsp"},
        {"name": "Sesame oil", "quantity": "1", "unit": "tbsp"}
    ]'::jsonb,
    '[
        {"step": 1, "instruction": "Heat oil in wok over high heat"},
        {"step": 2, "instruction": "Add ginger and stir for 30 seconds"},
        {"step": 3, "instruction": "Add vegetables and stir fry for 5 minutes"},
        {"step": 4, "instruction": "Add soy sauce and toss to combine"}
    ]'::jsonb,
    2,
    10,
    8,
    'Asian',
    'Easy',
    ARRAY['Lunch', 'Dinner']::VARCHAR[],
    ARRAY['Vegetarian', 'Vegan']::VARCHAR[],
    false,
    0
);

-- Recipe 3: Avocado Toast with Poached Egg
INSERT INTO recipes (
    user_id,
    title,
    description,
    image_url,
    ingredients,
    instructions,
    servings,
    prep_time,
    cook_time,
    cuisine_type,
    difficulty,
    meal_type,
    dietary_tags,
    is_ai_generated,
    likes_count
) VALUES (
    (SELECT id FROM users LIMIT 1),  -- Uses first user in the database
    'Avocado Toast with Poached Egg',
    'Perfect breakfast with creamy avocado and runny egg',
    'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=800&q=80',
    '[
        {"name": "Sourdough bread", "quantity": "2", "unit": "slices"},
        {"name": "Avocado", "quantity": "1", "unit": "large"},
        {"name": "Eggs", "quantity": "2", "unit": "large"},
        {"name": "Lemon juice", "quantity": "1", "unit": "tsp"}
    ]'::jsonb,
    '[
        {"step": 1, "instruction": "Toast bread until golden"},
        {"step": 2, "instruction": "Mash avocado with lemon juice"},
        {"step": 3, "instruction": "Poach eggs in simmering water"},
        {"step": 4, "instruction": "Top toast with avocado and poached eggs"}
    ]'::jsonb,
    2,
    5,
    10,
    'American',
    'Easy',
    ARRAY['Breakfast']::VARCHAR[],
    ARRAY['Vegetarian']::VARCHAR[],
    false,
    0
);

-- Verify the recipes were added
SELECT id, title, cuisine_type, difficulty FROM recipes ORDER BY created_at DESC LIMIT 3;
