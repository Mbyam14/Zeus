---
name: project-critical-dead-ends
description: Three concrete dead-end flows that block users — Forgot Password, Recipe→MealPlan add, hidden Instacart entry — all surfaced in 2026-05-16 audit
metadata:
  type: project
---

Three concrete dead ends identified in the 2026-05-16 UX audit that strand users mid-flow:

1. **Forgot Password** — `LoginScreen.tsx:106-108` button has no `onPress`. Tapping it does nothing. Users who can't remember their password have zero in-app recovery. App Store rejection risk.

2. **Add to Meal Plan from RecipeDetail** — `RecipeDetailScreen.tsx:489-501` shows an Alert telling users to "Go to your Meal Plan and use the recipe picker" instead of completing the action. The active recipe should seed the picker.

3. **Instacart entry point** — `GroceryListScreen.tsx:583` mounts `<InstacartCheckoutModal>` but no visible button anywhere sets `setShowInstacartModal(true)`. The integration exists but is unreachable.

**Why:** All three were likely intended for later wiring but ship-blocked or forgotten. They represent the highest-leverage fixes because they convert a broken promise into a delivered one, no new design needed.

**How to apply:** When implementing any related flow, fix the dead end first before adding new surface area. Check Master Backlog (B-001→B-076 in Drive) before duplicating — these are obvious enough that some may already be tracked.
