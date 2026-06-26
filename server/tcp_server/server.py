from __future__ import annotations

import asyncio
import base64
import inspect
from dataclasses import dataclass, field
from pathlib import Path
from typing import Awaitable, Callable

from server.tcp_server.handler import TcpCommandHandler
from server.tcp_server.protocol import HEADER_SIZE, PacketType, build_json_packet, decode_json_payload, unpack_packet


@dataclass(slots=True)
class ClientSession:
    client_id: int
    peername: str


@dataclass(slots=True)
class TcpCoreServer:
    handler: TcpCommandHandler
    host: str = "127.0.0.1"
    port: int = 8888
    chunk_size: int = 16_384
    on_metrics_changed: Callable[[], Awaitable[None] | None] | None = None
    clients: dict[int, ClientSession] = field(default_factory=dict)
    download_progress: dict[int, int] = field(default_factory=dict)
    _server: asyncio.base_events.Server | None = field(default=None, init=False, repr=False)
    _next_client_id: int = field(default=1, init=False, repr=False)
    _next_download_id: int = field(default=1, init=False, repr=False)

    async def start(self) -> None:
        self._server = await asyncio.start_server(self.handle_client, self.host, self.port)
        print("MELODYNET TCP core server is running.")
        print(f"Listening on {self.host}:{self.port}")
        async with self._server:
            await self._server.serve_forever()

    async def stop(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        client_id = self._register_client(writer)
        await self._emit_metrics_changed()
        try:
            while True:
                header_bytes = await reader.readexactly(HEADER_SIZE)
                header = unpack_packet(header_bytes)
                payload = await reader.readexactly(header.payload_len)
                command = decode_json_payload(payload)
                await self._handle_command(command, writer)
        except asyncio.IncompleteReadError:
            return
        except Exception as exc:
            await self._send_error(writer, str(exc))
        finally:
            self.clients.pop(client_id, None)
            writer.close()
            await writer.wait_closed()
            await self._emit_metrics_changed()

    def _register_client(self, writer: asyncio.StreamWriter) -> int:
        peer = writer.get_extra_info("peername")
        peername = f"{peer[0]}:{peer[1]}" if peer else "unknown"
        client_id = self._next_client_id
        self._next_client_id += 1
        self.clients[client_id] = ClientSession(client_id=client_id, peername=peername)
        return client_id

    async def _handle_command(self, command: dict, writer: asyncio.StreamWriter) -> None:
        action = str(command.get("action", "")).lower()
        seq_no = int(command.get("request_id", 0))

        if action == "search":
            query = str(command.get("query", ""))
            items = self.handler.handle_search(query)
            writer.write(build_json_packet(PacketType.SEARCH, seq_no, {"query": query, "items": items}))
            await writer.drain()
            return

        if action == "play":
            song_id = int(command.get("song_id", 0))
            song_payload, audio_bytes, total_chunks = self.handler.handle_registered_play(None, song_id)
            writer.write(build_json_packet(PacketType.STREAM_START, seq_no, {"song": song_payload, "total_chunks": total_chunks}))
            await writer.drain()
            for chunk_seq_no, offset in enumerate(range(0, len(audio_bytes), self.chunk_size)):
                chunk = audio_bytes[offset : offset + self.chunk_size]
                writer.write(
                    build_json_packet(
                        PacketType.STREAM_CHUNK,
                        chunk_seq_no,
                        {
                            "song_id": song_id,
                            "seq_no": chunk_seq_no,
                            "data": base64.b64encode(chunk).decode("ascii"),
                        },
                    )
                )
                await writer.drain()
            writer.write(build_json_packet(PacketType.STREAM_END, seq_no, {"song_id": song_id, "total_chunks": total_chunks}))
            await writer.drain()
            return

        if action == "download":
            await self._handle_download(seq_no, int(command.get("song_id", 0)), writer)
            return

        if action == "ping":
            writer.write(build_json_packet(PacketType.PING, seq_no, {"ok": True}))
            await writer.drain()
            return

        await self._send_error(writer, f"Unknown action: {action}")

    async def _handle_download(self, seq_no: int, song_id: int, writer: asyncio.StreamWriter) -> None:
        song_payload, file_path, total_bytes = self.handler.prepare_download(song_id)
        writer.write(
            build_json_packet(
                PacketType.DOWNLOAD_START,
                seq_no,
                {
                    "song": song_payload,
                    "song_id": song_id,
                    "file_name": Path(file_path).name,
                    "mime_type": song_payload.get("mime_type", "application/octet-stream"),
                    "total_bytes": total_bytes,
                },
            )
        )
        await writer.drain()

        download_id = self._next_download_id
        self._next_download_id += 1
        self.download_progress[download_id] = 0
        await self._emit_metrics_changed()

        try:
            bytes_sent = 0
            chunk_seq_no = 0
            with Path(file_path).open("rb") as audio_file:
                while True:
                    chunk = audio_file.read(self.chunk_size)
                    if not chunk:
                        break
                    bytes_sent += len(chunk)
                    self.download_progress[download_id] = bytes_sent
                    writer.write(
                        build_json_packet(
                            PacketType.DOWNLOAD_CHUNK,
                            chunk_seq_no,
                            {
                                "song_id": song_id,
                                "seq_no": chunk_seq_no,
                                "data": base64.b64encode(chunk).decode("ascii"),
                                "bytes_sent": bytes_sent,
                                "total_bytes": total_bytes,
                            },
                        )
                    )
                    await writer.drain()
                    chunk_seq_no += 1
        finally:
            self.download_progress.pop(download_id, None)
            await self._emit_metrics_changed()

        writer.write(build_json_packet(PacketType.DOWNLOAD_END, seq_no, {"song_id": song_id, "total_bytes": total_bytes}))
        await writer.drain()

    async def _send_error(self, writer: asyncio.StreamWriter, message: str) -> None:
        writer.write(build_json_packet(PacketType.ERROR, 0, {"error": message}))
        await writer.drain()

    def get_metrics(self) -> dict[str, int]:
        return {
            "active_tcp_connections": len(self.clients),
            "active_downloads": len(self.download_progress),
            "bytes_in_flight": sum(self.download_progress.values()),
        }

    async def _emit_metrics_changed(self) -> None:
        if self.on_metrics_changed is None:
            return
        result = self.on_metrics_changed()
        if inspect.isawaitable(result):
            await result
