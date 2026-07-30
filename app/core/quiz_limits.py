"""Free-tier quiz cycle tracking (one round, then upgrade)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from threading import Lock

import app.config as config

_LOCK = Lock()
_STORE = Path(__file__).resolve().parent.parent.parent / ".data" / "quiz_cycles.json"
# user_id -> {"count": int, "at": unix}
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


def quiz_cycles_used(user_id: str) -> int:
    with _LOCK:
        row = _mem.get(str(user_id)) or {}
        return int(row.get("count") or 0)


def record_quiz_cycle(user_id: str) -> int:
    with _LOCK:
        uid = str(user_id)
        row = _mem.get(uid) or {"count": 0, "at": 0}
        row["count"] = int(row.get("count") or 0) + 1
        row["at"] = time.time()
        _mem[uid] = row
        _save()
        return int(row["count"])


def quiz_max_cycles(plan: str) -> int | None:
    """None = unlimited."""
    if plan == "free":
        return max(1, int(config.QUIZ_MAX_CYCLES_FREE))
    return None


def can_start_quiz(plan: str, user_id: str, *, is_new_round: bool) -> tuple[bool, str]:
    max_cycles = quiz_max_cycles(plan)
    if max_cycles is None:
        return True, ""
    used = quiz_cycles_used(user_id)
    if used >= max_cycles:
        return (
            False,
            f"Free tier allows {max_cycles} quiz cycle. Upgrade to CareerExpert for more rounds.",
        )
    if is_new_round and used >= max_cycles:
        return (
            False,
            f"Free tier allows {max_cycles} quiz cycle. Upgrade to CareerExpert for more rounds.",
        )
    return True, ""
