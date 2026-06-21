---
name: schema-provenance-gap
description: The recipes table lacks source/provenance columns needed for legal attribution, import tracking, and future Browse-tab features
metadata:
  type: project
---

# Recipe schema provenance gap

**Why this matters:** Today the recipes table has `user_id` and `is_ai_generated` but nothing tying a recipe to its external origin. This blocks: (a) TheMealDB attribution compliance, (b) social-share-import feature (cannot store where an imported recipe came from), (c) future "Imported" tab, (d) takedown workflow for moderated content, (e) editorial decisions in the Browse tab.

**How to apply:** Any new import or community-recipe feature should land WITH these columns, not after. Backfill the existing 595 TheMealDB recipes in the same migration.

## Proposed columns (add to `recipes` table)
| Column | Type | Purpose |
|---|---|---|
| `source_url` | text NULL | Original URL |
| `source_platform` | text NULL | Enum: `instagram`, `tiktok`, `youtube`, `web`, `manual`, `themealdb`, `ai_generated` |
| `source_handle` | text NULL | @username for social, domain for web |
| `imported_at` | timestamptz NULL | When import completed |
| `import_status` | text NULL | `pending_review` / `accepted` / `rejected` / NULL |
| `is_imported` | bool DEFAULT false | Quick filter for "Imported" tab |

Also add corresponding fields to `RecipeResponse` in `zeus-backend/app/schemas/recipe.py` and surface in any select-* queries.

## Backfill
- 595 TheMealDB rows: `source_platform = 'themealdb'`, `source_url = 'https://www.themealdb.com/meal/{original_id}'` if mapping preserved.
- AI-generated rows (`is_ai_generated = true`): `source_platform = 'ai_generated'`.
- User-created rows: `source_platform = 'manual'`.

## Status: DATA + API LAYER CLOSED as of 2026-06-20 (sprint 2026-06-20, pre-qa-runner).
- DB columns confirmed live via Management API query: `source_platform` (varchar), `source_url` (varchar), `imported_at` (timestamptz) all exist, nullable. Index `idx_recipes_source_platform` exists.
- Recorded migration: `20260619182041_add_recipe_provenance_columns` (additive, IF NOT EXISTS, backfilled themealdb). The proposed `source_handle` / `import_status` / `is_imported` were NOT added and are NOT needed yet.
- Backfill state of 596 rows: 595 themealdb rows have source_platform='themealdb' + imported_at set but source_url=NULL; 1 row has source_platform=NULL. No AI rows currently in table.
- API LAYER NOW DONE: `RecipeResponse` (zeus-backend/app/schemas/recipe.py) exposes `source_platform`, `source_url`, `imported_at`; `_format_recipe_response` (recipe_service.py ~line 891) maps them. All read queries use select("*") so columns flow automatically through the single mapper — no per-query column-list edits needed.
- REMAINING (future): (a) backfill source_url for 595 themealdb rows (mapping to original IDs not preserved — would need re-derivation); (b) set source_platform on create/AI paths (currently left NULL on insert); (c) frontend attribution render (out of scope this sprint).

See also [[source-reliability]] for the import-pipeline this unblocks.
