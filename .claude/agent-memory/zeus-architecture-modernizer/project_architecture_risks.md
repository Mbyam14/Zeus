---
name: Zeus architecture risks observed 2026-05-14
description: Non-cost architectural risks identified in first-pass audit
type: project
---

- **Client/server timeout mismatch.** `zeus-app/src/services/api.ts` axios timeout is 15s; `ai_service.py` server-side meal plan timeout is 180s. Client gives up long before server finishes. Needs job-queue + polling (Inngest, Supabase cron, or Cloudflare Queues) rather than synchronous HTTP.
- **`ThreadPoolExecutor(max_workers=2)`** in `ai_service.py` caps concurrent Claude calls per worker at 2. Will queue at modest user volume. Either raise the pool or switch to `anthropic.AsyncAnthropic`.
- **In-memory rate limiting** (`storage_uri="memory://"` in `main.py`) and in-process cache (`cache_service.py`) become per-instance the moment Railway scales horizontally. Need Redis or Supabase-backed storage before multi-instance.
- **Non-atomic AI recipe flagging.** `ai_service.generate_recipe` creates the recipe via `recipe_service.create_recipe` then does a second `db.update({"is_ai_generated": True})`. A crash between writes leaves AI recipes mis-flagged, polluting the "Created" filter.
- **Untracked migrations 005–008** in git as of audit. Will cause schema drift on next deploy if not committed.
- **Debug artifacts in repo:** `debug_claude_response.json`, `debug_current_meal_plan.txt`, `debug_meal_plan.txt`, `debug_preferences.txt` in `zeus-backend/`. May contain PII. Scrub before App Review.
- **Supabase RLS posture unverified.** Not audited yet but is the highest-severity security question before TestFlight.

**Why:** These are the "will break in production" items, distinct from cost. User wants brutal honesty so they're listed as a single inventory.

**How to apply:** Drive Horizon 1 hardening checklist from this list. Timeout mismatch and missing migrations are blocking for any external TestFlight push (relates to pending B-052).
