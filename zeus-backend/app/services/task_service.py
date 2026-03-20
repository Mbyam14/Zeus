"""
Lightweight background task tracking for long-running operations.

Uses in-memory storage. Tasks auto-expire after 1 hour.
Frontend can poll GET /api/tasks/{task_id} for status.
"""

import asyncio
import uuid
import logging
from datetime import datetime, timedelta
from typing import Any, Callable, Coroutine, Optional
from enum import Enum

logger = logging.getLogger(__name__)


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskInfo:
    def __init__(self, task_id: str, task_type: str, user_id: str):
        self.task_id = task_id
        self.task_type = task_type
        self.user_id = user_id
        self.status = TaskStatus.PENDING
        self.result: Any = None
        self.error: Optional[str] = None
        self.created_at = datetime.utcnow()
        self.completed_at: Optional[datetime] = None
        self.progress: int = 0

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status.value,
            "progress": self.progress,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class TaskService:
    def __init__(self):
        self._tasks: dict[str, TaskInfo] = {}
        self._expiry = timedelta(hours=1)

    def _cleanup(self):
        """Remove expired tasks."""
        now = datetime.utcnow()
        expired = [
            tid for tid, t in self._tasks.items()
            if t.completed_at and now - t.completed_at > self._expiry
        ]
        for tid in expired:
            del self._tasks[tid]

    def create_task(self, task_type: str, user_id: str) -> str:
        """Create a task and return its ID."""
        self._cleanup()
        task_id = str(uuid.uuid4())
        self._tasks[task_id] = TaskInfo(task_id, task_type, user_id)
        return task_id

    def get_task(self, task_id: str, user_id: Optional[str] = None) -> Optional[dict]:
        """Get task status. Optionally verify user ownership."""
        task = self._tasks.get(task_id)
        if not task:
            return None
        if user_id and task.user_id != user_id:
            return None
        return task.to_dict()

    async def run_task(
        self,
        task_id: str,
        coro: Coroutine,
    ) -> None:
        """Run an async task in the background and track its status."""
        task = self._tasks.get(task_id)
        if not task:
            return

        task.status = TaskStatus.RUNNING
        try:
            result = await coro
            task.result = result
            task.status = TaskStatus.COMPLETED
            task.progress = 100
        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")
            task.error = str(e)
            task.status = TaskStatus.FAILED
        finally:
            task.completed_at = datetime.utcnow()

    def update_progress(self, task_id: str, progress: int) -> None:
        """Update task progress (0-100)."""
        task = self._tasks.get(task_id)
        if task:
            task.progress = min(100, max(0, progress))

    def get_user_tasks(self, user_id: str) -> list[dict]:
        """Get all active tasks for a user."""
        self._cleanup()
        return [
            t.to_dict() for t in self._tasks.values()
            if t.user_id == user_id and t.status in (TaskStatus.PENDING, TaskStatus.RUNNING)
        ]


# Global instance
task_service = TaskService()
