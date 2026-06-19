---
name: feedback-onboarding-banner-pattern
description: Onboarding banners are anchored to screens (not actions) and advance based on incidental data presence — they describe rather than teach
metadata:
  type: feedback
---

Zeus's first-run onboarding uses inline banners on Pantry/MealPlan/Grocery screens that read like "Step N: This is the X screen". They advance via `onboardingStore.advanceStep()` when *data exists* on the screen (e.g., `items.length > 0` advances pantry step), not when the user *performs the intended action*.

**Why:** A user landing on Recipes (initial tab) sees no banner. A user who hops tabs in unexpected order sees banners out of sequence. The Grocery banner even has two different copies depending on whether `groceryList` exists (`GroceryListScreen.tsx:331` vs `:458`) for the same step. This narrates rather than directs.

**How to apply:** When proposing onboarding changes, push toward coach-marks anchored to the **tab bar** (where the next action is taken), not banners inside screens. Advance steps on completed *actions* (item added, plan generated, list generated), not on incidental data. Keep one canonical copy per step. Always include a "Skip tour" affordance.
