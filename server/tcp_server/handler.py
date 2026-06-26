from __future__ import annotations

import base64
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from server.core.service import MelodyNetService
from server.db.models import User


@dataclass(slots=True)
class TcpCommandHandler:
    service: MelodyNetService

    def build_user_payload(self, user: User) -> dict[str, Any]:
        return self.service.user_to_dict(user)

    def build_song_payload(self, song) -> dict[str, Any]:
        return self.service.song_to_dict(song)

    def handle_search(self, query: str) -> list[dict[str, Any]]:
        songs = self.service.search_songs(query)
        return [self.build_song_payload(song) for song in songs]

    def prepare_stream(self, song_id: int) -> tuple[dict[str, Any], bytes, int]:
        song, audio_bytes, total_chunks = self.service.stream_song(song_id)
        return self.build_song_payload(song), audio_bytes, total_chunks

    def stream_payloads(self, song_id: int, chunk_size: int = 16_384):
        song, audio_bytes, total_chunks = self.service.stream_song(song_id, chunk_size=chunk_size)
        song_payload = self.build_song_payload(song)
        for seq_no, offset in enumerate(range(0, len(audio_bytes), chunk_size)):
            chunk = audio_bytes[offset : offset + chunk_size]
            yield {
                "song": song_payload,
                "seq_no": seq_no,
                "chunk": base64.b64encode(chunk).decode("ascii"),
                "total_chunks": total_chunks,
            }

    def handle_auth_error(self, message: str) -> dict[str, Any]:
        return {"error": message}

    def handle_registered_play(self, user: User | None, song_id: int) -> tuple[dict[str, Any], bytes, int]:
        song_payload, audio_bytes, total_chunks = self.prepare_stream(song_id)
        if user is not None:
            self.service.record_history(user.id, song_id)
        return song_payload, audio_bytes, total_chunks

    def prepare_download(self, song_id: int) -> tuple[dict[str, Any], Path, int]:
        song, file_path, total_bytes = self.service.get_song_file(song_id)
        return self.build_song_payload(song), file_path, total_bytes
