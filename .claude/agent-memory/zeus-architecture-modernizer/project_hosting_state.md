---
name: Zeus hosting state (as of 2026-05-14)
description: Where Zeus backend runs in production and how the frontend reaches it
type: project
---

FastAPI backend is deployed to Railway at `https://zeus-production-850d.up.railway.app`. Both `preview` and `production` EAS channels in `zeus-app/config.ts` point there. `Procfile` and `railway.json` are present in `zeus-backend/`.

**Why:** Earlier project memory ("no production host confirmed") was stale. Confirmed during 2026-05-14 architecture audit by reading `zeus-app/config.ts` (lines 28–37) and Railway config files.

**How to apply:** Don't recommend "deploy FastAPI somewhere" in Horizon 1 — that's already done. The relevant question is whether Railway is the right long-term home (vs. Fly.io, containerized self-host, or rewrite to edge) given AI request durations and scale targets. The 180s server-side AI timeout vs Railway's request lifecycle is the real concern, not absence of hosting.
