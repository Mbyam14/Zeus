---
name: project-uncovered-areas
description: Areas of the Zeus codebase with no automated test coverage — surface to orchestrator for prioritization
metadata:
  type: project
---

## Frontend (zeus-app) — zero test coverage

No test files exist anywhere in zeus-app/. There is no Jest config, no `__tests__` directory, no `.test.ts(x)` files. The entire React Native app is untested by automation.

**High-priority uncovered areas (as of 2026-06-19):**
- `zeus-app/src/lib/pendingRecipePick.ts` — the callback-registry pattern is the core of the new recipe-picker flow. If the module-level `pending` slot races (e.g., double-navigate), there is no test to catch it.
- `zeus-app/src/lib/pendingRecipeCreate.ts` — same concern.
- `zeus-app/src/screens/mealplan/RecipePickerScreen.tsx` — new screen, zero coverage.
- All navigation flows (MainTabNavigator stack wiring).

**Why:** React Native Expo project has no test runner configured. No devDependency on jest, @testing-library/react-native, etc.

**How to apply:** Flag "no frontend tests" as a WARN (not BLOCK) on every run until test infrastructure is added. Recommend to orchestrator that the pendingRecipePick/pendingRecipeCreate libs be the first unit tests written — they are pure TS with no RN dependencies and easy to test in isolation.

## Backend (zeus-backend) — partial coverage

Tests exist for: auth, meal_plans, pantry, recipes, users.
pytest is listed in requirements.txt but NOT installed in the venv as of 2026-06-19 (no pytest.exe in venv/Scripts/). Tests may be runnable via `python -m pytest` but this was not verified (shell access denied in first run session).

**Uncovered backend areas:**
- AI chat endpoints (zeus_ai_chat)
- Recipe scraping / import scripts
- Nutrition calculation pipeline
- Tag normalization scripts
