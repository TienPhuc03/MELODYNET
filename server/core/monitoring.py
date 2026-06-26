from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from server.core.service import MelodyNetService


@dataclass(slots=True)
class RuntimeMonitor:
    service: MelodyNetService
    tcp_server: Any | None = None
    bridge_connections: dict[int, int | None] = field(default_factory=dict)
    admin_connections: dict[int, int] = field(default_factory=dict)
    admin_subscribers: dict[int, asyncio.Queue] = field(default_factory=dict)
    _next_connection_id: int = 1

    def set_tcp_server(self, tcp_server: Any) -> None:
        self.tcp_server = tcp_server

    def register_bridge_client(self, user_id: int | None) -> int:
        connection_id = self._next_connection_id
        self._next_connection_id += 1
        self.bridge_connections[connection_id] = user_id
        self.schedule_stats_update()
        return connection_id

    def unregister_bridge_client(self, connection_id: int) -> None:
        self.bridge_connections.pop(connection_id, None)
        self.schedule_stats_update()

    def register_admin_client(self, user_id: int) -> tuple[int, asyncio.Queue]:
        connection_id = self._next_connection_id
        self._next_connection_id += 1
        queue: asyncio.Queue = asyncio.Queue()
        self.admin_connections[connection_id] = user_id
        self.admin_subscribers[connection_id] = queue
        self.schedule_stats_update()
        return connection_id, queue

    def unregister_admin_client(self, connection_id: int) -> None:
        self.admin_connections.pop(connection_id, None)
        self.admin_subscribers.pop(connection_id, None)
        self.schedule_stats_update()

    def get_runtime_metrics(self) -> dict[str, int]:
        tcp_metrics = {
            "active_tcp_connections": 0,
            "active_downloads": 0,
            "bytes_in_flight": 0,
        }
        if self.tcp_server is not None:
            tcp_metrics = self.tcp_server.get_metrics()

        online_users = {
            user_id
            for user_id in [*self.bridge_connections.values(), *self.admin_connections.values()]
            if user_id is not None
        }
        return {
            **tcp_metrics,
            "active_bridge_clients": len(self.bridge_connections),
            "online_users": len(online_users),
        }

    def build_stats_payload(self) -> dict[str, Any]:
        snapshot = self.service.get_admin_stats(self.get_runtime_metrics())
        snapshot["updated_at"] = datetime.now(timezone.utc).isoformat()
        return snapshot

    async def notify_stats_update(self) -> None:
        if not self.admin_subscribers:
            return
        payload = self.build_stats_payload()
        event = {"type": "stats_update", **payload}
        for queue in list(self.admin_subscribers.values()):
            await queue.put(event)

    async def send_snapshot(self, queue: asyncio.Queue) -> None:
        await queue.put({"type": "stats_snapshot", **self.build_stats_payload()})

    def schedule_stats_update(self) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self.notify_stats_update())
