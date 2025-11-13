-- Zeus Database Setup Script for Supabase
-- Run this script in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    username VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    profile_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Recipes table
CREATE TABLE IF NOT EXISTS recipes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR NOT NULL,
    description TEXT,
    image_url VARCHAR,
    ingredients JSONB NOT NULL,
    instructions JSONB NOT NULL,
    servings INTEGER DEFAULT 4,
    prep_time INTEGER, -- minutes
    cook_time INTEGER, -- minutes
    cuisine_type VARCHAR,
    difficulty VARCHAR CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    meal_type VARCHAR[] DEFAULT '{}',
    dietary_tags VARCHAR[] DEFAULT '{}',
    is_ai_generated BOOLEAN DEFAULT FALSE,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for recipes
CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(created_at);
CREATE INDEX IF NOT EXISTS idx_recipes_cuisine_type ON recipes(cuisine_type);
CREATE INDEX IF NOT EXISTS idx_recipes_difficulty ON recipes(difficulty);
CREATE INDEX IF NOT EXISTS idx_recipes_likes_count ON recipes(likes_count);

-- Meal plans table
CREATE TABLE IF NOT EXISTS meal_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_name VARCHAR NOT NULL,
    week_start_date DATE NOT NULL,
    meals JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for meal plans
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON meal_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_week_start_date ON meal_plans(week_start_date);

-- Pantry items table
CREATE TABLE IF NOT EXISTS pantry_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    item_name VARCHAR NOT NULL,
    quantity DECIMAL,
    unit VARCHAR,
    category VARCHAR,
    expires_at DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for pantry items
CREATE INDEX IF NOT EXISTS idx_pantry_items_user_id ON pantry_items(user_id);
CREATE INDEX IF NOT EXISTS idx_pantry_items_category ON pantry_items(category);
CREATE INDEX IF NOT EXISTS idx_pantry_items_expires_at ON pantry_items(expires_at);

-- Friendships table
CREATE TABLE IF NOT EXISTS friendships (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

-- Add indexes for friendships
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

-- Recipe likes table
CREATE TABLE IF NOT EXISTS recipe_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, recipe_id)
);

-- Add indexes for recipe likes
CREATE INDEX IF NOT EXISTS idx_recipe_likes_user_id ON recipe_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_likes_recipe_id ON recipe_likes(recipe_id);

-- Recipe saves table
CREATE TABLE IF NOT EXISTS recipe_saves (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, recipe_id)
);

-- Add indexes for recipe saves
CREATE INDEX IF NOT EXISTS idx_recipe_saves_user_id ON recipe_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_saves_recipe_id ON recipe_saves(recipe_id);

-- Create a function to update likes_count on recipes table
CREATE OR REPLACE FUNCTION update_recipe_likes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE recipes 
        SET likes_count = likes_count + 1 
        WHERE id = NEW.recipe_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE recipes 
        SET likes_count = likes_count - 1 
        WHERE id = OLD.recipe_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update likes_count
DROP TRIGGER IF EXISTS trigger_update_recipe_likes_count ON recipe_likes;
CREATE TRIGGER trigger_update_recipe_likes_count
    AFTER INSERT OR DELETE ON recipe_likes
    FOR EACH ROW EXECUTE FUNCTION update_recipe_likes_count();

-- Insert some sample data for testing (optional)
-- You can uncomment these if you want test data

