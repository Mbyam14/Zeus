"""
Zeus AI Chat — persistent AI companion endpoints.
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.schemas.chat import (
    ChatMessageRequest,
    ChatMessageResponse,
    ChatHistoryResponse,
    MemoryResponse,
    MemoryFact,
)
from app.schemas.user import UserResponse
from app.services.ai_service import ai_service
from app.services.ai_memory_service import ai_memory_service
from app.utils.dependencies import get_current_active_user
from app.database import get_database
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["Zeus AI Chat"])
limiter = Limiter(key_func=get_remote_address)

SONNET_MODEL = "claude-sonnet-4-5-20250929"
MAX_HISTORY_MESSAGES = 20  # Recent messages sent to Claude


def _get_or_create_conversation(db, user_id: str) -> Dict[str, Any]:
    """Get or create the single conversation thread for a user."""
    result = db.table("ai_conversations").select("*").eq("user_id", user_id).execute()
    if result.data:
        return result.data[0]

    # Create new conversation
    insert_result = db.table("ai_conversations").insert({
        "user_id": user_id,
    }).execute()
    return insert_result.data[0]


@router.post("/message", response_model=ChatMessageResponse)
@limiter.limit(settings.rate_limit_ai)
async def send_message(
    request: Request,
    body: ChatMessageRequest,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Send a message to Zeus AI and get a response.
    The AI has full context: user profile, pantry, memory, and conversation history.
    """
    if not ai_service.client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI service not configured",
        )

    db = get_database()
    user_id = str(current_user.id)

    # Get or create conversation
    conversation = _get_or_create_conversation(db, user_id)
    conversation_id = conversation["id"]

    # Save user message
    screen_meta = body.screen_context.model_dump() if body.screen_context else {}
    user_msg_result = db.table("ai_messages").insert({
        "conversation_id": conversation_id,
        "role": "user",
        "content": body.message,
        "metadata": screen_meta,
    }).execute()
    user_msg = user_msg_result.data[0]

    # Build system prompt with full context
    screen_ctx = screen_meta if screen_meta else None
    system_prompt = await ai_memory_service.build_chat_system_prompt(
        user_id, screen_ctx
    )

    # Fetch recent messages for context
    recent_result = db.table("ai_messages").select(
        "role, content"
    ).eq("conversation_id", conversation_id).order(
        "created_at", desc=True
    ).limit(MAX_HISTORY_MESSAGES).execute()

    recent_messages = list(reversed(recent_result.data or []))

    # Build Claude messages array
    claude_messages = []

    # Add conversation summary if exists
    summary = conversation.get("summary", "")
    if summary:
        claude_messages.append({
            "role": "user",
            "content": f"[Previous conversation summary: {summary}]",
        })
        claude_messages.append({
            "role": "assistant",
            "content": "I remember our previous conversations. How can I help you today?",
        })

    # Add recent messages (already includes the just-saved user message)
    for msg in recent_messages:
        claude_messages.append({
            "role": msg["role"],
            "content": msg["content"],
        })

    try:
        messages_payload = _build_claude_payload(system_prompt, claude_messages) if claude_messages else [{"role": "user", "content": system_prompt}]
        logger.info(f"Chat: sending {len(messages_payload)} messages to Claude (model={SONNET_MODEL})")

        loop = asyncio.get_running_loop()
        response_text = await asyncio.wait_for(
            loop.run_in_executor(
                ai_service.executor,
                ai_service._call_claude_sync,
                SONNET_MODEL,
                1500,
                0.7,
                messages_payload,
            ),
            timeout=30,
        )

        # Save assistant response
        assistant_msg_result = db.table("ai_messages").insert({
            "conversation_id": conversation_id,
            "role": "assistant",
            "content": response_text,
            "metadata": {},
        }).execute()
        assistant_msg = assistant_msg_result.data[0]

        # Update conversation message count
        new_count = conversation.get("message_count", 0) + 2
        db.table("ai_conversations").update({
            "message_count": new_count,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", conversation_id).execute()

        # Background: extract memory from this exchange
        asyncio.create_task(_background_learn(
            user_id, body.message, response_text, screen_meta
        ))

        # Background: maybe summarize if we hit the threshold
        asyncio.create_task(
            ai_memory_service.maybe_summarize_conversation(user_id, conversation_id)
        )

        return {
            "id": assistant_msg["id"],
            "role": "assistant",
            "content": response_text,
            "metadata": {},
            "created_at": assistant_msg["created_at"],
        }

    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI response timed out. Please try again.",
        )
    except Exception as e:
        logger.error(f"Chat message failed: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get AI response: {str(e)[:200]}",
        )


def _build_claude_payload(system_prompt: str, messages: List[Dict[str, str]]) -> list:
    """
    Build the messages array for Claude.
    Prepend the system prompt as context in the first user message.
    """
    if not messages:
        return [{"role": "user", "content": system_prompt}]

    result = []
    first_user_seen = False
    for msg in messages:
        if msg["role"] == "user" and not first_user_seen:
            # Prepend system prompt to first user message
            result.append({
                "role": "user",
                "content": f"{system_prompt}\n\n---\n\n{msg['content']}",
            })
            first_user_seen = True
        else:
            result.append(msg)

    return result


async def _background_learn(
    user_id: str,
    user_message: str,
    ai_response: str,
    screen_context: Dict[str, Any],
):
    """Background task to extract memory from a chat exchange."""
    try:
        await ai_memory_service.learn_from_interaction(
            user_id,
            "chat",
            {
                "user_message": user_message,
                "ai_response": ai_response[:500],  # Truncate to save tokens
                "screen": screen_context.get("screen", "unknown"),
            },
        )
    except Exception as e:
        logger.debug(f"Background learn failed: {e}")


@router.get("/history", response_model=ChatHistoryResponse)
async def get_history(
    request: Request,
    limit: int = 50,
    before_id: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Get conversation history with cursor pagination."""
    db = get_database()
    user_id = str(current_user.id)

    # Get conversation
    conv_result = db.table("ai_conversations").select("id").eq("user_id", user_id).execute()
    if not conv_result.data:
        return {"messages": [], "has_more": False}

    conversation_id = conv_result.data[0]["id"]

    # Build query
    query = db.table("ai_messages").select("*").eq(
        "conversation_id", conversation_id
    ).order("created_at", desc=True)

    if before_id:
        # Get the timestamp of the cursor message
        cursor_result = db.table("ai_messages").select("created_at").eq("id", before_id).execute()
        if cursor_result.data:
            query = query.lt("created_at", cursor_result.data[0]["created_at"])

    # Fetch one extra to check has_more
    result = query.limit(limit + 1).execute()
    messages = result.data or []

    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]

    return {
        "messages": [
            {
                "id": m["id"],
                "role": m["role"],
                "content": m["content"],
                "metadata": m.get("metadata", {}),
                "created_at": m["created_at"],
            }
            for m in messages
        ],
        "has_more": has_more,
    }


@router.get("/memory", response_model=MemoryResponse)
async def get_memory(
    request: Request,
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Get the AI's learned profile about the user."""
    memory = await ai_memory_service.get_user_memory(str(current_user.id))
    return memory


@router.delete("/memory")
async def clear_memory(
    request: Request,
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Clear all AI-learned memory about the user."""
    await ai_memory_service.clear_user_memory(str(current_user.id))
    return {"message": "AI memory cleared successfully"}


@router.delete("/history")
async def clear_history(
    request: Request,
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Clear all conversation history (does NOT clear learned memory)."""
    db = get_database()
    user_id = str(current_user.id)

    conv_result = db.table("ai_conversations").select("id").eq("user_id", user_id).execute()
    if conv_result.data:
        conversation_id = conv_result.data[0]["id"]
        db.table("ai_messages").delete().eq("conversation_id", conversation_id).execute()
        db.table("ai_conversations").update({
            "summary": "",
            "summary_through_message_id": None,
            "message_count": 0,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", conversation_id).execute()

    return {"message": "Conversation history cleared"}
