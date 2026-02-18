from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from threading import Lock
from typing import Any


class EventBus:
    def __init__(self, max_events: int = 3000) -> None:
        self._events: deque[dict[str, Any]] = deque(maxlen=max_events)
        self._lock = Lock()
        self._seq = 0

    def publish(self, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._seq += 1
            event = {
                "seq": self._seq,
                "type": event_type,
                "payload": payload,
                "published_at": datetime.now(timezone.utc).isoformat(),
            }
            self._events.append(event)
            return event

    def latest_seq(self) -> int:
        with self._lock:
            return self._seq

    def after(self, seq: int) -> list[dict[str, Any]]:
        with self._lock:
            return [event for event in self._events if event["seq"] > seq]


event_bus = EventBus()
