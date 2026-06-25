from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from server.api.dependencies import get_current_user, get_service
from server.api.schemas import HistoryItemOut
from server.core.service import MelodyNetService, ServiceError


router = APIRouter(prefix="/history", tags=["history"])


@router.get("/me", response_model=list[HistoryItemOut])
def my_history(request: Request, service: MelodyNetService = Depends(get_service)) -> list[HistoryItemOut]:
    try:
        user = get_current_user(request, service)
        rows = service.get_history_rows(user.id)
        return [HistoryItemOut(**row) for row in rows]
    except HTTPException:
        raise
    except ServiceError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

