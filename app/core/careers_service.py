"""Live careers hub — uses preferences + cached Indeed search when possible."""
import app.config as config
from app.core.jobs_providers import fetch_jobs
from app.core.tools import apify_client, tavily_client


def fetch_career_hub_jobs(target_roles: str, locations: str) -> list[dict]:
    """
    Pick the first role/location from preferences and search job providers.
    Falls back to a broad search if prefs are empty.
    """
    role = (target_roles or "software engineer").split(",")[0].strip() or "software engineer"
    location = (locations or "Remote").split(",")[0].strip() or "Remote"

    jobs, _provider = fetch_jobs(
        role,
        location,
        "US",
        config.JOBS_MAX_ITEMS,
        tavily_client=tavily_client,
        apify_client=apify_client,
    )
    return jobs or []
