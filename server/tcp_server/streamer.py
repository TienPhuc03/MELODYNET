from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


@dataclass(slots=True)
class AudioChunkStreamer:
    chunk_size: int = 16_384

    def iter_chunks(self, file_path: str | Path) -> Iterator[tuple[int, bytes]]:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(path)

        seq_no = 0
        with path.open("rb") as audio_file:
            while True:
                chunk = audio_file.read(self.chunk_size)
                if not chunk:
                    break
                yield seq_no, chunk
                seq_no += 1

    def count_chunks(self, file_path: str | Path) -> int:
        size = Path(file_path).stat().st_size
        return max(1, (size + self.chunk_size - 1) // self.chunk_size)

