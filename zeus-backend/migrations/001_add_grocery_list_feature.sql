-- Migration: Add Grocery List Feature
-- Description: Creates tables for grocery list generation, unit conversions, and pantry matching
-- Date: 2026-01-13

-- ============================================================================
-- TABLE: grocery_lists
-- Main grocery list table, one per meal plan
-- ============================================================================
CREATE TABLE IF NOT EXISTS grocery_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meal_plan_id UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,

    -- Metadata
    name VARCHAR(200) DEFAULT 'Weekly Grocery List',
    week_start_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Status tracking
    is_purchased BOOLEAN DEFAULT FALSE,
    purchased_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    UNIQUE(user_id, meal_plan_id)
);

-- Indexes for grocery_lists
CREATE INDEX IF NOT EXISTS idx_grocery_lists_user_id ON grocery_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_grocery_lists_meal_plan_id ON grocery_lists(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_grocery_lists_created_at ON grocery_lists(created_at DESC);

-- ============================================================================
-- TABLE: grocery_list_items
-- Individual items in a grocery list
-- ============================================================================
CREATE TABLE IF NOT EXISTS grocery_list_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grocery_list_id UUID NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,

    -- Item details
    item_name VARCHAR(200) NOT NULL,
    normalized_name VARCHAR(200) NOT NULL, -- lowercase, singular for matching
    quantity DECIMAL(10, 2),
    unit VARCHAR(50),
    category VARCHAR(50) NOT NULL, -- Produce, Dairy, Protein, Grains, Spices, Condiments, Beverages, Frozen, Pantry, Other

    -- Pantry tracking
    have_in_pantry BOOLEAN DEFAULT FALSE,
    pantry_quantity DECIMAL(10, 2),
    pantry_unit VARCHAR(50),
    needed_quantity DECIMAL(10, 2), -- quantity - pantry_quantity (if positive)

    -- Purchase tracking
    is_purchased BOOLEAN DEFAULT FALSE,
    estimated_price DECIMAL(10, 2),

    -- Source tracking (which recipes need this item)
    recipe_ids UUID[] DEFAULT ARRAY[]::UUID[],

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for grocery_list_items
CREATE INDEX IF NOT EXISTS idx_grocery_list_items_grocery_list_id ON grocery_list_items(grocery_list_id);
CREATE INDEX IF NOT EXISTS idx_grocery_list_items_normalized_name ON grocery_list_items(normalized_name);
CREATE INDEX IF NOT EXISTS idx_grocery_list_items_category ON grocery_list_items(category);
CREATE INDEX IF NOT EXISTS idx_grocery_list_items_is_purchased ON grocery_list_items(is_purchased);

-- ============================================================================
-- TABLE: unit_conversions
-- Unit conversion factors for ingredient aggregation
-- ============================================================================
CREATE TABLE IF NOT EXISTS unit_conversions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_unit VARCHAR(50) NOT NULL,
    to_unit VARCHAR(50) NOT NULL,
    conversion_factor DECIMAL(10, 6) NOT NULL, -- from_unit * factor = to_unit
    unit_category VARCHAR(50) NOT NULL, -- volume, weight, count
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    UNIQUE(from_unit, to_unit)
);

-- Indexes for unit_conversions
CREATE INDEX IF NOT EXISTS idx_unit_conversions_from_unit ON unit_conversions(from_unit);
CREATE INDEX IF NOT EXISTS idx_unit_conversions_to_unit ON unit_conversions(to_unit);
CREATE INDEX IF NOT EXISTS idx_unit_conversions_category ON unit_conversions(unit_category);

-- ============================================================================
-- SEED DATA: unit_conversions
-- Common unit conversions for volume and weight
-- ============================================================================

