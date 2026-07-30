"""Live careers hub — preferences + plan-aware job fetch with scrape cache."""
from __future__ import annotations

import hashlib
import math
import time
from threading import Lock

import app.config as config
from app.core.jobs_providers import fetch_jobs
from app.core.tools import apify_client, batch_score_job_matches, tavily_client

_hub_cache: dict[str, tuple[float, list[dict]]] = {}
_hub_lock = Lock()

# user_id|job_key|fingerprint -> (expires_at, score)
_match_cache: dict[str, tuple[float, int]] = {}
_match_lock = Lock()

# Search up to this many comma-separated target roles (all plans).
_MULTI_ROLE_CAP = 5


def _cache_key(role: str, location: str, max_items: int) -> str:
    return f"{role.strip().lower()}|{location.strip().lower()}|{max_items}"


def _get_cached(key: str) -> list[dict] | None:
    with _hub_lock:
        entry = _hub_cache.get(key)
        if not entry:
            return None
        expires_at, jobs = entry
        if time.time() >= expires_at:
            del _hub_cache[key]
            return None
        return list(jobs)


def _set_cached(key: str, jobs: list[dict], ttl_seconds: int) -> None:
    ttl = max(60, int(ttl_seconds or 0))
    with _hub_lock:
        _hub_cache[key] = (time.time() + ttl, list(jobs))


def _parse_pref_list(text: str) -> list[str]:
    """Split comma/newline-separated prefs; preserve order, case-insensitive dedupe."""
    raw = (text or "").replace("\r\n", "\n").replace("\n", ",")
    seen: set[str] = set()
    out: list[str] = []
    for part in raw.split(","):
        item = part.strip()
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _primary_location(locations: str) -> str:
    locs = _parse_pref_list(locations)
    return locs[0] if locs else "Remote"


def _roles_to_search(target_roles: str, max_items: int | None = None) -> list[str]:
    """All plans: merge across the user's target_roles (capped). Plan caps trim results."""
    del max_items  # limit applied after merge; roles always from prefs
    roles = _parse_pref_list(target_roles) or ["software engineer"]
    return roles[:_MULTI_ROLE_CAP]


def _job_dedupe_key(job: dict) -> str:
    url = (job.get("url") or "").strip()
    if url:
        return url
    return f"{job.get('title') or ''}|{job.get('company') or ''}|{job.get('location') or ''}"


def _merge_role_batches(batches: list[list[dict]], limit: int) -> list[dict]:
    """Round-robin merge across roles, dedupe by URL, trim to limit."""
    combined: list[dict] = []
    seen: set[str] = set()
    idx = 0
    while len(combined) < limit:
        progressed = False
        for batch in batches:
            if idx >= len(batch):
                continue
            job = batch[idx]
            key = _job_dedupe_key(job)
            if key not in seen:
                seen.add(key)
                combined.append(job)
                if len(combined) >= limit:
                    return combined
            progressed = True
        if not progressed:
            break
        idx += 1
    return combined[:limit]


def _fetch_role_batch(
    role: str,
    location: str,
    per_role: int,
    *,
    ttl: int,
    force: bool,
) -> tuple[list[dict], bool]:
    """Fetch (or cache-hit) jobs for one role. Returns (jobs, from_cache)."""
    key = _cache_key(role, location, per_role)
    if not force:
        cached = _get_cached(key)
        if cached is not None:
            return cached[:per_role], True

    jobs, _provider = fetch_jobs(
        role,
        location,
        "US",
        per_role,
        tavily_client=tavily_client,
        apify_client=apify_client,
    )
    jobs = (jobs or [])[:per_role]
    _set_cached(key, jobs, ttl)
    return jobs, False


def peek_career_hub_jobs(
    target_roles: str,
    locations: str,
    *,
    max_items: int | None = None,
) -> list[dict] | None:
    """Return cached hub jobs only (no provider calls)."""
    limit = max(1, int(max_items if max_items is not None else config.JOBS_MAX_ITEMS))
    roles = _roles_to_search(target_roles)
    location = _primary_location(locations)

    if len(roles) == 1:
        cached = _get_cached(_cache_key(roles[0], location, limit))
        if cached is None:
            return None
        return cached[:limit]

    composite = _get_cached(_cache_key("|".join(roles), location, limit))
    if composite is not None:
        return composite[:limit]

    # Compose from per-role caches when the combined entry is missing.
    n = len(roles)
    per_role = max(1, min(limit, math.ceil(limit * 1.15 / n)))
    batches: list[list[dict]] = []
    for role in roles:
        cached = _get_cached(_cache_key(role, location, per_role))
        if cached is None:
            return None
        batches.append(cached[:per_role])
    return _merge_role_batches(batches, limit)


