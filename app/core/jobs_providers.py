"""Job listing providers: Adzuna → JSearch → Tavily (Apify optional)."""
from __future__ import annotations

import json
import os
from typing import Any

import httpx


def _clip(text: str, n: int) -> str:
    text = (text or "").strip()
    if len(text) <= n:
        return text
    return text[:n] + "\n..."


def _normalize_country(country: str) -> str:
    c = (country or "US").strip().lower()
    aliases = {
        "uk": "gb",
        "united kingdom": "gb",
        "usa": "us",
        "united states": "us",
    }
    return aliases.get(c, c[:2] if len(c) > 2 else c) or "us"


def _job(
    *,
    title: str,
    company: str,
    location: str,
    url: str,
    description: str = "",
    salary: str = "",
    job_type: str = "",
    posted_at: str = "",
    source: str = "",
) -> dict[str, str]:
    title = (title or "").strip()
    company = (company or "").strip()
    location = (location or "").strip()
    url = (url or "").strip()
    if not url:
        slug = f"{title}|{company}|{location}".strip("|")
        url = f"job://{slug}" if slug else "job://unknown"
    return {
        "title": title,
        "company": company,
        "location": location,
        "salary": salary or "",
        "job_type": job_type or "",
        "posted_at": posted_at or "",
        "url": url,
        "description": _clip(description, 1200),
        "source": source,
    }


def search_adzuna(
    position: str,
    location: str,
    country: str,
    max_items: int,
) -> list[dict[str, str]]:
    app_id = os.getenv("ADZUNA_APP_ID", "").strip()
    app_key = os.getenv("ADZUNA_APP_KEY", "").strip()
    if not app_id or not app_key:
        return []

    cc = _normalize_country(country)
    # Adzuna uses page size up to ~50; page index starts at 1
    where = "" if (location or "").lower() in ("remote", "anywhere", "") else location
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "results_per_page": max_items,
        "what": position,
        "content-type": "application/json",
    }
    if where:
        params["where"] = where

    url = f"https://api.adzuna.com/v1/api/jobs/{cc}/search/1"
    with httpx.Client(timeout=25.0) as client:
        res = client.get(url, params=params)
        if res.status_code >= 400:
            return []
        data = res.json()

    jobs: list[dict[str, str]] = []
    for item in data.get("results") or []:
        if len(jobs) >= max_items:
            break
        loc = item.get("location") or {}
        company = item.get("company") or {}
        salary_bits = []
        if item.get("salary_min"):
            salary_bits.append(str(item["salary_min"]))
        if item.get("salary_max"):
            salary_bits.append(str(item["salary_max"]))
        salary = " - ".join(salary_bits)
        contract = " / ".join(
            x for x in [item.get("contract_type"), item.get("contract_time")] if x
        )
        jobs.append(
            _job(
                title=item.get("title") or "",
                company=company.get("display_name") or "",
                location=loc.get("display_name") or location,
                url=item.get("redirect_url") or "",
                description=item.get("description") or "",
                salary=salary,
                job_type=contract,
                posted_at=item.get("created") or "",
                source="adzuna",
            )
        )
    return jobs


def search_jsearch(
    position: str,
    location: str,
    country: str,
    max_items: int,
) -> list[dict[str, str]]:
    key = (
        os.getenv("JSEARCH_API_KEY", "").strip()
        or os.getenv("RAPIDAPI_KEY", "").strip()
    )
    if not key:
        return []

    query = f"{position} in {location}".strip()
    headers = {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    }
    params = {
        "query": query,
        "page": "1",
        "num_pages": "1",
        "country": _normalize_country(country),
    }
    with httpx.Client(timeout=30.0) as client:
        res = client.get(
            "https://jsearch.p.rapidapi.com/search",
            headers=headers,
            params=params,
        )
        if res.status_code >= 400:
            return []
        data = res.json()

    jobs: list[dict[str, str]] = []
    for item in data.get("data") or []:
        if len(jobs) >= max_items:
            break
        city = item.get("job_city") or ""
        state = item.get("job_state") or ""
        country_name = item.get("job_country") or ""
        loc = ", ".join(x for x in [city, state, country_name] if x) or location
        salary = ""
        if item.get("job_min_salary") or item.get("job_max_salary"):
            lo = item.get("job_min_salary")
            hi = item.get("job_max_salary")
            salary = " - ".join(str(x) for x in [lo, hi] if x is not None)
        elif item.get("job_salary"):
            salary = str(item.get("job_salary"))
        jobs.append(
            _job(
                title=item.get("job_title") or "",
                company=item.get("employer_name") or "",
                location=loc,
                url=item.get("job_apply_link")
                or item.get("job_google_link")
                or "",
                description=item.get("job_description") or "",
                salary=salary,
                job_type=item.get("job_employment_type") or "",
                posted_at=(
                    item.get("job_posted_at_datetime_utc")
                    or (
                        str(item["job_posted_at_timestamp"])
                        if item.get("job_posted_at_timestamp") is not None
                        else ""
                    )
                ),
                source="jsearch",
            )
        )
    return jobs


