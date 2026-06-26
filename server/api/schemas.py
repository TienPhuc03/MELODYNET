from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AuthRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)

class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool = False
    created_at: datetime | None = None

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class SongOut(BaseModel):
    id: int
    title: str
    artist: str | None = None
    file_path: str
    mime_type: str = "audio/wav"

class SearchResponse(BaseModel):
    items: list[SongOut]
    query: str

class HistoryItemOut(BaseModel):
    id: int
    played_at: datetime | None = None
    song: SongOut

class StreamStartResponse(BaseModel):
    song: SongOut
    mime_type: str
    total_chunks: int


class AdminSongRow(BaseModel):
    id: int
    title: str
    artist: str | None = None
    file_path: str
    file_name: str
    file_size_bytes: int
    mime_type: str
    created_at: datetime | None = None


class SongUploadResponse(BaseModel):
    song: AdminSongRow


class AdminStatsSnapshot(BaseModel):
    songs_total: int
    history_total: int
    active_tcp_connections: int
    active_bridge_clients: int
    online_users: int
    active_downloads: int
    updated_at: datetime | None = None
