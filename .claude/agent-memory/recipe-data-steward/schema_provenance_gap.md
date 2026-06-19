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

## Status: NOT MIGRATED as of 2026-05-25. Design only.

See also [[source-reliability]] for the import-pipeline this unblocks.
