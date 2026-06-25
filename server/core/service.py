from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from server.core.media import DemoMediaLibrary
from server.core.security import PasswordHasher, SecurityError, TokenManager
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
    def _normalize_username(username: str) -> str:
        cleaned = username.strip()
        if not cleaned:
            raise ServiceError("Username is required.")
        return cleaned
