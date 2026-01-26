-- Migration: Add selected_days column to meal_plans table
-- This supports dynamic day selection for meal plans (e.g., Mon-Fri instead of full week)

-- Add the selected_days column (nullable, defaults handled in application)
ALTER TABLE meal_plans
ADD COLUMN IF NOT EXISTS selected_days text[] DEFAULT NULL;

-- Add comment to document the column
COMMENT ON COLUMN meal_plans.selected_days IS
'Array of days included in the meal plan (e.g., {monday,tuesday,wednesday,thursday,friday}). NULL means all 7 days for backwards compatibility.';

-- Optional: Backfill existing meal plans with all 7 days
-- Uncomment if you want to explicitly set all existing plans to full week
-- UPDATE meal_plans
-- SET selected_days = ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
-- WHERE selected_days IS NULL;
