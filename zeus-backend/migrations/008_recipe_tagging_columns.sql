-- Migration: Recipe Tagging Columns
-- Description: Adds three new TEXT[] columns to recipes for richer discovery:
--              cooking_method, time_tags, style_tags. GIN-indexed so contains
--              queries are fast at scale (36k+ recipes).
-- Date: 2026-05-12

-- ============================================================================
-- ALTER: recipes
-- Adds tagging columns. Defaults to empty array (consistent with dietary_tags).
-- ============================================================================

ALTER TABLE recipes
    ADD COLUMN IF NOT EXISTS cooking_method TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS time_tags TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS style_tags TEXT[] DEFAULT '{}';

-- GIN indexes power array @> (contains) queries used by the collections
-- endpoint (e.g. `cooking_method @> ARRAY['sheet_pan']`).
CREATE INDEX IF NOT EXISTS idx_recipes_cooking_method
    ON recipes USING GIN (cooking_method);

CREATE INDEX IF NOT EXISTS idx_recipes_time_tags
    ON recipes USING GIN (time_tags);

CREATE INDEX IF NOT EXISTS idx_recipes_style_tags
    ON recipes USING GIN (style_tags);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN recipes.cooking_method IS
    'Equipment / technique tags: one_pot, sheet_pan, slow_cooker, instant_pot, air_fryer, grilled, no_cook, baked, stir_fry';
COMMENT ON COLUMN recipes.time_tags IS
    'Derived time-based tags: quick (<=30min), weeknight (<=45min easy/med), weekend_project (>90min or Hard)';
COMMENT ON COLUMN recipes.style_tags IS
    'Style / occasion tags: make_ahead, meal_prep, comfort_food';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Confirm columns exist
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'recipes'
--   AND column_name IN ('cooking_method', 'time_tags', 'style_tags');

-- Confirm indexes exist
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'recipes'
--   AND indexname IN ('idx_recipes_cooking_method', 'idx_recipes_time_tags', 'idx_recipes_style_tags');
