---
name: source-reliability
description: Reliability and legal posture of recipe import sources Zeus might consume from
metadata:
  type: reference
---

# Recipe source reliability and legal posture

## Reliable
- **TheMealDB**: licensed API. 595 recipes seeded as system user. Attribution required per their terms. (Compliance gap: verify whether app currently shows "courtesy of TheMealDB" attribution anywhere.)
- **Schema.org JSON-LD on recipe blogs (NYT Cooking, Serious Eats, Bon Appetit, etc.)**: parseable via Python `recipe-scrapers` library (MIT licensed, 200+ sites supported). Reliable when site has structured markup. Legally acceptable when extraction is user-initiated (share intent).
- **YouTube descriptions + auto-captions**: `youtube-transcript-api` (Python, MIT) is reliable for videos with captions. `yt-dlp` is grey-area ToS but tolerable for user-initiated single-video extracts.

## Flaky
- **Instagram captions**: share intent gives us a URL; fetching it returns login wall. Caption text is only available if the OS share-sheet payload includes it (varies by platform/IG version). Recommendation: tell the user "paste caption manually if extraction fails."
- **TikTok**: OG meta tags work for caption only. Transcript scrapers break monthly. Same UX caveat as Instagram.
- **Pinterest**: pins are usually backlinks → falls back to whatever the destination supports.

## Blocked
- **AllRecipes.com (live scrape)**: 403 bot protection. `zeus-backend/scripts/scrape_allrecipes.py` is the live scraper that hit the 403 wall — it DOES set source_url. Do not propose live scraping.
- **AllRecipes.com bulk dump (RECONCILED 2026-06-19)**: There is now 358MB of AllRecipes data on disk that bypassed the 403 — it is NOT a live scrape. It is a redistributed bulk database dump: `zeus-backend/scripts/allrecipes_import/database/allrecipes.com_database_12042020000000.json` (the `12042020000000` = 2020-12-04 snapshot timestamp is the signature of a circulated scraped archive/torrent, not a licensed feed). Loaded by `import_allrecipes.py`, which curates ~650 recipes and INSERTs them as the system user (UUID 0...001), deleting TheMealDB first. The JSON contains full copyrighted instructional prose (steps text), user descriptions, ratings, and AllRecipes-hosted photo refs (images.allrecipes.com/userphotos). **Legal posture: this is exactly the copyrighted-aggregate pattern guardrails forbid — not legally distributable in a shipping app.** `import_allrecipes.py` writes NO provenance/attribution fields, so imported rows are indistinguishable from clean TheMealDB rows.
- **Evidence the import RAN at least once**: `zeus-backend/scripts/recipe_audit.csv` lists rows with DB-generated UUID PKs (e.g. b1d42bad-...), not source string IDs ("11125") — meaning AllRecipes-derived recipes were inserted into a DB. Audit also shows dessert/cookie titles (Almond Bars, Anzac Biscuits) the importer claims to EXCLUDE, and every row mistagged "Dinner, Lunch". COULD NOT verify current production row count: supabase-readonly MCP tool was not reachable in the 2026-06-19 session. User reported recipes table = 0 rows; treat as UNVERIFIED until queried.
- Recommendation stands: do NOT ship the AllRecipes dump. Use TheMealDB base + user-initiated share-import + (optionally) a licensed bulk API.

## Do NOT build
- Instagram Graph API integration without business verification (not worth it for v1).
- Aggregate scraping (vs user-initiated single-URL extraction). The share-intent model is the legally safe path; bulk crawling is not.
- Storing copyrighted recipe TEXT or PHOTOS from third-party sites. Store only: source URL, source platform, parsed structured data, and reference (not copy) to the original photo.

## Required for any new source
- Attribution string ("Imported from {source_platform}") displayed in recipe detail with link to `source_url`.
- New schema columns: `source_url`, `source_platform`, `source_handle`, `imported_at`, `import_status`. See [[schema-provenance-gap]].
