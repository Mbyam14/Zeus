---
name: detector-recall-gaps
description: Specific keyword/heuristic gaps in dietary and cooking-method detectors that cause low recall on the TheMealDB corpus
metadata:
  type: project
---

# Detector recall gaps (TheMealDB corpus, 595 recipes)

**Why this matters:** When a Recipe Hub filter is selected and 0 recipes match, the app currently shows a silent blank. Most cooking_method and style_tag filters return blank because (a) the retag job didn't finish and (b) the detectors miss most TheMealDB recipes even when run.

**How to apply:** When designing new tag filters or expanding detectors, sample 20 TheMealDB titles first — if the keyword list wouldn't match the natural language of those titles, recall will be poor regardless of how clever the regex is.

## Cooking methods — under-recall causes
- `baked` and `no_cook` are title-only matches in `cooking_method_detection.py`. TheMealDB titles are formal dish names ("Apple Frangipane Tart", "Beef Wellington") and almost never contain the literal word "baked". **Fix:** allow first-N-instructions scan with explicit oven-related keywords (`preheat the oven`, `bake at`, `bake for`, `transfer to the oven`).
- `instant_pot`, `air_fryer`, `slow_cooker` keywords are appliance names that classical TheMealDB recipes don't use. These tags will always have low recall on TheMealDB; coverage will improve naturally as user/AI recipes are added.
- `comfort_food` keyword list is evocative adjectives (`creamy`, `hearty`) which don't appear in formal TheMealDB titles. Expanding to dish-type cues (casserole, pot pie, mac and cheese, shepherd's pie, lasagna, risotto, stew, chowder, chili, cobbler, crumble) gives ~3x recall but introduces some debatable matches.

## Dietary detection — known missing keywords
- Meats: `goat`, `boar`, `mutton`, `octopus`.
- Dairy: `paneer`, `clotted cream`.
- Gluten: `seitan` (pure gluten), `udon`, `ramen`, `phyllo`, `filo`, `puff pastry`, `shortcrust`, `digestive biscuit`, `wheaten`.
- Gluten-free alternatives missed: `soba` (buckwheat, GF), `mochi`.
- Egg: `quail egg`, `duck egg`, `meringue`, `aioli`.

## Style tags
- `make_ahead` and `meal_prep` vocabulary (`portion into containers`, `freezer-friendly`, `keeps for N days`) is food-blogger speak — essentially absent from TheMealDB. Expect near-zero coverage on the seed corpus; will populate as user/AI recipes are added.

See also [[pipeline-scripts]] for where these detectors are wired into the retag job.
