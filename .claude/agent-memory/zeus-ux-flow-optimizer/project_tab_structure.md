---
name: project-tab-structure
description: Actual tab structure in MainTabNavigator.tsx differs from MEMORY.md — five tabs in this order, no Home tab, initial route is Recipes
metadata:
  type: project
---

The Zeus app's `MainTabNavigator.tsx:44-50` defines five tabs in this order:
**Pantry, MealPlan, Recipes, GroceryList, Profile** — with `initialRouteName="Recipes"`.

There is **no Home/Today tab**. The user-facing MEMORY.md references "Home, Meal Plan, Recipes, Grocery, Profile" — this is inaccurate.

**Why:** Either MEMORY.md is stale, or there's a Home tab in the roadmap that hasn't been built. Worth confirming with the user before treating "Home" as canonical.

**How to apply:** When auditing tab-level flows, ground in `MainTabNavigator.tsx` not MEMORY.md. When proposing a "Home tab" rebuild, flag that this would be a new screen, not an enhancement of an existing one. Initial route is `Recipes`, which is a discovery surface — the app opens to "browse" mode, not a directive "what should I cook tonight?" surface.
