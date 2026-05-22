-- Migration: USDA Nutrition System
-- Description: Tables and seed data for ingredient-by-ingredient nutrition calculation
--              using the USDA FoodData Central dataset.
-- Date: 2026-05-12

-- ============================================================================
-- EXTENSIONS
-- pg_trgm enables trigram similarity matching for fuzzy ingredient lookup.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- TABLE: usda_foods
-- Imported USDA FoodData Central entries (SR Legacy + Foundation Foods).
-- One row per food item with macro values normalized to per-100g.
-- ============================================================================

CREATE TABLE IF NOT EXISTS usda_foods (
    id BIGSERIAL PRIMARY KEY,
    fdc_id INTEGER UNIQUE NOT NULL,                  -- USDA's stable food ID
    name TEXT NOT NULL,
    category TEXT,                                   -- USDA food category, optional
    data_type TEXT NOT NULL,                         -- 'sr_legacy' | 'foundation' | 'fndds'

    -- Per-100g macros (USDA's canonical reporting basis)
    calories_per_100g NUMERIC(8, 2) NOT NULL,
    protein_per_100g NUMERIC(8, 2) NOT NULL,
    carbs_per_100g NUMERIC(8, 2) NOT NULL,
    fat_per_100g NUMERIC(8, 2) NOT NULL,

    -- Optional extra macros captured for future use
    fiber_per_100g NUMERIC(8, 2),
    sugar_per_100g NUMERIC(8, 2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigram index for fuzzy name matching (powers the matcher's similarity query).
CREATE INDEX IF NOT EXISTS idx_usda_foods_name_trgm
    ON usda_foods USING GIN (LOWER(name) gin_trgm_ops);

-- B-tree on lowercase name for exact lookups.
CREATE INDEX IF NOT EXISTS idx_usda_foods_name_lower
    ON usda_foods (LOWER(name));

CREATE INDEX IF NOT EXISTS idx_usda_foods_data_type
    ON usda_foods (data_type);

-- ============================================================================
-- TABLE: ingredient_unit_density
-- Per-ingredient density lookups: "1 cup flour" weighs differently than "1 cup sugar".
-- Used by the unit converter to translate volume measurements into grams.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ingredient_unit_density (
    id SERIAL PRIMARY KEY,
    ingredient_name TEXT NOT NULL,                   -- lowercased canonical name
    unit TEXT NOT NULL,                              -- canonical unit name (e.g. 'cup', 'tbsp')
    grams NUMERIC(10, 3) NOT NULL,                   -- grams per 1 unit of this ingredient
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE (ingredient_name, unit)
);

CREATE INDEX IF NOT EXISTS idx_ingredient_unit_density_ingredient
    ON ingredient_unit_density (ingredient_name);

-- ============================================================================
-- TABLE: unmatched_ingredient_log
-- Tracks ingredient names the USDA matcher couldn't resolve. Used to identify
-- the top N unmatched terms for manual mapping into ingredient_unit_density
-- or for adding ingredient_name aliases.
-- ============================================================================

CREATE TABLE IF NOT EXISTS unmatched_ingredient_log (
    id BIGSERIAL PRIMARY KEY,
    normalized_name TEXT NOT NULL,                   -- what the normalizer produced
    original_name TEXT,                              -- raw ingredient name as stored
    recipe_id UUID,                                  -- where it came from (nullable, no FK)
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE (normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_unmatched_ingredient_log_count
    ON unmatched_ingredient_log (occurrence_count DESC);

-- ============================================================================
-- SEED DATA: ingredient_unit_density
-- Common cooking measurements where 1 cup of X ≠ 1 cup of water (240g).
-- Sourced from USDA volume-to-weight conversions and standard culinary refs.
-- ============================================================================

INSERT INTO ingredient_unit_density (ingredient_name, unit, grams, notes) VALUES
    -- Flours and starches
    ('all-purpose flour',  'cup',  125,    'Standard fluff-and-scoop'),
    ('all-purpose flour',  'tbsp', 7.8,    NULL),
    ('all-purpose flour',  'tsp',  2.6,    NULL),
    ('bread flour',        'cup',  127,    NULL),
    ('whole wheat flour',  'cup',  120,    NULL),
    ('cake flour',         'cup',  114,    NULL),
    ('almond flour',       'cup',  96,     NULL),
    ('coconut flour',      'cup',  112,    NULL),
    ('cornstarch',         'cup',  120,    NULL),
    ('cornstarch',         'tbsp', 7.5,    NULL),
    ('cornmeal',           'cup',  138,    NULL),

    -- Sugars
    ('sugar',              'cup',  200,    'Granulated white'),
    ('sugar',              'tbsp', 12.5,   NULL),
    ('sugar',              'tsp',  4.2,    NULL),
    ('granulated sugar',   'cup',  200,    NULL),
    ('brown sugar',        'cup',  220,    'Packed'),
    ('brown sugar',        'tbsp', 13.8,   NULL),
    ('powdered sugar',     'cup',  120,    NULL),
    ('confectioners sugar','cup',  120,    NULL),
    ('honey',              'cup',  340,    NULL),
    ('honey',              'tbsp', 21,     NULL),
    ('maple syrup',        'cup',  322,    NULL),
    ('maple syrup',        'tbsp', 20,     NULL),
    ('molasses',           'cup',  337,    NULL),
    ('molasses',           'tbsp', 21,     NULL),

    -- Fats
    ('butter',             'cup',  227,    '2 sticks'),
    ('butter',             'tbsp', 14.2,   NULL),
    ('butter',             'tsp',  4.7,    NULL),
    ('butter',             'stick',114,    NULL),
    ('olive oil',          'cup',  216,    NULL),
    ('olive oil',          'tbsp', 13.5,   NULL),
    ('olive oil',          'tsp',  4.5,    NULL),
    ('vegetable oil',      'cup',  218,    NULL),
    ('vegetable oil',      'tbsp', 13.6,   NULL),
    ('canola oil',         'cup',  218,    NULL),
    ('coconut oil',        'cup',  218,    NULL),
    ('coconut oil',        'tbsp', 13.6,   NULL),
    ('shortening',         'cup',  205,    NULL),
    ('lard',               'cup',  205,    NULL),
    ('peanut butter',      'cup',  258,    NULL),
    ('peanut butter',      'tbsp', 16,     NULL),

    -- Dairy
    ('milk',               'cup',  244,    NULL),
    ('milk',               'tbsp', 15.3,   NULL),
    ('whole milk',         'cup',  244,    NULL),
    ('skim milk',          'cup',  245,    NULL),
    ('buttermilk',         'cup',  245,    NULL),
    ('heavy cream',        'cup',  238,    NULL),
    ('heavy cream',        'tbsp', 14.9,   NULL),
    ('half and half',      'cup',  242,    NULL),
    ('sour cream',         'cup',  230,    NULL),
    ('sour cream',         'tbsp', 14.4,   NULL),
    ('yogurt',             'cup',  245,    NULL),
    ('greek yogurt',       'cup',  227,    NULL),
    ('cream cheese',       'cup',  225,    NULL),
    ('cream cheese',       'tbsp', 14.5,   NULL),
    ('ricotta cheese',     'cup',  246,    NULL),
    ('cottage cheese',     'cup',  225,    NULL),
    ('parmesan cheese',    'cup',  100,    'Grated'),
    ('parmesan cheese',    'tbsp', 6.3,    NULL),
    ('cheddar cheese',     'cup',  113,    'Shredded'),
    ('mozzarella cheese',  'cup',  113,    'Shredded'),
    ('feta cheese',        'cup',  150,    'Crumbled'),

    -- Grains and pasta
    ('rice',               'cup',  185,    'Uncooked white'),
    ('white rice',         'cup',  185,    'Uncooked'),
    ('brown rice',         'cup',  190,    'Uncooked'),
    ('quinoa',             'cup',  170,    'Uncooked'),
    ('oats',               'cup',  90,     'Rolled'),
    ('rolled oats',        'cup',  90,     NULL),
    ('barley',             'cup',  184,    'Uncooked'),
    ('pasta',              'cup',  100,    'Dry, approximate'),
    ('breadcrumbs',        'cup',  108,    NULL),
    ('panko',              'cup',  60,     NULL),

    -- Liquids (mostly water-density)
    ('water',              'cup',  237,    NULL),
    ('water',              'tbsp', 14.8,   NULL),
    ('broth',              'cup',  240,    NULL),
    ('chicken broth',      'cup',  240,    NULL),
    ('beef broth',         'cup',  240,    NULL),
    ('vegetable broth',    'cup',  240,    NULL),
    ('stock',              'cup',  240,    NULL),
    ('wine',               'cup',  236,    NULL),
    ('soy sauce',          'tbsp', 18,     NULL),
    ('vinegar',            'cup',  239,    NULL),
    ('vinegar',            'tbsp', 14.9,   NULL),
    ('lemon juice',        'cup',  244,    NULL),
    ('lemon juice',        'tbsp', 15.2,   NULL),
    ('lime juice',         'tbsp', 15.4,   NULL),

    -- Common vegetables (chopped, packed)
    ('onion',              'cup',  160,    'Chopped'),
    ('garlic',             'clove',3,      'Average clove'),
    ('garlic',             'tsp',  2.8,    'Minced'),
    ('garlic',             'tbsp', 8.5,    'Minced'),
    ('tomato',             'cup',  180,    'Chopped'),
    ('carrot',             'cup',  128,    'Chopped'),
    ('celery',             'cup',  101,    'Chopped'),
    ('bell pepper',        'cup',  149,    'Chopped'),
    ('mushroom',           'cup',  70,     'Sliced'),
    ('spinach',            'cup',  30,     'Fresh, raw'),
    ('kale',               'cup',  20,     'Chopped, raw'),
    ('broccoli',           'cup',  91,     'Chopped'),
    ('cauliflower',        'cup',  100,    'Chopped'),
    ('zucchini',           'cup',  124,    'Sliced'),
    ('cucumber',           'cup',  119,    'Sliced'),
    ('lettuce',            'cup',  47,     'Shredded'),

    -- Salt and seasonings
    ('salt',               'tsp',  6,      'Table salt'),
    ('salt',               'tbsp', 18,     NULL),
    ('kosher salt',        'tsp',  4.8,    NULL),
    ('sea salt',           'tsp',  6,      NULL),
    ('black pepper',       'tsp',  2.3,    'Ground'),
    ('pepper',             'tsp',  2.3,    'Ground'),
    ('cinnamon',           'tsp',  2.6,    'Ground'),
    ('cumin',              'tsp',  2.1,    'Ground'),
    ('paprika',            'tsp',  2.3,    NULL),
    ('chili powder',       'tsp',  2.7,    NULL),
    ('garlic powder',      'tsp',  3.1,    NULL),
    ('onion powder',       'tsp',  2.4,    NULL),
    ('oregano',            'tsp',  1,      'Dried'),
    ('basil',              'tsp',  0.7,    'Dried'),
    ('thyme',              'tsp',  1,      'Dried'),
    ('baking soda',        'tsp',  4.6,    NULL),
    ('baking powder',      'tsp',  4.6,    NULL),
    ('vanilla extract',    'tsp',  4.2,    NULL),

    -- Nuts and seeds
    ('almonds',            'cup',  143,    'Whole'),
    ('walnuts',            'cup',  117,    'Halves'),
    ('pecans',             'cup',  99,     'Halves'),
    ('cashews',            'cup',  130,    NULL),
    ('peanuts',            'cup',  146,    NULL),
    ('chia seeds',         'cup',  170,    NULL),
    ('chia seeds',         'tbsp', 10.5,   NULL),
    ('flax seeds',         'cup',  168,    NULL),
    ('sesame seeds',       'tbsp', 9,      NULL),

    -- Beans and legumes
    ('chickpeas',          'cup',  164,    'Cooked'),
    ('black beans',        'cup',  172,    'Cooked'),
    ('kidney beans',       'cup',  177,    'Cooked'),
    ('lentils',            'cup',  198,    'Cooked'),
    ('lentils',            'cup',  192,    'Dry'),

    -- Misc
    ('cocoa powder',       'cup',  85,     NULL),
    ('cocoa powder',       'tbsp', 5.3,    NULL),
    ('chocolate chips',    'cup',  175,    NULL),
    ('raisins',            'cup',  150,    NULL),
    ('coconut',            'cup',  93,     'Shredded'),
    ('breadcrumb',         'cup',  108,    NULL)
ON CONFLICT (ingredient_name, unit) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE usda_foods IS 'USDA FoodData Central food entries with per-100g macros';
COMMENT ON COLUMN usda_foods.fdc_id IS 'USDA stable identifier for the food item';
COMMENT ON COLUMN usda_foods.data_type IS 'Source: sr_legacy, foundation, or fndds';

COMMENT ON TABLE ingredient_unit_density IS 'Per-ingredient volume-to-weight conversions for nutrition calc';
COMMENT ON COLUMN ingredient_unit_density.grams IS 'Grams per 1 unit of this ingredient (e.g. 125g per cup of flour)';

COMMENT ON TABLE unmatched_ingredient_log IS 'Ingredients the USDA matcher could not resolve, for manual review';
COMMENT ON COLUMN unmatched_ingredient_log.occurrence_count IS 'How many times this normalized name has been seen';

-- ============================================================================
-- VERIFICATION QUERIES
-- Run these to verify the migration succeeded
-- ============================================================================

-- Check extension installed
-- SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';

-- Check new tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN ('usda_foods', 'ingredient_unit_density', 'unmatched_ingredient_log');

-- Check density seed data loaded
-- SELECT COUNT(*) AS density_rows FROM ingredient_unit_density;

-- Check indexes exist
-- SELECT indexname FROM pg_indexes WHERE tablename = 'usda_foods';
