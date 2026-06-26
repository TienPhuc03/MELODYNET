from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from server.api.dependencies import get_current_user, get_service
from server.api.schemas import AuthRequest, AuthResponse, UserOut
from server.core.service import MelodyNetService, ServiceError


router = APIRouter(prefix="/auth", tags=["auth"])


def _to_user_out(user) -> UserOut:
    return UserOut(id=user.id, username=user.username, is_admin=bool(getattr(user, "is_admin", False)), created_at=user.created_at)


@router.post("/register", response_model=AuthResponse)
def register(payload: AuthRequest, service: MelodyNetService = Depends(get_service)) -> AuthResponse:
    try:
        user, token = service.register_user(payload.username, payload.password)
        return AuthResponse(access_token=token, user=_to_user_out(user))
    except ServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/login", response_model=AuthResponse)
def login(payload: AuthRequest, service: MelodyNetService = Depends(get_service)) -> AuthResponse:
    try:
        user, token = service.authenticate_user(payload.username, payload.password)
        return AuthResponse(access_token=token, user=_to_user_out(user))
    except ServiceError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


@router.get("/me", response_model=UserOut)
def me(request: Request, service: MelodyNetService = Depends(get_service)) -> UserOut:
    try:
        user = get_current_user(request, service)
        return _to_user_out(user)
    except HTTPException:
        raise
    except ServiceError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
