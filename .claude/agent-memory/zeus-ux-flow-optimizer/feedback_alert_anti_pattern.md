---
name: feedback-alert-anti-pattern
description: Alert.alert is overused across 30+ touchpoints for confirms, errors, and success notices — themed sheets/toasts/banners are the preferred replacement
metadata:
  type: feedback
---

`Alert.alert` is used in ~30 places in `zeus-app/src/screens/**` for confirms, errors, AND success notifications. This is an anti-pattern: alerts are jarring, can't be styled with theme tokens, block user flow, and conflate "fire-and-forget info" with "must-acknowledge decisions".

**Why:** The app has themed components (`ErrorBanner.tsx` exists, `EmptyState.tsx` exists) and a bottom-sheet pattern already used elsewhere (`MealPlanScreen.tsx` options sheet at `:670`, create sheet at `:734`). Alerts violate the visual cohesion these components establish.

**How to apply:** When auditing or implementing a flow, treat any new `Alert.alert` as a code smell. Prefer:
- Destructive confirms → bottom `<ConfirmSheet>` (matches existing options-sheet style)
- Success/info notices → toast or animated banner
- Error states → `<ErrorBanner>` (already exists, extend it)
- Validation errors → inline under the relevant field

Highest-impact migration order (by visibility): LoginScreen errors → RegisterScreen validation → MealPlan destructive confirms → GroceryList "Done Shopping" multi-step → PantryScreen bulk-add notices.
