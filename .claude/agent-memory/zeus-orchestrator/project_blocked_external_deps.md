---
name: project-blocked-external-deps
description: "Work that is built/designed but BLOCKED on an external party. Instacart entry-point wiring gated on Instacart API approval."
metadata:
  type: project
---

Tracks that cannot proceed because they depend on an external party. Do NOT have any Zeus agent re-propose these until the named gate clears.

## BLOCKED: Instacart entry-point wiring

**State:** External dependency — gated on **"Instacart API approval received."**

**Why blocked:** Instacart has NOT approved Zeus for API use. They may require actual users before approving (chicken-and-egg). User confirmed 2026-06-20 this is NOT a launch blocker.

**What's already built (so context isn't lost):** `InstacartCheckoutModal` is already mounted in `GroceryListScreen`. The remaining work is a small entry-point wire-up (surface/enable the CTA → modal path), NOT a build from scratch. When approval lands this is a quick task.

**Roadmap context:** project_ux_roadmap_2026_05.md "Instacart constraint" — keep the visible CTA as a marketing signal, keep action disabled until approval. Provider integration should be architected so swapping to Target Shipped (user has a Target F&B contact) or another provider is a near one-line change.

**How to apply:** When this approval is reported as received, this becomes a small UX/wiring task for [[zeus-ux-flow-optimizer]] + qa-runner gate. Until then, no agent should re-propose it. Removed from the 2026-06-20 active sprint by user direction.