def fetch_career_hub_jobs(
    target_roles: str,
    locations: str,
    *,
    max_items: int | None = None,
    cache_ttl_seconds: int | None = None,
    force: bool = False,
) -> tuple[list[dict], bool]:
    """
    Search job providers across the user's target_roles, merge/dedupe, trim to plan cap.
    Free 5 · Expert 120 · Pro 200 (via max_items).
    Returns (jobs, from_cache).
    """
    limit = max(1, int(max_items if max_items is not None else config.JOBS_MAX_ITEMS))
    ttl = int(
        cache_ttl_seconds
        if cache_ttl_seconds is not None
        else config.JOBS_CACHE_TTL_SECONDS
    )
    roles = _roles_to_search(target_roles)
    location = _primary_location(locations)

    if len(roles) == 1:
        jobs, from_cache = _fetch_role_batch(
            roles[0], location, limit, ttl=ttl, force=force
        )
        return jobs[:limit], from_cache

    composite_key = _cache_key("|".join(roles), location, limit)
    if not force:
        cached = _get_cached(composite_key)
        if cached is not None:
            return cached[:limit], True

    n = len(roles)
    # Slight over-request per role so URL overlaps don't leave the list thin.
    per_role = max(1, min(limit, math.ceil(limit * 1.15 / n)))
    batches: list[list[dict]] = []
    all_from_cache = True
    for role in roles:
        batch, from_cache = _fetch_role_batch(
            role, location, per_role, ttl=ttl, force=force
        )
        if not from_cache:
            all_from_cache = False
        batches.append(batch)

    combined = _merge_role_batches(batches, limit)
    _set_cached(composite_key, combined, ttl)
    return combined, all_from_cache


def _job_match_key(job: dict) -> str:
    url = (job.get("url") or "").strip()
    if url:
        return url
    return f"{job.get('title') or ''}|{job.get('company') or ''}|{job.get('location') or ''}"


def _prefs_fingerprint(resume_text: str, prefs: dict) -> str:
    blob = "|".join(
        [
            (resume_text or "").strip(),
            (prefs.get("target_roles") or "").strip(),
            (prefs.get("locations") or "").strip(),
            (prefs.get("goals") or "").strip(),
        ]
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def _match_cache_get(cache_key: str) -> int | None:
    with _match_lock:
        entry = _match_cache.get(cache_key)
        if not entry:
            return None
        expires_at, score = entry
        if time.time() >= expires_at:
            del _match_cache[cache_key]
            return None
        return int(score)


def _match_cache_set(cache_key: str, score: int, ttl_seconds: int) -> None:
    ttl = max(60, int(ttl_seconds or 0))
    with _match_lock:
        _match_cache[cache_key] = (time.time() + ttl, int(score))


def sort_jobs_by_match_score(jobs: list[dict]) -> list[dict]:
    """Highest match_score first; null/missing scores last (stable otherwise)."""

    def sort_key(job: dict) -> tuple[int, float]:
        score = job.get("match_score")
        if score is None:
            return (1, 0.0)
        try:
            return (0, -float(score))
        except (TypeError, ValueError):
            return (1, 0.0)

    return sorted(jobs, key=sort_key)


def enrich_jobs_with_match_scores(
    jobs: list[dict],
    *,
    user_id: str,
    resume_text: str,
    prefs: dict,
    cache_ttl_seconds: int | None = None,
) -> list[dict]:
    """
    Attach match_score (0–100) using AI when a resume exists.
    Scores are cached per user + job + resume/prefs fingerprint.
    Without a resume, match_score is null and match_needs_resume is true.
    """
    resume = (resume_text or "").strip()
    prefs = prefs or {}
    ttl = int(
        cache_ttl_seconds
        if cache_ttl_seconds is not None
        else config.JOBS_MATCH_CACHE_TTL_SECONDS
    )
    uid = str(user_id or "")

    if not resume:
        return [
            {**job, "match_score": None, "match_needs_resume": True}
            for job in jobs
        ]

    fp = _prefs_fingerprint(resume, prefs)
    resolved: dict[str, int] = {}
    to_score: list[dict] = []

    for job in jobs:
        jkey = _job_match_key(job)
        if jkey in resolved:
            continue
        cached = _match_cache_get(f"{uid}|{jkey}|{fp}")
        if cached is not None:
            resolved[jkey] = cached
        else:
            to_score.append(job)

    if to_score:
        # Large hub lists (Expert/Pro) — only AI-score a prefix to control cost
        score_cap = max(1, int(getattr(config, "JOBS_MATCH_SCORE_MAX", 25)))
        scoring = to_score[:score_cap]
        scores = batch_score_job_matches(scoring, resume, prefs)
        for job in scoring:
            jkey = _job_match_key(job)
            score = scores.get(jkey)
            if score is None:
                continue
            resolved[jkey] = score
            _match_cache_set(f"{uid}|{jkey}|{fp}", score, ttl)

    return [
        {
            **job,
            "match_score": resolved.get(_job_match_key(job)),
            "match_needs_resume": False,
        }
        for job in jobs
    ]
