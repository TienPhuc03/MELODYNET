from __future__ import annotations

import asyncio
import base64
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from server.api.auth import router as auth_router
from server.api.history import router as history_router
from server.api.songs import router as songs_router
from server.core.media import DemoMediaLibrary
from server.core.security import TokenManager
from server.core.service import MelodyNetService, ServiceError
from server.db.database import Base, SessionLocal, engine
from server.db.models import ListeningHistory, Song, User  # noqa: F401
from server.tcp_server.handler import TcpCommandHandler
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
    service = _build_service()
    service.seed_demo_content()

    tcp_handler = TcpCommandHandler(service=service)
    tcp_server = TcpCoreServer(handler=tcp_handler)

    app.state.service = service
    app.state.tcp_server = tcp_server
    app.state.tcp_task = asyncio.create_task(tcp_server.start())

    try:
        yield
    finally:
        task = getattr(app.state, 'tcp_task', None)
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
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth_router)
app.include_router(songs_router)
app.include_router(history_router)


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.websocket('/ws/bridge')
async def websocket_bridge(websocket: WebSocket) -> None:
    await websocket.accept()
    service: MelodyNetService = websocket.app.state.service
    token = websocket.query_params.get('token')
    current_user = None

    if token:
        try:
            current_user = service.get_current_user(token)
        except ServiceError:
            current_user = None

    try:
        while True:
            message = await websocket.receive_json()
            action = str(message.get('action', '')).lower()
            request_id = int(message.get('request_id', 0))

            if action == 'search':
                items = [service.song_to_dict(song) for song in service.search_songs(str(message.get('query', '')))]
                await websocket.send_json({'request_id': request_id, 'type': 'search_result', 'items': items})
                continue

            if action == 'play':
                song_id = int(message.get('song_id', 0))
                song, audio_bytes, total_chunks = service.stream_song(song_id)
                if current_user is not None:
                    service.record_history(current_user.id, song_id)

                await websocket.send_json(
                    {
                        'request_id': request_id,
                        'type': 'stream_begin',
                        'song': service.song_to_dict(song),
                        'total_chunks': total_chunks,
                        'mime_type': song.mime_type,
                    }
                )

                chunk_size = 16_384
                seq_no = 0
                for offset in range(0, len(audio_bytes), chunk_size):
                    chunk = audio_bytes[offset : offset + chunk_size]
                    await websocket.send_json(
                        {
                            'request_id': request_id,
                            'type': 'stream_chunk',
                            'song_id': song_id,
                            'seq_no': seq_no,
                            'data': base64.b64encode(chunk).decode('ascii'),
                        }
                    )
                    seq_no += 1

                await websocket.send_json(
                    {
                        'request_id': request_id,
                        'type': 'stream_end',
                        'song_id': song_id,
                        'total_chunks': total_chunks,
                    }
                )
                continue

            if action == 'ping':
                await websocket.send_json({'request_id': request_id, 'type': 'pong'})
                continue

            await websocket.send_json(
                {
                    'request_id': request_id,
                    'type': 'error',
                    'message': f'Unknown action: {action}',
                }
            )
    except WebSocketDisconnect:
        return


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('server.api.main:app', host='0.0.0.0', port=8000, reload=False)
