"""Live careers hub — uses preferences + cached Indeed search when possible."""
import json

import app.config as config
from app.core.tools import search_indeed


def fetch_career_hub_jobs(target_roles: str, locations: str) -> list[dict]:
    """
    Pick the first role/location from preferences and search Indeed.
    Falls back to a broad search if prefs are empty.
    """
    role = (target_roles or "software engineer").split(",")[0].strip() or "software engineer"
    location = (locations or "Remote").split(",")[0].strip() or "Remote"

    raw = search_indeed.invoke({
        "position": role,
        "location": location,
        "country": "US",
        "max_items": config.JOBS_MAX_ITEMS,
    })

    if isinstance(raw, str):
        if raw.startswith("No Indeed") or raw.startswith("Indeed search failed"):
            return []
        try:
            jobs = json.loads(raw)
            if isinstance(jobs, list):
                return jobs
        except json.JSONDecodeError:
            return []
    return []
