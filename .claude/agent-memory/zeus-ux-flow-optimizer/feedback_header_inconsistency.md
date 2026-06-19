---
name: feedback-header-inconsistency
description: Five tabs have five different header patterns despite MEMORY.md stating the Pantry header style is canonical
metadata:
  type: feedback
---

User-stated convention (MEMORY.md): all tabs match Pantry header — `backgroundSecondary` background, border bottom, 28px bold primary-colored title, "+" circle action button.

Reality across the 5 tabs:
- `MealPlanScreen.tsx:434` — ellipsis-horizontal action button (not "+")
- `GroceryListScreen.tsx:443-455` — two icon buttons (refresh, trash)
- `PantryScreen.tsx` — dropdown trigger
- `ProfileScreen.tsx:84-87` — title only, no action
- `RecipeHubScreen.tsx` — sticky search bar pattern

**Why:** Each tab grew organically. The user has explicitly asked (per MEMORY.md) for the Pantry style to be canonical. A shared `<TabHeader>` component would prevent drift.

**How to apply:** When auditing or implementing any tab-level change, flag header inconsistency. Recommend a shared component accepting `{ title, primaryAction, secondaryActions }`. The primary action should be a "+" circle when there's a single create path; secondary actions belong in an overflow `ellipsis` menu. Don't hardcode `colors.primary` for the title — use theme tokens.
