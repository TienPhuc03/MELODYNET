from __future__ import annotations

import asyncio
import base64
from dataclasses import dataclass, field

from server.tcp_server.handler import TcpCommandHandler
from server.tcp_server.protocol import (
    HEADER_SIZE,
    PacketType,
    build_json_packet,
    decode_json_payload,
    unpack_packet,
)


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
    clients: dict[int, ClientSession] = field(default_factory=dict)
    _server: asyncio.base_events.Server | None = field(default=None, init=False, repr=False)
    _next_client_id: int = field(default=1, init=False, repr=False)

    async def start(self) -> None:
        self._server = await asyncio.start_server(self.handle_client, self.host, self.port)
        async with self._server:
            await self._server.serve_forever()

    async def stop(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        client_id = self._register_client(writer)
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
            response = build_json_packet(PacketType.SEARCH, seq_no, {"query": query, "items": items})
            writer.write(response)
            await writer.drain()
            return

        if action == "play":
            song_id = int(command.get("song_id", 0))
            song_payload, audio_bytes, total_chunks = self.handler.handle_registered_play(None, song_id)
            writer.write(build_json_packet(PacketType.STREAM_START, seq_no, {"song": song_payload, "total_chunks": total_chunks}))
            await writer.drain()
            for chunk_seq_no, offset in enumerate(range(0, len(audio_bytes), self.chunk_size)):
                chunk = audio_bytes[offset : offset + self.chunk_size]
                packet = build_json_packet(
                    PacketType.STREAM_CHUNK,
                    chunk_seq_no,
                    {
                        "song_id": song_id,
                        "seq_no": chunk_seq_no,
                        "data": base64.b64encode(chunk).decode("ascii"),
                    },
                )
                writer.write(packet)
                await writer.drain()
            writer.write(build_json_packet(PacketType.STREAM_END, seq_no, {"song_id": song_id, "total_chunks": total_chunks}))
            await writer.drain()
            return

        if action == "ping":
            writer.write(build_json_packet(PacketType.PING, seq_no, {"ok": True}))
            await writer.drain()
            return

        await self._send_error(writer, f"Unknown action: {action}")

    async def _send_error(self, writer: asyncio.StreamWriter, message: str) -> None:
        writer.write(build_json_packet(PacketType.ERROR, 0, {"error": message}))
        await writer.drain()