-- Volume conversions (to milliliters as base unit)
INSERT INTO unit_conversions (from_unit, to_unit, conversion_factor, unit_category) VALUES
    -- Volume to milliliters
    ('cup', 'ml', 236.588, 'volume'),
    ('tablespoon', 'ml', 14.7868, 'volume'),
    ('tbsp', 'ml', 14.7868, 'volume'),
    ('teaspoon', 'ml', 4.92892, 'volume'),
    ('tsp', 'ml', 4.92892, 'volume'),
    ('fl oz', 'ml', 29.5735, 'volume'),
    ('fluid ounce', 'ml', 29.5735, 'volume'),
    ('pint', 'ml', 473.176, 'volume'),
    ('quart', 'ml', 946.353, 'volume'),
    ('gallon', 'ml', 3785.41, 'volume'),
    ('liter', 'ml', 1000.0, 'volume'),
    ('l', 'ml', 1000.0, 'volume'),

    -- Milliliters to volume units
    ('ml', 'cup', 0.00422675, 'volume'),
    ('ml', 'tbsp', 0.0676280, 'volume'),
    ('ml', 'tsp', 0.202884, 'volume'),
    ('ml', 'fl oz', 0.033814, 'volume'),
    ('ml', 'pint', 0.00211338, 'volume'),
    ('ml', 'quart', 0.00105669, 'volume'),
    ('ml', 'gallon', 0.000264172, 'volume'),
    ('ml', 'liter', 0.001, 'volume')
ON CONFLICT (from_unit, to_unit) DO NOTHING;

-- Weight conversions (to grams as base unit)
INSERT INTO unit_conversions (from_unit, to_unit, conversion_factor, unit_category) VALUES
    -- Weight to grams
    ('oz', 'g', 28.3495, 'weight'),
    ('ounce', 'g', 28.3495, 'weight'),
    ('lb', 'g', 453.592, 'weight'),
    ('pound', 'g', 453.592, 'weight'),
    ('kg', 'g', 1000.0, 'weight'),
    ('kilogram', 'g', 1000.0, 'weight'),

    -- Grams to weight units
    ('g', 'oz', 0.035274, 'weight'),
    ('g', 'lb', 0.00220462, 'weight'),
    ('g', 'kg', 0.001, 'weight')
ON CONFLICT (from_unit, to_unit) DO NOTHING;

-- ============================================================================
-- UPDATE: pantry_items
-- Add normalized_name column for better ingredient matching
-- ============================================================================

-- Add normalized_name column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'pantry_items'
        AND column_name = 'normalized_name'
    ) THEN
        ALTER TABLE pantry_items ADD COLUMN normalized_name VARCHAR(200);
    END IF;
END $$;

-- Update existing rows with normalized names (lowercase, trimmed)
UPDATE pantry_items
SET normalized_name = LOWER(TRIM(item_name))
WHERE normalized_name IS NULL OR normalized_name = '';

-- Create index on normalized_name for fast matching
CREATE INDEX IF NOT EXISTS idx_pantry_items_normalized_name ON pantry_items(normalized_name);

-- ============================================================================
-- COMMENTS
-- Add descriptive comments to tables and columns
-- ============================================================================

COMMENT ON TABLE grocery_lists IS 'Grocery lists generated from meal plans';
COMMENT ON COLUMN grocery_lists.user_id IS 'User who owns this grocery list';
COMMENT ON COLUMN grocery_lists.meal_plan_id IS 'Associated meal plan';
COMMENT ON COLUMN grocery_lists.week_start_date IS 'Start date of the meal plan week';

COMMENT ON TABLE grocery_list_items IS 'Individual items in a grocery list';
COMMENT ON COLUMN grocery_list_items.normalized_name IS 'Lowercase, trimmed name for matching with pantry';
COMMENT ON COLUMN grocery_list_items.have_in_pantry IS 'True if user has this item in their pantry';
COMMENT ON COLUMN grocery_list_items.needed_quantity IS 'Quantity needed after subtracting pantry stock';
COMMENT ON COLUMN grocery_list_items.recipe_ids IS 'Array of recipe IDs that use this ingredient';

COMMENT ON TABLE unit_conversions IS 'Unit conversion factors for ingredient aggregation';
COMMENT ON COLUMN unit_conversions.conversion_factor IS 'Multiply from_unit by this factor to get to_unit';
COMMENT ON COLUMN unit_conversions.unit_category IS 'Category: volume, weight, or count';

-- ============================================================================
-- VERIFICATION QUERIES
-- Run these to verify the migration succeeded
-- ============================================================================

-- Check table existence
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN ('grocery_lists', 'grocery_list_items', 'unit_conversions');

-- Check unit conversions were seeded
-- SELECT COUNT(*) as conversion_count FROM unit_conversions;

-- Check pantry_items has normalized_name
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'pantry_items' AND column_name = 'normalized_name';
