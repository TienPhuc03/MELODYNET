from __future__ import annotations

import math
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


def _write_demo_wav(path: Path, frequencies: list[int], sample_rate: int = 22_050, duration: float = 1.2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame_count = int(sample_rate * duration)
    amplitude = 14_000

    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)

        for frequency in frequencies:
            for frame_index in range(frame_count):
                position = frame_index / sample_rate
                sample = int(amplitude * math.sin(2.0 * math.pi * frequency * position))
                wav_file.writeframesraw(sample.to_bytes(2, byteorder="little", signed=True))


@dataclass(slots=True)
class DemoMediaLibrary:
    media_dir: Path

    @classmethod
    def default(cls) -> "DemoMediaLibrary":
        return cls(media_dir=Path(__file__).resolve().parents[2] / "media")

    def ensure_demo_files(self) -> list[dict[str, str]]:
        tracks = [
            {
                "title": "Moonlight Drift",
                "artist": "MelodyNet Ensemble",
                "file_name": "moonlight_drift.wav",
                "frequencies": [261, 329, 392, 523],
            },
            {
                "title": "City Pulse",
                "artist": "MelodyNet Ensemble",
                "file_name": "city_pulse.wav",
                "frequencies": [196, 247, 294, 392],
            },
            {
                "title": "Quiet Signal",
                "artist": "MelodyNet Ensemble",
                "file_name": "quiet_signal.wav",
                "frequencies": [220, 277, 330, 440],
            },
        ]

        prepared_tracks: list[dict[str, str]] = []
        for index, track in enumerate(tracks, start=1):
            file_path = self.media_dir / track["file_name"]
            if not file_path.exists():
                _write_demo_wav(file_path, track["frequencies"])
            prepared_tracks.append(
                {
                    "title": track["title"],
                    "artist": track["artist"],
                    "file_path": str(file_path),
                    "mime_type": "audio/wav",
                    "seed_order": str(index),
                }
            )
        return prepared_tracks

    @staticmethod
    def guess_mime_type(path: str) -> str:
        suffix = Path(path).suffix.lower()
        if suffix == ".wav":
            return "audio/wav"
        if suffix == ".mp3":
            return "audio/mpeg"
        if suffix == ".ogg":
            return "audio/ogg"
        return "application/octet-stream"

