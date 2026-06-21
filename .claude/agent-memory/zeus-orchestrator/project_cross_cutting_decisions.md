---
name: project-cross-cutting-decisions
description: "Orchestrator arbitration log — cross-track decisions, scope changes, sequencing calls."
metadata:
  type: project
---

Decisions where the orchestrator sequenced or arbitrated across tracks. Newest first.

## 2026-06-20 — Provenance gates rendering, not parallel tracks
Provenance data layer (item 1, recipe-data-steward) is GATING only for future attribution-*render* work. tsc cleanup, blog-import design, and onboarding re-verify do not depend on provenance rendering, so they were dispatched in parallel rather than serialized behind item 1.

## 2026-06-20 — Instacart wiring removed from sprint (user)
Pulled the Instacart entry-point wiring (was priority #2) from the active sprint. External dependency, not a launch blocker. Captured in [[project-blocked-external-deps]] with the note that the modal is already built. No agent re-proposes until Instacart approval lands.

## 2026-06-20 — Edge-function tsc errors out of scope
tsc reports 13 errors total; only 9 are app-scope (the ones to clear). The other 4 are in supabase/functions/generate-recipes/index.ts (abandoned Deno edge-function code). Decision: do not fix; consider excluding from tsc config. Keeps the "9 errors" target honest.
