---
name: feedback-onboarding-banner-pattern
description: Onboarding banner critique — banners RESOLVED (replaced by tab-bar coach-marks in commit 0a36c36); the advance-on-incidental-data anti-pattern PARTIALLY remains (pantry + meal_plan steps)
metadata:
  type: feedback
---

Re-verified 2026-06-20 against current code after commit `0a36c36` ("UX overhaul: ... onboarding rebuild"). The original banner critique is now mostly addressed, but the deeper "advance on data, not action" issue partially survives.

## RESOLVED (do not re-raise)

- **In-screen banners are gone.** No "Step N / This is the X screen" copy exists anywhere in `zeus-app/src`. The three banners were replaced by `OnboardingCoachMark.tsx`, a single tab-bar-anchored tooltip rendered once in `MainTabNavigator.tsx` (COACH_MARKS map + `<OnboardingCoachMark>` at the bottom). One canonical copy per step.
- **Dual-copy Grocery banner** (the two divergent strings I flagged) — gone with the banners.
- **"Skip tour"** affordance — present on every coach-mark (`OnboardingCoachMark.tsx`, calls `completeOnboarding`).
- **Phase A** (PreferencesSetupScreen) — progress dots + "n of TOTAL" + persistent "Skip for now" now present (`PreferencesSetupScreen.tsx` progress container). Matches roadmap Phase A target.
- **Grocery step is now action-anchored** — completes on `handleGenerateList` (button) and on first item toggle (`GroceryListScreen.tsx` ~101 and ~142). This is correct per the roadmap.

## STILL APPLIES (the anti-pattern that survived the rebuild)

Pantry and MealPlan steps still advance on **incidental data presence**, inside load functions that fire on focus, not on a completed user action:
- `PantryScreen.tsx` ~299: after `loadPantryItems`, `if (items.length > 0 && currentStep==='pantry') advanceStep()`. Advances because data *exists*, not because the user *added* something this session.
- `MealPlanScreen.tsx` ~151: after a plan loads/generates, `if (currentStep==='meal_plan') advanceStep()`. Same — fires on a plan *existing*, not on the user *generating* one.

**Why it matters:** the roadmap Phase B explicitly says advance on completed ACTIONS not incidental data. A first-run user who already has seeded data (or whose load resolves before they act) gets steps auto-skipped, defeating the teach-the-action intent. Grocery already does it right; pantry + meal_plan should follow (advance from the add/generate handler, not the loader).

## Gap vs roadmap target ([[project-ux-roadmap-2026-05]])

- Phase A: DONE.
- Phase B: structurally DONE (tab-bar coach-marks, skip tour, one copy) but advance-trigger goal only 1 of 3 steps met (grocery yes; pantry + meal_plan still data-anchored).
- Phase C (ambient empty-state CTAs + Zeus AI suggestion after ~5s lingering): EmptyState CTAs exist on pantry/grocery/recipe-hub, but the ~5s Zeus AI contextual suggestion on empty screens is NOT implemented (not found). This is the largest unbuilt piece.

## Recommendation

Not a full rebuild — the rebuild already happened and landed well. Remaining work is small and targeted: (1) move pantry + meal_plan advance calls from the loaders into the add/generate action handlers (~2 line moves each), (2) build Phase C's 5s-linger Zeus AI suggestion if still desired. Worth a small follow-up sprint slice, not a dedicated sprint.