def search_tavily_jobs(
    position: str,
    location: str,
    max_items: int,
    tavily_client: Any,
) -> list[dict[str, str]]:
    if tavily_client is None or not os.getenv("TAVILY_API_KEY"):
        return []

    q = (
        f"{position} jobs {location} "
        "site:linkedin.com/jobs OR site:indeed.com/viewjob OR site:greenhouse.io OR site:lever.co"
    )
    try:
        raw = tavily_client.search(
            query=q,
            max_results=max(3, min(max_items, 8)),
            include_raw_content=False,
            topic="general",
        )
    except Exception:
        return []

    results = raw.get("results") if isinstance(raw, dict) else None
    if not results:
        return []

    jobs: list[dict[str, str]] = []
    for item in results:
        if len(jobs) >= max_items:
            break
        title = (item.get("title") or "").strip()
        url = (item.get("url") or "").strip()
        content = item.get("content") or item.get("snippet") or ""
        if not title or not url:
            continue
        jobs.append(
            _job(
                title=title,
                company="",
                location=location,
                url=url,
                description=content,
                source="tavily",
            )
        )
    return jobs


def search_apify_indeed(
    position: str,
    location: str,
    country: str,
    max_items: int,
    apify_client: Any,
) -> list[dict[str, str]]:
    if not apify_client or not os.getenv("APIFY_API_KEY"):
        return []
    if os.getenv("JOBS_USE_APIFY", "false").strip().lower() not in (
        "1",
        "true",
        "yes",
        "on",
    ):
        return []

    run = apify_client.actor("misceres/indeed-scraper").call(
        run_input={
            "position": position,
            "location": location,
            "country": country,
            "maxItemsPerSearch": max_items,
            "maxItems": max_items,
            "parseCompanyDetails": False,
            "saveOnlyUniqueItems": True,
            "followApplyRedirects": False,
        }
    )
    dataset_id = getattr(run, "default_dataset_id", None) if run else None
    if not dataset_id:
        return []

    jobs: list[dict[str, str]] = []
    for item in apify_client.dataset(dataset_id).iterate_items():
        if len(jobs) >= max_items:
            break
        salary = item.get("salary")
        if salary is not None and not isinstance(salary, str):
            salary = json.dumps(salary) if isinstance(salary, (dict, list)) else str(salary)
        job_type = item.get("jobType")
        if isinstance(job_type, list):
            job_type = ", ".join(str(x) for x in job_type)
        jobs.append(
            _job(
                title=item.get("positionName") or item.get("title") or "",
                company=item.get("company") or "",
                location=item.get("location") or location,
                url=item.get("url")
                or item.get("externalApplyLink")
                or item.get("viewJobLink")
                or "",
                description=item.get("description") or "",
                salary=salary or "",
                job_type=job_type or "",
                posted_at=item.get("postedAt") or "",
                source="apify-indeed",
            )
        )
    return jobs


def fetch_jobs(
    position: str,
    location: str = "Remote",
    country: str = "US",
    max_items: int = 5,
    *,
    tavily_client: Any = None,
    apify_client: Any = None,
) -> tuple[list[dict[str, str]], str]:
    """
    Try providers in order. Returns (jobs, provider_name).
    """
    max_items = max(1, min(int(max_items), 50))
    position = (position or "").strip() or "software engineer"
    location = (location or "Remote").strip() or "Remote"
    country = country or "US"

    providers = [
        ("adzuna", lambda: search_adzuna(position, location, country, max_items)),
        ("jsearch", lambda: search_jsearch(position, location, country, max_items)),
        (
            "tavily",
            lambda: search_tavily_jobs(position, location, max_items, tavily_client),
        ),
        (
            "apify",
            lambda: search_apify_indeed(
                position, location, country, max_items, apify_client
            ),
        ),
    ]

    # Allow forcing order via JOBS_PROVIDER=adzuna|jsearch|tavily|apify
    preferred = os.getenv("JOBS_PROVIDER", "").strip().lower()
    if preferred:
        providers = [p for p in providers if p[0] == preferred] + [
            p for p in providers if p[0] != preferred
        ]

    last_err = ""
    for name, fn in providers:
        try:
            jobs = fn()
            if jobs:
                return jobs[:max_items], name
        except Exception as e:
            last_err = f"{name}: {e}"
            continue

    return [], last_err or "none"
