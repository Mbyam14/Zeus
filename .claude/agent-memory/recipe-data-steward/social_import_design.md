---
name: social-import-design
description: Shelved design for social-media (Instagram/TikTok/YouTube) recipe import pipeline — preserved for future revival
metadata:
  type: project
---

# Social-Media Recipe Import — Shelved Design

**Status:** Shelved per user 2026-05-25. Too big a stretch for current Zeus state (36k recipe corpus already needs heavy remediation; macro + tag debt takes priority). Revive when the existing corpus is clean and the Browse tab is launching.

**Why:** User wants AI meal planning to lean on the curated corpus (see Zeus memory: "AI meal plan generation may shift to selecting from existing recipes"). Social import is a future Browse-tab feeder, not a current need.

**How to apply:** Do not propose social-import work unprompted. If user revisits, this file is the starting point.

## Target Surfaces

- Instagram Reels (recipe creators paste/caption recipes in description)
- TikTok (caption + video transcript via Whisper)
- YouTube Shorts and full cooking videos (description + transcript)
- Pinterest pins (usually link out to a publisher — handle as URL forward, not OCR)

## Legal Posture (must re-verify at revival time)

- Instagram Graph API and TikTok Display API both prohibit storing media long-term; metadata + transcript text only.
- YouTube Data API v3: transcript pulls are fine; embedding video is fine; copying full description verbatim is gray-area.
- Recipes themselves (ingredient list + steps as facts) are not copyrightable. Specific written expression (creator's prose, jokes, anecdotes) IS copyrightable. Strip to facts.
- Always attribute: link back to original post, creator handle, platform name.
- User submission flow only — never auto-scrape creators who haven't opted in.

## Pipeline Sketch

1. User pastes URL into "Import from social" input
2. Backend resolves platform from URL pattern
3. Platform-specific fetcher pulls: caption/description text + (if video) audio for transcript
4. Whisper transcribes audio (cost: ~$0.006/min — budget concern at scale)
5. LLM extraction pass: caption + transcript → structured Recipe JSON (title, ingredients with qty/unit, steps, servings, time)
6. Confidence scoring per field; <0.7 fields flagged for user confirmation in a review screen
7. Macro estimation via existing nutrition lookup
8. Auto-tag via existing detectors
9. Stored with `source_platform`, `source_url`, `source_creator_handle`, `imported_at`, `extraction_confidence` — requires [[schema_provenance_gap]] resolved FIRST
10. Goes to user's private recipes; only promoted to Browse tab via moderation queue

## Known Failure Modes (anticipated)

- Instagram caption-only recipes with no quantities ("a splash of olive oil") — LLM has to guess, confidence will be low
- TikTok recipes where the steps are only in the video, not the caption — transcript is mandatory
- YouTube long-form: 20-min video with recipe in the middle — need timestamp detection or chapter parsing
- Creator's measurement style ("a cup-ish") doesn't parse into qty+unit cleanly
- Non-English content — Whisper handles many languages but downstream parsing assumes English

## Cost Envelope (rough, at revival)

- Whisper transcription: ~$0.006/min — 5-min video = $0.03
- LLM extraction (Claude Sonnet 4.5): ~$0.02 per recipe
- Per-import all-in: ~$0.05–$0.10
- At 1k imports/day: $50–$100/day — needs rate limiting and per-user quotas

## Dependencies Before Revival

- [[schema_provenance_gap]] must be migrated (source_url, source_platform, imported_at columns exist)
- Moderation queue infra must exist (no direct-to-Browse-tab path)
- Prompt-injection sanitizer on user-pasted text (caption could contain "ignore previous instructions...")
- Allergen auto-tagger must be reliable (top-9 US allergens) — social recipes skip ingredient sanity

## Revival Trigger

Wait until: (a) corpus macros + tags are clean, (b) Browse tab is live with curated content, (c) user explicitly asks for community import. Don't pre-build.
