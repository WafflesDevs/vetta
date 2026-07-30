"""Quiz cycle rate limits (rolling hour window)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from threading import Lock

import app.config as config

_LOCK = Lock()
_STORE = Path(__file__).resolve().parent.parent.parent / ".data" / "quiz_cycles.json"
# user_id -> {"timestamps": [unix, ...]}  (legacy: {"count": int, "at": unix})
_mem: dict[str, dict] = {}


def _load() -> None:
    global _mem
    if not _STORE.exists():
        return
    try:
        raw = json.loads(_STORE.read_text())
        if isinstance(raw, dict):
            _mem = {str(k): v for k, v in raw.items() if isinstance(v, dict)}
    except Exception:
        _mem = {}


def _save() -> None:
    try:
        _STORE.parent.mkdir(parents=True, exist_ok=True)
        _STORE.write_text(json.dumps(_mem))
    except Exception:
        pass


_load()


def _window() -> int:
    return max(60, int(config.QUIZ_CYCLE_WINDOW_SECONDS))


def _max_per_window() -> int:
    return max(1, int(config.QUIZ_MAX_CYCLES_PER_HOUR))


def _prune_timestamps(ts: list[float], *, now: float | None = None) -> list[float]:
    now = time.time() if now is None else now
    cutoff = now - _window()
    return [float(t) for t in ts if float(t) >= cutoff]


def _timestamps_for(user_id: str) -> list[float]:
    row = _mem.get(str(user_id)) or {}
    raw = row.get("timestamps")
    if isinstance(raw, list):
        return _prune_timestamps(raw)
    # Migrate legacy {count, at} → one timestamp if still in window
    at = float(row.get("at") or 0)
    if at > 0 and at >= time.time() - _window():
        return [at]
    return []


def quiz_cycles_used(user_id: str) -> int:
    with _LOCK:
        return len(_timestamps_for(user_id))


def quiz_seconds_until_reset(user_id: str) -> int:
    with _LOCK:
        ts = _timestamps_for(user_id)
        if len(ts) < _max_per_window():
            return 0
        oldest = min(ts)
        left = int(oldest + _window() - time.time())
        return max(0, left)


def record_quiz_cycle(user_id: str) -> int:
    with _LOCK:
        uid = str(user_id)
        now = time.time()
        ts = _prune_timestamps(_timestamps_for(uid), now=now)
        ts.append(now)
        _mem[uid] = {"timestamps": ts, "at": now, "count": len(ts)}
        _save()
        return len(ts)


def quiz_max_cycles(plan: str | None = None) -> int:
    """Max quiz cycles in the rolling hour window."""
    return _max_per_window()


def can_start_quiz(plan: str, user_id: str, *, is_new_round: bool) -> tuple[bool, str]:
    max_cycles = quiz_max_cycles(plan)
    used = quiz_cycles_used(user_id)
    if used >= max_cycles:
        wait = quiz_seconds_until_reset(user_id)
        mins = max(1, (wait + 59) // 60) if wait else 60
        return (
            False,
            f"Quiz limited to {max_cycles} cycles per hour. Try again in ~{mins} min.",
        )
    return True, ""
