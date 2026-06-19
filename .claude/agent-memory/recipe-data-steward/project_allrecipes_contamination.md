---
name: project-allrecipes-contamination
description: The 2026-06 AllRecipes contamination incident and its remediation — what happened, how it was fixed, and what must not recur
metadata:
  type: project
---

# AllRecipes contamination incident (resolved 2026-06-19)

Between 2026-05-12 and 2026-05-25, `zeus-backend/scripts/allrecipes_import/import_allrecipes.py` was run against production. It (1) DELETED the licensed TheMealDB system corpus (595 recipes) and (2) inserted **36,088** recipes from a redistributed 2020 AllRecipes bulk scrape (`database/allrecipes.com_database_12042020000000.json`). These rows carry copyrighted instruction prose and **hot-link AllRecipes-hosted photos** (`images.allrecipes.com/...`) — not legally distributable in a shipping app. This is the copyrighted-aggregate pattern our guardrails forbid. See [[source_reliability]].

**Remediation performed (verified):**
- Backup: `scripts/remediation/backup_recipes.py` paged all 36,089 recipes + likes/saves/meal_plans to a 77MB JSON under `scripts/remediation/backups/` (gitignored). pg_dump/psql are NOT installed and there is no DATABASE_URL — backups must go through the Supabase Python client (service-role key) or MCP, NOT psql.
- Delete + reseed: `scripts/remediation/execute_remediation.py`. A single 36k-row delete hits Supabase's statement timeout (code 57014) — **must delete in batches of ~500 by id**. recipe_likes/recipe_saves cascade (ON DELETE CASCADE); verified 0 orphans. meal_plans.meals is JSONB (no FK) — dangling refs possible but only 6 plans existed.
- Re-seed source: 595 TheMealDB recipes from the git-tracked `zeus-backend/app/data/default_recipes.py` (`get_default_recipes()`); seeder pattern in `scripts/seed_default_recipes.py`.
- Provenance schema added (migration `add_recipe_provenance_columns`): `source_platform`, `source_url`, `imported_at` on recipes. Re-seeded rows tagged `source_platform='themealdb'`. Closes [[schema_provenance_gap]].
- Recurrence guard: `import_allrecipes.py` `__main__` now raises SystemExit before `main()` — it can no longer run.

**Final state:** 596 recipes = 595 themealdb + 1 user "Test" recipe (real user, source_platform null, intentionally preserved).

**Do NOT:** re-run import_allrecipes.py; wire it into any seed path; ship the on-disk AllRecipes zips/`database/`/`zeus-backend/data/` (all gitignored). The user wants catalog growth via legally clean sources — see follow-up: TheMealDB base + user share-import, possibly a licensed API (Spoonacular/Edamam) pending ToS review.
