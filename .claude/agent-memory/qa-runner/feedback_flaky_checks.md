---
name: feedback-flaky-checks
description: Checks that produce intermittent failures in this repo — re-run before blocking
metadata:
  type: feedback
---

## Backend auth fixture (conftest.py)

The `auth_headers` fixture in zeus-backend/tests/conftest.py registers a new Supabase user each test session. If Supabase is unreachable or rate-limits, all tests that depend on `auth_headers` will `pytest.skip(...)`. This is not a test failure — it is a legitimate skip due to environment. Re-run once before calling it a BLOCK.

**Why:** Tests hit the live Supabase project (no local mock). Network flakiness or a cold-start can cause the registration POST to time out.

**How to apply:** If pytest output shows all tests skipped with "Could not create or login test user", treat as environment issue, not code regression. Flag to user rather than blocking the PR.
