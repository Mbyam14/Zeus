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
- **AllRecipes.com**: 403 bot protection. Do not propose scraping. Use TheMealDB or licensed APIs instead.

## Do NOT build
- Instagram Graph API integration without business verification (not worth it for v1).
- Aggregate scraping (vs user-initiated single-URL extraction). The share-intent model is the legally safe path; bulk crawling is not.
- Storing copyrighted recipe TEXT or PHOTOS from third-party sites. Store only: source URL, source platform, parsed structured data, and reference (not copy) to the original photo.

## Required for any new source
- Attribution string ("Imported from {source_platform}") displayed in recipe detail with link to `source_url`.
- New schema columns: `source_url`, `source_platform`, `source_handle`, `imported_at`, `import_status`. See [[schema-provenance-gap]].
