from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from server.api.dependencies import get_current_user, get_service
from server.api.schemas import SearchResponse, SongOut, StreamStartResponse
from server.core.monitoring import RuntimeMonitor
from server.core.service import MelodyNetService, ServiceError


router = APIRouter(prefix="/songs", tags=["songs"])


def _to_song_out(song) -> SongOut:
    return SongOut(
        id=song.id,
        title=song.title,
        artist=song.artist,
        file_path=song.file_path,
        mime_type=song.mime_type,
    )


@router.get("/search", response_model=SearchResponse)
def search(q: str = "", service: MelodyNetService = Depends(get_service)) -> SearchResponse:
    songs = service.search_songs(q)
    return SearchResponse(items=[_to_song_out(song) for song in songs], query=q)


@router.get("/{song_id}", response_model=SongOut)
def get_song(song_id: int, service: MelodyNetService = Depends(get_service)) -> SongOut:
    try:
        song = service.get_song(song_id)
        return _to_song_out(song)
    except ServiceError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{song_id}/play", response_model=StreamStartResponse)
async def start_playback(
    song_id: int,
    request: Request,
    service: MelodyNetService = Depends(get_service),
) -> StreamStartResponse:
    try:
        user = None
        try:
            user = get_current_user(request, service)
        except HTTPException:
            user = None
        song = service.get_song(song_id)
        if user is not None:
            service.record_history(user.id, song_id)
            monitor: RuntimeMonitor | None = getattr(request.app.state, "monitor", None)
            if monitor is not None:
                await monitor.notify_stats_update()
        total_chunks = service.stream_song(song_id)[2]
        return StreamStartResponse(song=_to_song_out(song), mime_type=song.mime_type, total_chunks=total_chunks)
    except ServiceError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
