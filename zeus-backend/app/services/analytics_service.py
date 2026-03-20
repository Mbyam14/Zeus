"""
Lightweight analytics event tracking.

Stores events to Supabase analytics_events table.
Events are fire-and-forget (non-blocking) to avoid impacting request latency.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Optional
from collections import defaultdict
from app.database import get_database

logger = logging.getLogger(__name__)


class AnalyticsService:
    def __init__(self):
        self._buffer: list[dict] = []
        self._buffer_limit = 50  # Flush after this many events
        self._local_counts: dict[str, int] = defaultdict(int)  # In-memory fallback

    def track(
        self,
        event_name: str,
        user_id: Optional[str] = None,
        properties: Optional[dict] = None,
    ) -> None:
        """
        Track an analytics event. Non-blocking.
        Events are buffered and flushed to DB periodically.
        """
        event = {
            "event_name": event_name,
            "user_id": user_id,
            "properties": properties or {},
            "created_at": datetime.utcnow().isoformat(),
        }
        self._buffer.append(event)
        self._local_counts[event_name] += 1

        # Flush if buffer is full
        if len(self._buffer) >= self._buffer_limit:
            asyncio.ensure_future(self._flush())

    async def _flush(self) -> None:
        """Flush buffered events to the database."""
        if not self._buffer:
            return

        events_to_flush = self._buffer.copy()
        self._buffer.clear()

        try:
            db = get_database()
            # Insert in batches of 50
            for i in range(0, len(events_to_flush), 50):
                batch = events_to_flush[i:i + 50]
                db.table("analytics_events").insert(batch).execute()
        except Exception as e:
            logger.warning(f"Failed to flush analytics: {e}")
            # Events are lost — acceptable for analytics

    async def flush(self) -> None:
        """Public flush method."""
        await self._flush()

    async def get_summary(self, days: int = 7) -> dict:
        """Get event summary for the last N days."""
        try:
            db = get_database()
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            result = db.table("analytics_events").select(
                "event_name"
            ).gte("created_at", since).execute()

            counts: dict[str, int] = defaultdict(int)
            for row in (result.data or []):
                counts[row["event_name"]] += 1

            return {
                "period_days": days,
                "events": dict(counts),
                "total_events": sum(counts.values()),
            }
        except Exception as e:
            # Fallback to in-memory counts
            return {
                "period_days": days,
                "events": dict(self._local_counts),
                "total_events": sum(self._local_counts.values()),
                "source": "in_memory_fallback",
            }

    async def get_user_activity(self, user_id: str, days: int = 30) -> dict:
        """Get activity summary for a specific user."""
        try:
            db = get_database()
            since = (datetime.utcnow() - timedelta(days=days)).isoformat()
            result = db.table("analytics_events").select(
                "event_name, created_at"
            ).eq("user_id", user_id).gte("created_at", since).execute()

            counts: dict[str, int] = defaultdict(int)
            for row in (result.data or []):
                counts[row["event_name"]] += 1

            return {
                "user_id": user_id,
                "period_days": days,
                "events": dict(counts),
                "total_events": sum(counts.values()),
            }
        except Exception:
            return {"user_id": user_id, "events": {}, "total_events": 0}


# Global instance
analytics = AnalyticsService()
