---
name: project-tab-structure
description: Actual tab structure in MainTabNavigator.tsx — six tabs, Home first, initial route is Home (corrected 2026-06-20)
metadata:
  type: project
---

The Zeus app's `MainTabNavigator.tsx` defines **six** bottom tabs in this order:
**Home, Pantry, MealPlan, Recipes, GroceryList, Profile** — with `initialRouteName="Home"` (line 145; Home tab registered line 167, backed by a HomeStack).

The Home/Today tab **shipped in commit 0a36c36** ("UX overhaul: Home tab, onboarding rebuild, ..."). The app now opens to a directive "what should I cook?" surface, not the old "browse" mode.

**History (do not act on):** This file previously (pre-2026-06-20) recorded five tabs with `initialRouteName="Recipes"` and no Home tab. That was accurate before 0a36c36 and is now corrected.

**How to apply:** Ground tab-level audits in `MainTabNavigator.tsx`. The Home tab is the first impression and initial route — prioritize its flows. Recipes is no longer the entry surface.
