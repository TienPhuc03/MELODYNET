from __future__ import annotations

import asyncio
import base64
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from server.api.admin import router as admin_router
from server.api.auth import router as auth_router
from server.api.history import router as history_router
from server.api.songs import router as songs_router
from server.core.media import DemoMediaLibrary
from server.core.monitoring import RuntimeMonitor
from server.core.security import TokenManager
from server.core.service import MelodyNetService, ServiceError
from server.db.database import Base, SessionLocal, engine
from server.db.models import ListeningHistory, Song, User  # noqa: F401
from server.tcp_server.handler import TcpCommandHandler
from server.tcp_server.protocol import HEADER_SIZE, PacketType, build_json_packet, decode_json_payload, unpack_packet
from server.tcp_server.server import TcpCoreServer


def _build_service() -> MelodyNetService:
    return MelodyNetService(
        session_factory=SessionLocal,
        token_manager=TokenManager.from_env(),
        media_library=DemoMediaLibrary.default(),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_history_user_played_at ON history (user_id, played_at DESC)"))

    service = _build_service()
    service.seed_demo_content()
    service.bootstrap_admin_user()

    monitor = RuntimeMonitor(service=service)
    tcp_handler = TcpCommandHandler(service=service)
    tcp_server = TcpCoreServer(handler=tcp_handler, on_metrics_changed=monitor.notify_stats_update)
    monitor.set_tcp_server(tcp_server)

    app.state.service = service
    app.state.monitor = monitor
    app.state.tcp_server = tcp_server
    app.state.tcp_task = asyncio.create_task(tcp_server.start())

    try:
        yield
    finally:
        task = getattr(app.state, "tcp_task", None)
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        await tcp_server.stop()


app = FastAPI(title="MELODYNET API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(songs_router)
app.include_router(history_router)
app.include_router(admin_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/bridge")
async def websocket_bridge(websocket: WebSocket) -> None:
    await websocket.accept()
    service: MelodyNetService = websocket.app.state.service
    monitor: RuntimeMonitor = websocket.app.state.monitor
    tcp_server: TcpCoreServer = websocket.app.state.tcp_server
    token = websocket.query_params.get("token")
    current_user = None

    if token:
        try:
            current_user = service.get_current_user(token)
        except ServiceError:
            current_user = None

    connection_id = monitor.register_bridge_client(current_user.id if current_user is not None else None)

    try:
        while True:
            message = await websocket.receive_json()
            action = str(message.get("action", "")).lower()
            request_id = int(message.get("request_id", 0))

            if action == "search":
                items = [service.song_to_dict(song) for song in service.search_songs(str(message.get("query", "")))]
                await websocket.send_json({"request_id": request_id, "type": "search_result", "items": items})
                continue

            if action == "play":
                song_id = int(message.get("song_id", 0))
                song, audio_bytes, total_chunks = service.stream_song(song_id)
                if current_user is not None:
                    service.record_history(current_user.id, song_id)
                    await monitor.notify_stats_update()

                await websocket.send_json(
                    {
                        "request_id": request_id,
                        "type": "stream_begin",
                        "song": service.song_to_dict(song),
                        "total_chunks": total_chunks,
                        "mime_type": song.mime_type,
                    }
                )

                chunk_size = 16_384
                seq_no = 0
                for offset in range(0, len(audio_bytes), chunk_size):
                    chunk = audio_bytes[offset : offset + chunk_size]
                    await websocket.send_json(
                        {
                            "request_id": request_id,
                            "type": "stream_chunk",
                            "song_id": song_id,
                            "seq_no": seq_no,
                            "data": base64.b64encode(chunk).decode("ascii"),
                        }
                    )
                    seq_no += 1

                await websocket.send_json(
                    {
                        "request_id": request_id,
                        "type": "stream_end",
                        "song_id": song_id,
                        "total_chunks": total_chunks,
                    }
                )
                continue

            if action == "download":
                song_id = int(message.get("song_id", 0))
                await _relay_download_via_tcp(websocket, tcp_server, request_id, song_id)
                continue

            if action == "ping":
                await websocket.send_json({"request_id": request_id, "type": "pong"})
                continue

            await websocket.send_json(
                {
                    "request_id": request_id,
                    "type": "error",
                    "message": f"Unknown action: {action}",
                }
            )
    except WebSocketDisconnect:
        return
    finally:
        monitor.unregister_bridge_client(connection_id)


@app.websocket("/ws/admin")
async def admin_stats_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    service: MelodyNetService = websocket.app.state.service
    monitor: RuntimeMonitor = websocket.app.state.monitor
    token = websocket.query_params.get("token")

    try:
        current_user = service.get_current_user(token or "")
    except ServiceError:
        await websocket.send_json({"type": "error", "message": "Missing or invalid admin token."})
        await websocket.close(code=4401)
        return

    if not current_user.is_admin:
        await websocket.send_json({"type": "error", "message": "Admin access required."})
        await websocket.close(code=4403)
        return

    connection_id, queue = monitor.register_admin_client(current_user.id)
    sender = asyncio.create_task(_admin_sender(websocket, queue))
    await monitor.send_snapshot(queue)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        return
    finally:
        sender.cancel()
        try:
            await sender
        except asyncio.CancelledError:
            pass
        monitor.unregister_admin_client(connection_id)


async def _admin_sender(websocket: WebSocket, queue: asyncio.Queue) -> None:
    while True:
        payload = await queue.get()
        await websocket.send_json(payload)


async def _relay_download_via_tcp(
    websocket: WebSocket,
    tcp_server: TcpCoreServer,
    request_id: int,
    song_id: int,
) -> None:
    reader, writer = await asyncio.open_connection(tcp_server.host, tcp_server.port)
    try:
        writer.write(
            build_json_packet(
                PacketType.COMMAND,
                request_id,
                {
                    "action": "download",
                    "request_id": request_id,
                    "song_id": song_id,
                },
            )
        )
        await writer.drain()

        while True:
            header_bytes = await reader.readexactly(HEADER_SIZE)
            header = unpack_packet(header_bytes)
            payload = decode_json_payload(await reader.readexactly(header.payload_len))
            packet_type = PacketType(header.msg_type)
            await websocket.send_json(_tcp_packet_to_bridge_message(packet_type, request_id, payload))
            if packet_type in {PacketType.DOWNLOAD_END, PacketType.ERROR}:
                return
    finally:
        writer.close()
        await writer.wait_closed()


def _tcp_packet_to_bridge_message(packet_type: PacketType, request_id: int, payload: dict) -> dict:
    if packet_type == PacketType.DOWNLOAD_START:
        return {"request_id": request_id, "type": "download_begin", **payload}
    if packet_type == PacketType.DOWNLOAD_CHUNK:
        return {"request_id": request_id, "type": "download_chunk", **payload}
    if packet_type == PacketType.DOWNLOAD_END:
        return {"request_id": request_id, "type": "download_end", **payload}
    if packet_type == PacketType.ERROR:
        return {"request_id": request_id, "type": "error", "message": payload.get("error", "Unexpected TCP error.")}
    return {"request_id": request_id, "type": "error", "message": "Unexpected TCP packet."}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server.api.main:app", host="0.0.0.0", port=8000, reload=False)
