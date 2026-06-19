---
name: pipeline-scripts
description: Inventory of zeus-backend/scripts/ recipe pipeline jobs, their progress-file conventions, and known fragility modes
metadata:
  type: reference
---

# Recipe pipeline scripts (zeus-backend/scripts/)

## Long-running batch jobs with progress files
- `retag_all_recipes.py` — recomputes dietary_tags, cooking_method, time_tags, style_tags, cuisine_type for the full system corpus (595 TheMealDB recipes, user_id `00000000-0000-0000-0000-000000000001`). Writes `retag_progress.json` (list of completed UUIDs). Supports `--resume`, `--dry-run`, `--limit`. Save-every-100. As of 2026-05-25, stalled at 145 IDs (~24% of corpus) — root cause was likely process termination, not a script bug.
- `recalculate_nutrition.py` — recomputes calories/protein/carbs/fat per serving via BUILTIN_NUTRITION lookup table + USDA fallback. **No resume support, no progress file built into the script itself.** The orphaned `nutrition_progress.json` in scripts/ was written by a different (unsaved) script and is currently corrupted (whitespace-only).
- `recalculate_all_macros.py` — likely an alternative path; not yet inspected. Has its own `recalc_progress.json` (multi-MB).
- `fix_servings.py` — backfills servings; `fix_servings_progress.json` is multi-MB.

## Progress file fragility
Several progress files have grown to multi-MB or been corrupted to whitespace. Root cause: non-atomic writes. `retag_all_recipes.save_progress` does a direct `Path.write_text` — if killed mid-write, the file is truncated/corrupted. **Fix pattern**: write to `.tmp` then `os.replace()` for atomic rename. Apply this to every progress writer before re-running.

## Script entry conventions
- All scripts insert parent dir to `sys.path` (`sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))`) before importing `app.*`.
- All use `get_database()` from `app.database` (Supabase client).
- System user UUID is hardcoded as `SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"`.
- Supabase HTTP/2 connection terminates after ~20k streams — `retag_all_recipes.db_call_with_retry` handles this with exponential backoff; copy this pattern when writing new batch scripts.

## Detection modules (live under app/utils/, called by scripts)
- `app/utils/dietary_detection.py` — meat/seafood/dairy/egg/gluten keyword detection with word-boundary regex. Conservative by design.
- `app/utils/cooking_method_detection.py` — cooking method, time tags, style tags. Title-only for `baked` and `no_cook` (very low recall on TheMealDB). First-3-instructions scan for instruction-eligible methods.
- `app/utils/cuisine_detection.py` — refines cuisine from title + ingredients; in `retag_all_recipes.py` only overwrites when current cuisine is NULL or "American".

See also [[detector-recall-gaps]] for specific keywords known to be missing.
