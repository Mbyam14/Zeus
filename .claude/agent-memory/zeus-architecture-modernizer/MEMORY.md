# Zeus Architecture Modernizer Memory

- [Hosting state](project_hosting_state.md) — FastAPI is on Railway at zeus-production-850d.up.railway.app; supersedes stale "no host confirmed" note
- [AI cost hotspots](project_ai_cost_hotspots.md) — meal plan no longer calls Claude; chat + background learn are now top cost vectors. Haiku is in use for substitutions/cooking-tips.
- [Architecture risks](project_architecture_risks.md) — 15s vs 180s timeout mismatch on `/api/ai/*` (not meal plans), in-mem rate limiter, debug artifacts still in repo, non-atomic AI recipe flag
- [Security posture](project_security_posture.md) — backend uses service_role key; RLS is decorative; frontend never touches Supabase directly
