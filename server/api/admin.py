from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from server.api.dependencies import get_service, require_admin
from server.api.schemas import AdminSongRow, AdminStatsSnapshot, SongUploadResponse
from server.core.monitoring import RuntimeMonitor
from server.core.service import MelodyNetService, ServiceError


router = APIRouter(prefix="/admin", tags=["admin"])


def _get_monitor(request: Request) -> RuntimeMonitor:
    monitor = getattr(request.app.state, "monitor", None)
    if monitor is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Runtime monitor is not ready.")
    return monitor


@router.get("/songs", response_model=list[AdminSongRow])
async def list_songs(
    request: Request,
    q: str = "",
    service: MelodyNetService = Depends(get_service),
) -> list[AdminSongRow]:
    require_admin(request, service)
    rows = service.list_admin_songs(q)
    return [AdminSongRow(**row) for row in rows]


@router.post("/songs", response_model=SongUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_song(
    request: Request,
    title: str = Form(...),
    artist: str = Form(""),
    file: UploadFile = File(...),
    service: MelodyNetService = Depends(get_service),
) -> SongUploadResponse:
    require_admin(request, service)
    monitor = _get_monitor(request)

    stored_file_path: str | None = None
    try:
        stored_file_path, mime_type = service.media_library.store_uploaded_media(file.file, file.filename or "track.wav")
        song = service.create_song(title=title, artist=artist, file_path=stored_file_path, mime_type=mime_type)
        await monitor.notify_stats_update()
        return SongUploadResponse(song=AdminSongRow(**service.admin_song_to_dict(song)))
    except ValueError as exc:
        if stored_file_path:
            service.media_library.remove_managed_media(stored_file_path)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ServiceError as exc:
        if stored_file_path:
            service.media_library.remove_managed_media(stored_file_path)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    finally:
        await file.close()


@router.delete("/songs/{song_id}", response_model=AdminSongRow)
async def delete_song(
    song_id: int,
    request: Request,
    service: MelodyNetService = Depends(get_service),
) -> AdminSongRow:
    require_admin(request, service)
    monitor = _get_monitor(request)

    try:
        payload = service.delete_song(song_id)
        service.media_library.remove_managed_media(payload["file_path"])
        await monitor.notify_stats_update()
        return AdminSongRow(**payload)
    except ServiceError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/stats", response_model=AdminStatsSnapshot)
async def stats(
    request: Request,
    service: MelodyNetService = Depends(get_service),
) -> AdminStatsSnapshot:
    require_admin(request, service)
    monitor = _get_monitor(request)
    return AdminStatsSnapshot(**monitor.build_stats_payload())
