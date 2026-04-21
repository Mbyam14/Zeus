"""
AI Memory Service — handles memory extraction, fact management,
and dynamic system prompt construction for Zeus AI Chat.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from app.database import get_database
from app.services.ai_service import ai_service
from app.config import settings

logger = logging.getLogger(__name__)

HAIKU_MODEL = "claude-haiku-4-5-20251001"
SONNET_MODEL = "claude-sonnet-4-5-20250929"
MAX_FACTS = 50
FACT_EXPIRY_DAYS = 60  # Evict low-confidence facts older than this


class AIMemoryService:
    """Manages the AI's learned knowledge about each user."""

    # ------------------------------------------------------------------
    # Memory extraction (runs in background after every AI interaction)
    # ------------------------------------------------------------------

    async def learn_from_interaction(
        self,
        user_id: str,
        interaction_type: str,
        context: Dict[str, Any],
    ):
        """
        Extract learnable facts from an AI interaction and merge into user memory.
        Runs as a fire-and-forget background task — never blocks the user.
        """
        try:
            prompt = self._build_extraction_prompt(interaction_type, context)
            loop = asyncio.get_running_loop()
            response_text = await asyncio.wait_for(
                loop.run_in_executor(
                    ai_service.executor,
                    ai_service._call_claude_sync,
                    HAIKU_MODEL, 500, 0.2,
                    [{"role": "user", "content": prompt}]
                ),
                timeout=10,
            )

            new_facts = self._parse_extracted_facts(response_text)
            if new_facts:
                await self._merge_facts(user_id, new_facts)

        except Exception as e:
            logger.debug(f"Memory extraction failed (non-critical): {e}")

    def _build_extraction_prompt(self, interaction_type: str, context: Dict[str, Any]) -> str:
        return f"""Analyze this user interaction and extract ONLY genuinely new, personal facts about the user.
Do NOT extract obvious/generic information. Only extract things that reveal preferences, habits, or patterns.

Interaction type: {interaction_type}
Context: {json.dumps(context, default=str)}

If there are meaningful facts, respond with JSON:
{{"facts": [
  {{"category": "<one of: cuisine_preference, dietary, cooking_pattern, skill_observation, household, schedule, ingredient_preference, goal>",
    "fact": "<concise personal fact>"}}
]}}

If nothing meaningful can be learned, respond with:
{{"facts": []}}

RULES:
- Max 3 facts per extraction
- Only facts about the USER, not about recipes or food in general
- Be specific: "prefers spicy Thai food" not "likes food"
- Merge-friendly: facts should be standalone statements"""

    def _parse_extracted_facts(self, response_text: str) -> List[Dict[str, Any]]:
        try:
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            if start == -1 or end == 0:
                return []
            data = json.loads(response_text[start:end])
            raw_facts = data.get("facts", [])
            now = datetime.utcnow().isoformat()
            return [
                {
                    "category": f.get("category", "general"),
                    "fact": f["fact"],
                    "confidence": 0.6,
                    "source_count": 1,
                    "first_observed": now,
                    "last_observed": now,
                }
                for f in raw_facts
                if f.get("fact")
            ]
        except Exception as e:
            logger.debug(f"Failed to parse extracted facts: {e}")
            return []

    async def _merge_facts(self, user_id: str, new_facts: List[Dict[str, Any]]):
        """Merge new facts into existing memory, deduplicating and evicting stale ones."""
        db = get_database()

        # Get or create memory row
        result = db.table("ai_user_memory").select("*").eq("user_id", user_id).execute()
        if result.data:
            existing = result.data[0].get("facts", [])
            if isinstance(existing, str):
                existing = json.loads(existing)
        else:
            existing = []
            db.table("ai_user_memory").insert({
                "user_id": user_id,
                "facts": [],
            }).execute()

        # Merge: if similar fact exists, boost confidence; otherwise add
        for new_fact in new_facts:
            matched = False
            for existing_fact in existing:
                if (
                    existing_fact.get("category") == new_fact["category"]
                    and self._facts_similar(existing_fact.get("fact", ""), new_fact["fact"])
                ):
                    existing_fact["source_count"] = existing_fact.get("source_count", 1) + 1
                    existing_fact["confidence"] = min(1.0, existing_fact.get("confidence", 0.5) + 0.1)
                    existing_fact["last_observed"] = new_fact["last_observed"]
                    matched = True
                    break
            if not matched:
                existing.append(new_fact)

        # Evict stale low-confidence facts if over limit
        cutoff = (datetime.utcnow() - timedelta(days=FACT_EXPIRY_DAYS)).isoformat()
        if len(existing) > MAX_FACTS:
            existing.sort(key=lambda f: (f.get("confidence", 0), f.get("last_observed", "")))
            kept = []
            for f in existing:
                if len(kept) >= MAX_FACTS:
                    break
                # Keep high-confidence or recently observed facts
                if f.get("confidence", 0) >= 0.5 or f.get("last_observed", "") > cutoff:
                    kept.append(f)
            # If we still need to drop, just take the top MAX_FACTS by confidence
            if len(kept) > MAX_FACTS:
                kept = sorted(kept, key=lambda f: f.get("confidence", 0), reverse=True)[:MAX_FACTS]
            existing = kept

        db.table("ai_user_memory").update({
            "facts": existing,
            "last_extracted_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("user_id", user_id).execute()

    def _facts_similar(self, a: str, b: str) -> bool:
        """Simple similarity check — same category + significant word overlap."""
        words_a = set(a.lower().split())
        words_b = set(b.lower().split())
        if not words_a or not words_b:
            return False
        overlap = len(words_a & words_b)
        smaller = min(len(words_a), len(words_b))
        return overlap / smaller > 0.5 if smaller > 0 else False

    # ------------------------------------------------------------------
    # Memory retrieval
    # ------------------------------------------------------------------

    async def get_user_memory(self, user_id: str) -> Dict[str, Any]:
        db = get_database()
        result = db.table("ai_user_memory").select("*").eq("user_id", user_id).execute()
        if result.data:
            facts = result.data[0].get("facts", [])
            if isinstance(facts, str):
                facts = json.loads(facts)
            return {
                "facts": facts,
                "last_updated": result.data[0].get("last_extracted_at"),
            }
        return {"facts": [], "last_updated": None}

    async def clear_user_memory(self, user_id: str):
        db = get_database()
        db.table("ai_user_memory").update({
            "facts": [],
            "last_extracted_at": None,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("user_id", user_id).execute()

    # ------------------------------------------------------------------
    # System prompt construction
    # ------------------------------------------------------------------

    async def build_chat_system_prompt(
        self,
        user_id: str,
        screen_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Build a dynamic system prompt enriched with user data and learned memory."""
        db = get_database()

        # Fetch user profile
        user_result = db.table("users").select("username, profile_data").eq("id", user_id).execute()
        profile_data = {}
        username = "there"
        if user_result.data:
            username = user_result.data[0].get("username", "there")
            profile_data = user_result.data[0].get("profile_data", {})
        preferences = profile_data.get("preferences", {})

        # Fetch pantry
        pantry_result = db.table("pantry_items").select(
            "item_name, quantity, unit, category, expires_at"
        ).eq("user_id", user_id).limit(40).execute()
        pantry_items = pantry_result.data or []

        # Fetch liked recipes
        liked_result = db.table("recipe_likes").select("recipe_id").eq(
            "user_id", user_id
        ).limit(10).execute()
        liked_titles = []
        if liked_result.data:
            liked_ids = [r["recipe_id"] for r in liked_result.data]
            liked_recipes = db.table("recipes").select("title, cuisine_type").in_(
                "id", liked_ids
            ).execute()
            liked_titles = [
                f"{r['title']} ({r.get('cuisine_type', '?')})"
                for r in (liked_recipes.data or [])
            ]

        # Fetch AI memory
        memory = await self.get_user_memory(user_id)
        facts = memory.get("facts", [])

        # Build sections
        pantry_text = "Empty"
        if pantry_items:
            entries = []
            for item in pantry_items[:30]:
                entry = item.get("item_name", "")
                if item.get("quantity"):
                    entry += f" ({item['quantity']} {item.get('unit', '')})"
                if item.get("expires_at"):
                    entry += f" [exp: {item['expires_at'][:10]}]"
                entries.append(entry)
            pantry_text = ", ".join(entries)

        dietary = ", ".join(preferences.get("dietary_restrictions", [])) or "None"
        allergies = ", ".join(preferences.get("allergies", [])) or "None"
        cuisines = ", ".join(preferences.get("cuisine_preferences", [])) or "Any"
        skill = preferences.get("cooking_skill", "intermediate")
        household = preferences.get("household_size", 2)
        calorie_target = preferences.get("calorie_target") or "Not set"
        liked_text = ", ".join(liked_titles[:8]) if liked_titles else "None yet"

        # Format memory facts by category
        memory_section = "Nothing learned yet — this is a new relationship."
        if facts:
            by_category: Dict[str, List[str]] = {}
            for f in facts:
                cat = f.get("category", "general").replace("_", " ").title()
                by_category.setdefault(cat, []).append(f["fact"])
            lines = []
            for cat, cat_facts in by_category.items():
                lines.append(f"- {cat}: {'; '.join(cat_facts)}")
            memory_section = "\n".join(lines)

        # Screen context section
        context_section = ""
        if screen_context:
            screen = screen_context.get("screen", "unknown")
            context_section = f"\n== CURRENT CONTEXT ==\nThey're on the {screen} screen."
            if screen_context.get("recipe_title"):
                context_section += f'\nThey\'re looking at "{screen_context["recipe_title"]}".'
            if screen_context.get("meal_plan_day"):
                context_section += f"\nViewing meal plan for {screen_context['meal_plan_day']}."

        return f"""You are Zeus — a personal AI cooking companion who has been cooking alongside {username} for a while.
You're warm, knowledgeable, and you genuinely know their kitchen and tastes.

== THEIR KITCHEN ==
- Pantry: {pantry_text}
- Dietary restrictions: {dietary}
- Allergies: {allergies}
- Favorite cuisines: {cuisines}
- Cooking skill: {skill}
- Cooking for: {household} people
- Daily calorie target: {calorie_target}
- Recipes they've enjoyed: {liked_text}

== WHAT YOU'VE LEARNED ABOUT THEM ==
{memory_section}
{context_section}

== HOW TO RESPOND ==
- Be conversational, warm, and personalized — reference what you know naturally
- Start with a direct answer, then expand if needed
- When suggesting recipes: give a name, why it suits them, key ingredients (note pantry items), 3-5 steps
- Use **bold** for emphasis, bullet points for lists
- If they ask what you know about them, share your learned profile warmly and naturally
- Never suggest ingredients they're allergic to ({allergies})
- Match explanations to their skill level ({skill})
- Keep responses focused: 2-3 paragraphs max unless they ask for detail
- Be a companion, not a search engine — have personality"""

    # ------------------------------------------------------------------
    # Conversation summary management
    # ------------------------------------------------------------------

    async def maybe_summarize_conversation(self, user_id: str, conversation_id: str):
        """Check if conversation needs summarization and do it if so."""
        db = get_database()
        conv_result = db.table("ai_conversations").select("*").eq("id", conversation_id).execute()
        if not conv_result.data:
            return

        conv = conv_result.data[0]
        message_count = conv.get("message_count", 0)

        # Summarize every 30 messages
        if message_count < 30 or message_count % 30 != 0:
            return

        try:
            # Get messages that haven't been summarized yet
            summary_through = conv.get("summary_through_message_id")
            query = db.table("ai_messages").select("role, content, created_at").eq(
                "conversation_id", conversation_id
            ).order("created_at")

            if summary_through:
                # Get the timestamp of the last summarized message
                last_msg = db.table("ai_messages").select("created_at").eq("id", summary_through).execute()
                if last_msg.data:
                    query = query.gt("created_at", last_msg.data[0]["created_at"])

            messages_result = query.limit(40).execute()
            messages = messages_result.data or []

            if len(messages) < 10:
                return

            # Keep the most recent 20 messages unsummarized
            to_summarize = messages[:-20] if len(messages) > 20 else messages[:len(messages)//2]
            if not to_summarize:
                return

            # Build conversation text for summarization
            conv_text = "\n".join(
                f"{m['role'].upper()}: {m['content'][:200]}" for m in to_summarize
            )

            existing_summary = conv.get("summary", "")
            summary_prompt = f"""Summarize this conversation between a user and their cooking AI assistant.
Focus on: topics discussed, decisions made, recipes mentioned, preferences expressed, and any personal details shared.

{"Previous summary: " + existing_summary if existing_summary else ""}

New messages to incorporate:
{conv_text}

Write a concise summary (max 500 words) that captures the key information."""

            loop = asyncio.get_running_loop()
            new_summary = await asyncio.wait_for(
                loop.run_in_executor(
                    ai_service.executor,
                    ai_service._call_claude_sync,
                    HAIKU_MODEL, 800, 0.3,
                    [{"role": "user", "content": summary_prompt}]
                ),
                timeout=15,
            )

            # Get the ID of the last summarized message
            last_summarized_id = to_summarize[-1].get("id") if to_summarize else None
            # We need to get the actual ID — query by created_at
            if to_summarize:
                last_ts = to_summarize[-1]["created_at"]
                id_result = db.table("ai_messages").select("id").eq(
                    "conversation_id", conversation_id
                ).eq("created_at", last_ts).limit(1).execute()
                if id_result.data:
                    last_summarized_id = id_result.data[0]["id"]

            update_data = {
                "summary": new_summary,
                "updated_at": datetime.utcnow().isoformat(),
            }
            if last_summarized_id:
                update_data["summary_through_message_id"] = last_summarized_id

            db.table("ai_conversations").update(update_data).eq("id", conversation_id).execute()

        except Exception as e:
            logger.debug(f"Conversation summarization failed (non-critical): {e}")


# Global instance
ai_memory_service = AIMemoryService()
