---
name: user-preferences
description: How the user wants the Recipe Data Steward agent to communicate and operate
metadata:
  type: feedback
---

# User collaboration preferences for Recipe Data Steward

## Punchy, bulleted, grouped by issue
**Rule:** Lead with bullets and concrete plans, not prose. Group output strictly by issue (don't blend "macro fix" into "tagging fix").
**Why:** User explicitly asked: "Be punchy. The user is action-oriented; bullet > prose. Group by issue."
**How to apply:** Every multi-issue response should be section-headed (e.g., A/B/C/D) with bulleted sub-points. Skip narrative transitions.

## Plan before code
**Rule:** When the user is in planning/design mode, do NOT write code. Restate plans, file paths, SQL queries, package recommendations — but no edits.
**Why:** User explicitly said "No code changes. Plans, file/line references, SQL queries, package recommendations" — and this came after I had previously delivered an audit they wanted reviewed before action.
**How to apply:** Look for explicit "no code" / "planning" / "design" language in the task. When present, stay in advisory mode even if tempted to fix obvious bugs.

## Restate prior questions when asked
**Rule:** When the user asks for follow-up questions to be restated, pull them verbatim if possible. If I don't have the previous turn's content, say so honestly and offer my best reconstruction.
**Why:** User asked "Restate your follow-up questions" and was specific about pulling them "verbatim."
**How to apply:** Don't fake recall. If memory is missing, declare it and reconstruct, inviting correction.

## Surface UX issues proactively
**Rule:** Per the user's standing instruction (`feedback_uiux_proactive.md` in user-level memory), surface UX issues caused by recipe data even when not asked. Example: blank-state in Recipe Hub when filter returns 0.
**Why:** User has repeatedly asked Claude to be proactive about UI/UX, not just answer narrow questions.
**How to apply:** When designing data-layer changes, always trace through to the user-facing screen and call out impacted surfaces.
