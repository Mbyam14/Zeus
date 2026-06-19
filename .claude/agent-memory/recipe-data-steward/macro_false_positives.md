---
name: macro-false-positives
description: Specific bugs in recalculate_nutrition.py that inflate calorie counts via aggressive substring matching
metadata:
  type: project
---

# Macro calculation false positives

**Why this matters:** Calorie values are stored and displayed as "cal/serving" everywhere in Zeus. Bad calorie values cascade into meal plan totals, AI suggestions, pantry-based recipe recommendations, and user trust.

**How to apply:** Before re-running `recalculate_nutrition.py`, fix these false-positive paths. After running, always validate via 4P+4C+9F ≈ calories cross-check and flag deviations > 30%.

## Bug 1 — substring fallback in `find_nutrition` (recalculate_nutrition.py lines 338–345)
Two-pass fallback: "is any BUILTIN key contained IN cleaned name?" then "is cleaned name contained IN any key?" This produces false positives like:
- `buttercup squash` → matches `butter` (717 cal/100g) instead of `squash` (26 cal/100g). **~28x inflation.**
- `peanut butter cookies` → matches `peanut butter` correctly but `cream of mushroom soup` could hit `cream` (340 cal/100g) instead of soup defaults.
- `cream of tartar` → matches `cream` (340 cal/100g) — actually potassium bitartrate, ~0 cal.

**Fix:** Port the word-boundary regex pattern from `app/utils/dietary_detection.py` (`_build_pattern`). Match only complete word sequences. Maintain an exception set similar to `EGG_EXCEPTIONS` for known traps (`buttercup`, `cream of tartar`, `butterscotch`, `coconut water`).

## Bug 2 — count-based defaults (`get_weight_in_grams` line 414)
When unit is unknown, the function falls back to `quantity * 100`. For an ingredient like "3 bay leaves" (real weight ~3g) this writes 300g of bay leaf weight — inconsequential because bay leaf has 0 cal, but for "3 jalapeños" (~50g each, written as ~300g) it triples produce weight.

**Fix:** Default to 30g (typical small piece) instead of 100g when name is short (<3 words) and unit is empty. Better: maintain a per-ingredient default-weight table.

## Bug 3 — empty unit fallback at lines 367–403
Multiple inferred-weight rules (`'egg' in name_lower → 50g`, etc.) are correct for the common case but lack a `pepper` rule. "1 jalapeño pepper" with empty unit falls through to `quantity > 10 ? 15g each : 100g` — picks 100g, which is way too high for a single jalapeño.

## Bug 4 — no sanity bound before write
Current code writes whatever it computes, including 3500 cal/serving from a bad lookup. **Required:** before `db.table('recipes').update(...)` at line 513, validate: 30 ≤ cal/serving ≤ 2500, and 4P+4C+9F deviation ≤ 30%. Log violations to `nutrition_outliers.csv` instead of writing.

## Bug 5 — no "don't make it worse" rule
If a recipe already has valid macros (e.g., from TheMealDB seed or AI generation), and the recalc only matches 51% of ingredients (just above the 50% threshold), the new value can be worse than the old. **Required:** skip overwrite when `matched_ratio < 0.75` AND existing calories is non-NULL.

See also [[pipeline-scripts]] for run conventions.
