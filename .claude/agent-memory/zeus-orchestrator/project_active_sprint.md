---
name: project-active-sprint
description: "Active sprint as of 2026-06-20 — provenance gating, tsc cleanup, blog-import design, onboarding re-verify. Instacart pulled (external dependency)."
metadata:
  type: project
---

Active sprint approved by user 2026-06-20. Re-sequenced from a prior plan; user removed the Instacart wiring track (see [[project-blocked-external-deps]]).

**Target context:** Jan 2027 launch. ~28 weeks out.

**Sprint goal:** Land the recipe provenance data layer, clear the 9 known tsc errors, design (not build) web/blog share-import, and re-verify the onboarding banner state against current code.

## Priority order (approved)

1. **Provenance in RecipeResponse + select queries** — owner: [[recipe-data-steward]]. GATING for any future attribution-render work. Addresses the schema_provenance_gap (source_url/source_platform/imported_at missing from recipes + not surfaced in API responses/select queries). Items 2-4 do NOT depend on provenance *rendering*, so they run in parallel.
2. **Clear the 9 pre-existing tsc errors** — owner: [[zeus-architecture-modernizer]] (or folded into whichever track touches those files). Confirmed 2026-06-20: 1 in EditPreferencesScreen.tsx:430 (bad ionicon name "eco-outline"), 8 in RecipeDetailScreen.tsx:730/740 (possibly-undefined macro fields). NOTE: 4 additional errors in supabase/functions/generate-recipes/index.ts are stale Deno edge-function code (abandoned per user MEMORY.md) — out of scope, do not "fix," consider excluding from tsc.
3. **Blog/web share-import** — DESIGN ONLY this sprint — owner: [[recipe-data-steward]]. No pipeline build yet.
4. **Onboarding banner re-verification vs current code** — owner: [[zeus-ux-flow-optimizer]]. The banner critique is ~weeks old; verify it still matches code before any rebuild. Recent commit 0a36c36 "onboarding rebuild" may have changed the picture.

## Deferred (not this sprint, unchanged)
- Alert.alert cleanup (~110 sites; memory says ~30 but 110 cited by user 2026-06-20 — recount needed)
- Social/YouTube import (shelved design preserved in recipe-data-steward memory)
- Home/Today tab

## Gate
All code-touching tracks (1, 2, possibly 4) must pass [[qa-runner]] before merge. Gate confirmed working 2026-06-20: `npx tsc` runs under current settings.local.json (Bash npx tsc / python / venv python all allowed).

## Status (2026-06-20 dispatch results)
- Item 1 (provenance): DONE pending merge. Columns already existed (migration 20260619182041_add_recipe_provenance_columns); real work was API layer — RecipeResponse + _format_recipe_response now expose source_platform/source_url/imported_at. Single mapper, all select("*") paths inherit it. PASSED qa-runner.
- Item 2 (tsc): DONE pending merge. 9 app-scope errors cleared (EditPreferencesScreen eco-outline→leaf-outline; RecipeDetailScreen 8 macro guards). PASSED qa-runner. tsc now shows only the 4 known edge-function errors.
- Item 3 (blog-import DESIGN): DONE. Design delivered (JSON-LD primary, 4-tier degrade, provenance-populating, macro trust rules, legal/safety, tagging). 7 open questions for user before any build sprint. No code written.
- Item 4 (onboarding re-verify): DONE. Banner rebuild already landed in commit 0a36c36 — old critique mostly RESOLVED. Recommend NOT a rebuild sprint; small follow-up only.
- qa-runner gate: PASS both code changesets 2026-06-20. 5 backend tests green, frontend tsc clean (app-scope), imports clean.

## Follow-ups surfaced (candidates for next sprint, not committed)
- Provenance backfill: 595 TheMealDB rows have source_url=NULL; set source_platform='manual'/'ai_generated' at INSERT time on create + AI-gen paths so new rows self-describe.
- tsconfig: exclude supabase/functions (Deno) so the 4 false errors leave the gate permanently (config change, deferred to user).
- Onboarding: pantry + meal_plan advanceStep() still fire on incidental data (loaders) not user action — ~2-line move each into add/generate handlers. Phase C 5s-linger Zeus AI empty-state suggestion is unbuilt.
- STALE MEMORY flagged by ux agent: project_tab_structure.md says no Home tab / initial route Recipes, but Home tab now ships as 6th tab AND is initial route (MainTabNavigator.tsx). User-level MEMORY.md still describes Home as "planned." Needs correction pass.
- macro_false_positives fixes (word-boundary, exception set, pre-write sanity bound) are prerequisites before web-import relies on USDA calc — sequencing note for the blog-import build sprint.
- No frontend test infra; pytest not pinned in venv (add to dev-requirements).

## Decisions
- 2026-06-20: tsc app-scope error count = 9 (verified), matching user's figure. Edge-function errors excluded.
