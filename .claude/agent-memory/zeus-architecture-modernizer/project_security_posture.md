---
name: zeus-security-posture
description: How Zeus enforces auth/data isolation and the implications for RLS
metadata:
  type: project
---

Zeus backend uses Supabase **service_role** key for all database access (`app/database.py` line 14). Service role bypasses RLS entirely. The frontend has no direct Supabase connection — there are no imports of `@supabase/supabase-js` anywhere in `zeus-app/src` (the stub `zeus-app/src/lib/supabase.ts` is a comment-only dead file).

**What this means:**
- FastAPI is the only security boundary. Every endpoint MUST scope queries by `current_user.id` from the JWT. Any missing `.eq("user_id", current_user.id)` is a tenant-isolation bug, not a defense-in-depth issue.
- RLS policies in migrations (e.g. 005_zeus_ai_chat.sql lines 37–40) are effectively documentation. They do nothing while the backend uses service_role.
- A backend code defect that leaks rows across users cannot be caught by Postgres — there is no second wall.

**Why:** Earlier audits flagged "RLS posture unverified" as a TestFlight blocker. The truth is more nuanced: RLS is irrelevant under the current architecture. The real question is whether to keep service_role + audit every query for user_id scoping, OR switch to per-request anon-key + JWT (which would enforce RLS at the DB layer).

**How to apply:** Don't recommend "audit RLS policies" — recommend "audit every API endpoint for user_id scoping" OR "migrate to per-request JWT auth against Supabase for defense-in-depth." The second is a much larger refactor; the first is the right call for Horizon 1.