/*
-- Sample users (passwords are hashed version of 'password123')
INSERT INTO users (email, username, password_hash, profile_data) VALUES
('john@example.com', 'john_chef', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewU3P1S1vVYB.u6S', 
 '{"dietary_preferences": ["vegetarian"], "cooking_skill": "intermediate", "favorite_cuisines": ["Italian", "Mexican"]}'),
('sarah@example.com', 'sarah_cooks', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewU3P1S1vVYB.u6S',
 '{"dietary_preferences": ["gluten-free"], "cooking_skill": "beginner", "favorite_cuisines": ["Asian", "Mediterranean"]}');

-- Sample recipe
INSERT INTO recipes (user_id, title, description, ingredients, instructions, servings, prep_time, cook_time, cuisine_type, difficulty, meal_type, dietary_tags) VALUES
((SELECT id FROM users WHERE username = 'john_chef'), 
 'Classic Spaghetti Carbonara', 
 'Creamy Italian pasta dish with eggs, cheese, and pancetta',
 '[{"name": "Spaghetti", "quantity": "400", "unit": "g"}, {"name": "Eggs", "quantity": "4", "unit": "large"}, {"name": "Pancetta", "quantity": "200", "unit": "g"}, {"name": "Parmesan cheese", "quantity": "100", "unit": "g"}, {"name": "Black pepper", "quantity": "1", "unit": "tsp"}]',
 '[{"step": 1, "instruction": "Cook spaghetti according to package directions"}, {"step": 2, "instruction": "Beat eggs with grated Parmesan and black pepper"}, {"step": 3, "instruction": "Cook pancetta until crispy"}, {"step": 4, "instruction": "Toss hot pasta with egg mixture and pancetta"}]',
 4, 15, 20, 'Italian', 'Medium', '{"Dinner"}', '{}');
*/

-- Create Row Level Security (RLS) policies for better security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_saves ENABLE ROW LEVEL SECURITY;

-- Users can only see their own profile data
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid()::text = id::text);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid()::text = id::text);

-- Users can see all recipes but only modify their own
CREATE POLICY "Anyone can view recipes" ON recipes FOR SELECT USING (true);
CREATE POLICY "Users can insert own recipes" ON recipes FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own recipes" ON recipes FOR UPDATE USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete own recipes" ON recipes FOR DELETE USING (auth.uid()::text = user_id::text);

-- Users can only see and modify their own meal plans
CREATE POLICY "Users can view own meal plans" ON meal_plans FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own meal plans" ON meal_plans FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own meal plans" ON meal_plans FOR UPDATE USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete own meal plans" ON meal_plans FOR DELETE USING (auth.uid()::text = user_id::text);

-- Users can only see and modify their own pantry items
CREATE POLICY "Users can view own pantry" ON pantry_items FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert own pantry items" ON pantry_items FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update own pantry items" ON pantry_items FOR UPDATE USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete own pantry items" ON pantry_items FOR DELETE USING (auth.uid()::text = user_id::text);

-- Users can see friendships they're involved in
CREATE POLICY "Users can view relevant friendships" ON friendships FOR SELECT USING (auth.uid()::text = user_id::text OR auth.uid()::text = friend_id::text);
CREATE POLICY "Users can create friendships" ON friendships FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update friendships they initiated" ON friendships FOR UPDATE USING (auth.uid()::text = user_id::text);

-- Users can manage their own likes and saves
CREATE POLICY "Users can view all recipe likes" ON recipe_likes FOR SELECT USING (true);
CREATE POLICY "Users can manage own recipe likes" ON recipe_likes FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete own recipe likes" ON recipe_likes FOR DELETE USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can view all recipe saves" ON recipe_saves FOR SELECT USING (true);
CREATE POLICY "Users can manage own recipe saves" ON recipe_saves FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete own recipe saves" ON recipe_saves FOR DELETE USING (auth.uid()::text = user_id::text);

-- Create a view for popular recipes (useful for trending)
CREATE OR REPLACE VIEW popular_recipes AS
SELECT 
    r.*,
    u.username as creator_username,
    COUNT(rl.id) as total_likes,
    COUNT(rs.id) as total_saves
FROM recipes r
LEFT JOIN users u ON r.user_id = u.id
LEFT JOIN recipe_likes rl ON r.id = rl.recipe_id
LEFT JOIN recipe_saves rs ON r.id = rs.recipe_id
GROUP BY r.id, u.username
ORDER BY total_likes DESC, total_saves DESC, r.created_at DESC;

-- Success message
SELECT 'Zeus database setup completed successfully!' as message;