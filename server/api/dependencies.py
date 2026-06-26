from __future__ import annotations

from fastapi import HTTPException, Request, status

from server.core.service import MelodyNetService, ServiceError


def get_service(request: Request) -> MelodyNetService:
    service = getattr(request.app.state, "service", None)
    if service is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Service is not ready.")
    return service


def get_bearer_token(request: Request) -> str | None:
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    return token or None


def get_current_user(request: Request, service: MelodyNetService):
    token = get_bearer_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing access token.")
    try:
        return service.get_current_user(token)
    except ServiceError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


def require_admin(request: Request, service: MelodyNetService):
    user = get_current_user(request, service)
    if not getattr(user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return user
