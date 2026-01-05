-- Add nutrition columns to recipes table for macro tracking
-- Run this script in your Supabase SQL Editor

-- Add nutrition columns to recipes table
ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS calories INTEGER,
ADD COLUMN IF NOT EXISTS protein_grams DECIMAL(5,1),
ADD COLUMN IF NOT EXISTS carbs_grams DECIMAL(5,1),
ADD COLUMN IF NOT EXISTS fat_grams DECIMAL(5,1),
ADD COLUMN IF NOT EXISTS serving_size TEXT;

-- Add indexes for nutrition queries (optional but helpful for filtering)
CREATE INDEX IF NOT EXISTS idx_recipes_calories ON recipes(calories);

-- Success message
SELECT 'Nutrition columns added to recipes table successfully!' as message;
