from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_active_user
from app.services.task_service import task_service
from typing import Dict, Any, List

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


@router.get("/{task_id}")
async def get_task_status(
    task_id: str,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Poll for a background task's status and result."""
    task = task_service.get_task(task_id, user_id=current_user.id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/")
async def get_my_tasks(
    current_user: UserResponse = Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    """Get all active tasks for the current user."""
    return task_service.get_user_tasks(current_user.id)
