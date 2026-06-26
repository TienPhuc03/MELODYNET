from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from server.core.media import DemoMediaLibrary
from server.core.security import PasswordHasher, TokenManager
from server.db.models import ListeningHistory, Song, User


class ServiceError(ValueError):
    """Domain-level validation error for API/websocket flows."""


@dataclass(slots=True)
class MelodyNetService:
    session_factory: Any
    token_manager: TokenManager
    media_library: DemoMediaLibrary

    def seed_demo_content(self) -> None:
        demo_tracks = self.media_library.ensure_demo_files()
        with self.session_factory() as db:
            existing_titles = {title for (title,) in db.query(Song.title).all()}
            for track in demo_tracks:
                if track["title"] in existing_titles:
                    continue
                song = Song(
                    title=track["title"],
                    artist=track["artist"],
                    file_path=track["file_path"],
                    mime_type=track["mime_type"],
                )
                db.add(song)
            db.commit()

    def register_user(self, username: str, password: str) -> tuple[User, str]:
        normalized_username = self._normalize_username(username)
        if len(password) < 6:
            raise ServiceError("Password must contain at least 6 characters.")

        with self.session_factory() as db:
            if self.get_user_by_username(db, normalized_username) is not None:
                raise ServiceError("Username already exists.")

            user = User(
                username=normalized_username,
                password_hash=PasswordHasher.hash_password(password),
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            token = self.token_manager.create_access_token(str(user.id), {"username": user.username})
            return user, token

    def authenticate_user(self, username: str, password: str) -> tuple[User, str]:
        normalized_username = self._normalize_username(username)
        with self.session_factory() as db:
            user = self.get_user_by_username(db, normalized_username)
            if user is None:
                raise ServiceError("Invalid username or password.")
            if not PasswordHasher.verify_password(password, user.password_hash):
                raise ServiceError("Invalid username or password.")
            token = self.token_manager.create_access_token(str(user.id), {"username": user.username})
            return user, token

    def get_current_user(self, token: str) -> User:
        payload = self.token_manager.decode_access_token(token)
        user_id = int(payload["sub"])
        with self.session_factory() as db:
            user = db.get(User, user_id)
            if user is None:
                raise ServiceError("User not found.")
            return user

    def bootstrap_admin_user(self) -> bool:
        configured_username = os.getenv("MELODYNET_ADMIN_USERNAME", "").strip()
        if not configured_username:
            return False

        with self.session_factory() as db:
            user = self.get_user_by_username(db, configured_username)
            if user is None:
                print(f"[WARN] Admin bootstrap skipped because user '{configured_username}' does not exist.")
                return False
            if user.is_admin:
                return True
            user.is_admin = True
            db.add(user)
            db.commit()
            return True

    def get_user_by_username(self, db: Session, username: str) -> User | None:
        return db.query(User).filter(func.lower(User.username) == username.lower()).one_or_none()

    def search_songs(self, query: str) -> list[Song]:
        normalized_query = query.strip().lower()
        with self.session_factory() as db:
            query_stmt = db.query(Song).order_by(Song.title.asc())
            if normalized_query:
                like_pattern = f"%{normalized_query}%"
                query_stmt = query_stmt.filter(
                    or_(
                        func.lower(Song.title).like(like_pattern),
                        func.lower(Song.artist).like(like_pattern),
                    )
                )
            return list(query_stmt.all())

    def list_admin_songs(self, query: str = "") -> list[dict[str, Any]]:
        songs = self.search_songs(query)
        return [self.admin_song_to_dict(song) for song in songs]

    def get_song(self, song_id: int) -> Song:
        with self.session_factory() as db:
            song = db.get(Song, song_id)
            if song is None:
                raise ServiceError("Song not found.")
            return song

    def get_recent_history(self, user_id: int, limit: int = 10) -> list[ListeningHistory]:
        with self.session_factory() as db:
            query_stmt = (
                db.query(ListeningHistory)
                .filter(ListeningHistory.user_id == user_id)
                .order_by(ListeningHistory.played_at.desc())
                .limit(limit)
            )
            return list(query_stmt.all())

    def record_history(self, user_id: int, song_id: int) -> None:
        with self.session_factory() as db:
            db.add(ListeningHistory(user_id=user_id, song_id=song_id))
            db.commit()

    def stream_song(self, song_id: int, chunk_size: int = 16_384) -> tuple[Song, bytes, int]:
        song = self.get_song(song_id)
        file_path = Path(song.file_path)
        if not file_path.exists():
            raise ServiceError("Audio file is missing on disk.")

        audio_bytes = file_path.read_bytes()
        total_chunks = max(1, (len(audio_bytes) + chunk_size - 1) // chunk_size)
        return song, audio_bytes, total_chunks

    def get_song_file(self, song_id: int) -> tuple[Song, Path, int]:
        song = self.get_song(song_id)
        file_path = Path(song.file_path)
        if not file_path.exists():
            raise ServiceError("Audio file is missing on disk.")
        return song, file_path, file_path.stat().st_size

    def create_song(self, title: str, artist: str | None, file_path: str, mime_type: str) -> Song:
        cleaned_title = title.strip()
        cleaned_artist = artist.strip() if artist else None
        if not cleaned_title:
            raise ServiceError("Song title is required.")

        with self.session_factory() as db:
            song = Song(
                title=cleaned_title,
                artist=cleaned_artist,
                file_path=file_path,
                mime_type=mime_type,
            )
            db.add(song)
            db.commit()
            db.refresh(song)
            return song

    def delete_song(self, song_id: int) -> dict[str, Any]:
        with self.session_factory() as db:
            song = db.get(Song, song_id)
            if song is None:
                raise ServiceError("Song not found.")
            payload = self.admin_song_to_dict(song)
            db.delete(song)
            db.commit()
            return payload

    def get_history_rows(self, user_id: int) -> list[dict[str, Any]]:
        with self.session_factory() as db:
            rows = (
                db.query(ListeningHistory, Song)
                .join(Song, ListeningHistory.song_id == Song.id)
                .filter(ListeningHistory.user_id == user_id)
                .order_by(ListeningHistory.played_at.desc())
                .all()
            )
            items: list[dict[str, Any]] = []
            for history_row, song in rows:
                items.append(
                    {
                        "id": history_row.id,
                        "played_at": history_row.played_at,
                        "song": self.song_to_dict(song),
                    }
                )
            return items

    def get_admin_stats(self, runtime_metrics: dict[str, int]) -> dict[str, Any]:
        with self.session_factory() as db:
            songs_total = db.query(func.count(Song.id)).scalar() or 0
            history_total = db.query(func.count(ListeningHistory.id)).scalar() or 0

        return {
            "songs_total": int(songs_total),
            "history_total": int(history_total),
            "active_tcp_connections": int(runtime_metrics.get("active_tcp_connections", 0)),
            "active_bridge_clients": int(runtime_metrics.get("active_bridge_clients", 0)),
            "online_users": int(runtime_metrics.get("online_users", 0)),
            "active_downloads": int(runtime_metrics.get("active_downloads", 0)),
        }

    @staticmethod
    def user_to_dict(user: User) -> dict[str, Any]:
        return {
            "id": user.id,
            "username": user.username,
            "created_at": user.created_at,
        }

    @staticmethod
    def song_to_dict(song: Song) -> dict[str, Any]:
        return {
            "id": song.id,
            "title": song.title,
            "artist": song.artist,
            "file_path": song.file_path,
            "mime_type": song.mime_type,
        }

    @staticmethod
    def admin_song_to_dict(song: Song) -> dict[str, Any]:
        file_path = Path(song.file_path)
        file_size_bytes = file_path.stat().st_size if file_path.exists() else 0
        return {
            "id": song.id,
            "title": song.title,
            "artist": song.artist,
            "file_path": song.file_path,
            "file_name": file_path.name,
            "file_size_bytes": file_size_bytes,
            "mime_type": song.mime_type,
            "created_at": song.created_at,
        }

    @staticmethod
    def _normalize_username(username: str) -> str:
        cleaned = username.strip()
        if not cleaned:
            raise ServiceError("Username is required.")
        return cleaned
