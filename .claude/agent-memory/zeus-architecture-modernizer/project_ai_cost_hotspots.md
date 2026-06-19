---
name: zeus-ai-cost-hotspots
description: Current Claude touchpoints in Zeus backend and cost amplifiers as of 2026-05-16 audit
metadata:
  type: project
---

Updated map of all Claude API call sites and their cost profiles. The biggest win from earlier audits is already booked: **meal plan generation no longer calls Claude.** `app/api/meal_plans.py::_run_generation` uses a deterministic shortlist + score + assignment pipeline.

**Live Claude touchpoints (claude-sonnet-4-5-20250929 unless noted):**

1. `app/api/ai.py::generate_recipe` → `ai_service.generate_recipe` — Sonnet, 2000 tokens, temp 0.7. Single-shot recipe. Non-atomic flag bug still present (create then UPDATE is_ai_generated).
2. `app/api/ai.py::generate_meal_plan` → `ai_service.generate_meal_plan` — Sonnet, **32000** tokens, temp 0.7. The `variety_note` random-int line is still on ~line 157 of ai_service.py — it defeats prompt caching. This endpoint is still exposed via `/api/ai/generate-meal-plan` even though `/api/meal-plans/generate/` no longer uses it. Confirm whether the client still calls it; if not, delete.
3. `app/api/ai.py::ask_ai` — Sonnet, 1500 tokens, system prompt rebuilt every call. Prompt caching opportunity (the user-context block is mostly stable within a session).
4. `app/api/ai.py::get_substitution` — **Haiku** (`claude-haiku-4-5-20251001`), 500 tokens. Already cached via cache_service. Verify the haiku model ID against current Anthropic catalog before recommending — it may need to be `claude-haiku-4-5` (no dated suffix).
5. `app/api/ai.py::cook_tonight` — Sonnet, 800 tokens. Candidate for Haiku given the bounded output schema.
6. `app/api/ai.py::get_cooking_tip` — Haiku, 400 tokens, cached.
7. `app/api/chat.py::send_message` — Sonnet, 1500 tokens, 30s timeout. System prompt is rebuilt every turn via `ai_memory_service.build_chat_system_prompt`. Prompt caching is the biggest single lever here once chat usage grows — system prompt + memory facts are a perfect cache-prefix candidate.
8. `app/services/ai_memory_service.learn_from_interaction` — fired as `asyncio.create_task` from every chat/ask/substitution/cook_tonight call. Each interaction triggers a background Claude call to extract memory. This is the **hidden cost amplifier**: every user-facing AI call may spawn a second background Claude call. Worth auditing the model and token usage of that path.

**Why:** Prior memory listed the meal-plan path as the dominant cost, which is no longer true. Chat + the implicit "background learn" pattern are now the biggest unwatched dollars.

**How to apply:** When recommending cost controls, prioritize (a) prompt caching on `chat.py` system prompt, (b) routing `cook_tonight` to Haiku, (c) auditing/throttling `_background_learn`, (d) deleting or rewriting the unused `generate_meal_plan` endpoint to remove the variety_note + 32k tokens footgun.
