from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class ScreenContext(BaseModel):
    screen: str = Field(..., description="Current screen name")
    recipe_id: Optional[str] = None
    recipe_title: Optional[str] = None
    meal_plan_day: Optional[str] = None


class ChatMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    screen_context: Optional[ScreenContext] = None


class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    metadata: Dict[str, Any] = {}
    created_at: str


class ChatHistoryResponse(BaseModel):
    messages: List[ChatMessageResponse]
    has_more: bool


class MemoryFact(BaseModel):
    category: str
    fact: str
    confidence: float
    source_count: int
    first_observed: str
    last_observed: str


class MemoryResponse(BaseModel):
    facts: List[MemoryFact]
    last_updated: Optional[str] = None
