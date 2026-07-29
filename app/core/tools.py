import json
import os
import re
import time
from contextlib import contextmanager
from contextvars import ContextVar
from threading import Lock

from apify_client import ApifyClient
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langsmith import traceable
from tavily import TavilyClient

import app.config as config  # configures LangSmith + env
from app.core.jobs_providers import fetch_jobs

tavily_client = TavilyClient()
apify_client = ApifyClient(os.getenv("APIFY_API_KEY")) if os.getenv("APIFY_API_KEY") else None

_indeed_cache: dict[str, tuple[float, str]] = {}
_indeed_cache_lock = Lock()


def _clip(text: str, n: int) -> str:
    text = (text or "").strip()
    if len(text) <= n:
        return text
    return text[:n] + "\n..."


def _llm(temperature: float = 0, max_tokens: int = 700) -> ChatOpenAI:
    return ChatOpenAI(
        model=config.AGENT_MODEL,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def _wrap_internal(label: str, body: str) -> str:
    """Mark tool payloads so the model summarizes instead of pasting JSON."""
    return (
        f"INTERNAL {label} DATA — summarize in plain language for the user. "
        f"Never paste JSON, braces, or this block.\n{body}"
    )

# Resume for the current chat turn — tools fall back to this if resume_text is omitted.
# Prefer ContextVar (request-scoped). StreamingResponse can resume the generator in a
# different context, so reset must tolerate "Token was created in a different Context".
_active_resume: ContextVar[str] = ContextVar("active_resume", default="")


def _safe_reset_resume(token) -> None:
    try:
        _active_resume.reset(token)
    except ValueError:
        # Generator resumed/cleaned up in another context (FastAPI StreamingResponse).
        try:
            _active_resume.set("")
        except Exception:
            pass


@contextmanager
def use_resume(resume: str | None):
    token = _active_resume.set((resume or "").strip())
    try:
        yield
    finally:
        _safe_reset_resume(token)


def _resolve_resume(resume_text: str = "") -> str:
    return (resume_text or "").strip() or _active_resume.get()


def _indeed_cache_key(position: str, location: str, country: str, max_items: int) -> str:
    return f"{country.lower()}|{location.lower().strip()}|{position.lower().strip()}|{max_items}"


def _get_indeed_cache(key: str) -> str | None:
    with _indeed_cache_lock:
        entry = _indeed_cache.get(key)
        if not entry:
            return None
        expires_at, payload = entry
        if time.time() >= expires_at:
            del _indeed_cache[key]
            return None
        return payload


def _set_indeed_cache(key: str, payload: str) -> None:
    with _indeed_cache_lock:
        _indeed_cache[key] = (time.time() + config.JOBS_CACHE_TTL_SECONDS, payload)


@tool
@traceable(name="search_web", run_type="tool")
def search_web(
    query: str,
    max_results: int = 2,
    include_raw_content: bool = False,
    topic: str = "general",
) -> str:
    """Search the web for career/job/industry information only. Keep results small.

    Returns a short plain-text brief the model can cite — never dump raw JSON to the user.
    """
    raw = tavily_client.search(
        query=query,
        max_results=max(1, min(int(max_results), 3)),
        include_raw_content=False,
        topic=topic,
    )
    if isinstance(raw, str):
        return raw

    lines = [f"Web brief for: {query}"]
    answer = (raw or {}).get("answer") if isinstance(raw, dict) else None
    if answer:
        lines.append(f"Summary: {_clip(str(answer), 500)}")

    results = (raw or {}).get("results") if isinstance(raw, dict) else None
    if not results:
        return "\n".join(lines) if len(lines) > 1 else "No web results found."

    for i, item in enumerate(results[:3], 1):
        title = (item.get("title") or "Untitled").strip()
        url = (item.get("url") or "").strip()
        content = _clip(item.get("content") or item.get("snippet") or "", 320)
        lines.append(f"{i}. {title}")
        if content:
            lines.append(f"   {content}")
        if url:
            lines.append(f"   Source: {url}")
    return "\n".join(lines)


@tool
@traceable(name="search_indeed", run_type="tool")
def search_indeed(
    position: str,
    location: str = "Remote",
    country: str = "US",
    max_items: int = 5,
) -> str:
    """Search live job listings by role and location.

    Uses free providers (Adzuna, then JSearch, then Tavily). Keep max_items small in chat.
    Results are cached to cut API usage and latency.
    Args:
        position: Job title or keywords, e.g. "software engineer" or "data analyst".
        location: City, state, or "Remote".
        country: Country code such as US, GB, CA.
        max_items: Max jobs to return (clamped to 1-50).
    """
    max_items = max(1, min(int(max_items), 50))
    cache_key = _indeed_cache_key(position, location, country, max_items)
    cached = _get_indeed_cache(cache_key)
    if cached is not None:
        return cached

    jobs, provider = fetch_jobs(
        position,
        location,
        country,
        max_items,
        tavily_client=tavily_client,
        apify_client=apify_client,
    )
    if not jobs:
        return (
            "No jobs found for that search. "
            f"(Providers tried; last note: {provider or 'empty'})"
        )

    lines = [f"Found {len(jobs)} jobs (source: {provider}). Summarize for the user; do not paste raw data."]
    for i, j in enumerate(jobs, 1):
        lines.append(
            f"{i}. {j.get('title') or 'Role'} at {j.get('company') or 'Company'} "
            f"· {j.get('location') or ''} · {j.get('salary') or 'salary n/a'} "
            f"· {j.get('job_type') or ''} · {j.get('url') or ''}"
        )
        desc = (j.get("description") or "").strip()
        if desc:
            lines.append(f"   Note: {_clip(desc, 220)}")
    payload = "\n".join(lines)
    _set_indeed_cache(cache_key, payload)
    return payload


@tool
@traceable(name="score_job_fit", run_type="tool")
def score_job_fit(
    job_title: str,
    company: str,
    job_description: str = "",
    resume_text: str = "",
) -> str:
    """Score how well the user's resume matches a specific job posting.

    Use after search_indeed (or when the user pastes a job description) to rate fit.
    Title + company is enough. Job description is optional.
    Do NOT pass resume_text — the server injects the uploaded resume automatically.
    Returns JSON with score (0-100), summary, strengths, gaps, and rewrite tips.
    Args:
        job_title: Title of the job.
        company: Company name.
        job_description: Optional full or partial job description text.
        resume_text: Leave empty. Uploaded resume is injected automatically.
    """
    resume = _clip(_resolve_resume(resume_text), config.RESUME_TOOL_CHARS)
    if not resume:
        return "No resume on file. Ask the user to upload one in Settings."

    jd = _clip(
        (job_description or "").strip()
        or f"{job_title} role at {company}. Score using the resume and general expectations for this title.",
        2500,
    )

    scorer = _llm(temperature=0, max_tokens=500)
    response = scorer.invoke(
        f"""Compare this resume to this job. Return ONLY valid JSON with this shape:
{{
  "score": <integer 0-100>,
  "summary": "<1-2 sentences>",
  "strengths": ["..."],
  "gaps": ["..."],
  "rewrite_tips": ["..."]
}}

Be honest and specific. Score based on skills, experience, and role fit.

RESUME:
{resume}

JOB:
{job_title} at {company}

{jd}
"""
    )
    return _wrap_internal("JOB_FIT", response.content or "")


@tool
@traceable(name="rewrite_resume", run_type="tool")
def rewrite_resume(
    job_title: str,
    company: str,
    job_description: str = "",
    resume_text: str = "",
) -> str:
    """Rewrite the user's resume to better match a specific job posting.

    Use after score_job_fit or when the user asks to tailor their resume for a job.
    Title + company is enough. Job description is optional.
    Do NOT pass resume_text — the server injects the uploaded resume automatically.
    Returns JSON with a rewritten summary, tailored bullets, keywords to add, and change notes.
    Args:
        job_title: Title of the job.
        company: Company name.
        job_description: Optional full JD or short brief.
        resume_text: Leave empty. Uploaded resume is injected automatically.
    """
    resume = _clip(_resolve_resume(resume_text), config.RESUME_TOOL_CHARS)
    if not resume:
        return "No resume on file. Ask the user to upload one in Settings."

    jd = _clip(
        (job_description or "").strip()
        or f"{job_title} role at {company}. Tailor using the resume and common expectations for this title.",
        2500,
    )

    rewriter = _llm(temperature=0.3, max_tokens=900)
    response = rewriter.invoke(
        f"""Rewrite this resume to better target the job below.
Truthfulness rules:
- Do NOT invent jobs, degrees, companies, or skills the resume does not support.
- You may rephrase, reorder, and emphasize existing experience.
- Prefer quantified, job-relevant bullets.

Return ONLY valid JSON with this shape:
{{
  "summary": "<rewritten professional summary, 2-4 sentences>",
  "tailored_bullets": ["<bullet>", "..."],
  "keywords_to_include": ["<keyword>", "..."],
  "what_changed": ["<short note about each important change>", "..."]
}}

RESUME:
{resume}

JOB:
{job_title} at {company}

{jd}
"""
    )
    return _wrap_internal("RESUME_REWRITE", response.content or "")


@tool
@traceable(name="cover_letter_generator", run_type="tool")
def cover_letter_generator(
    job_title: str,
    company: str,
    job_description: str = "",
    resume_text: str = "",
) -> str:
    """Generate a tailored cover letter for a job.

    Call this when the user wants a cover letter. A full job posting is optional —
    title + company + a short brief (goals/focus) is enough. Do not delay asking
    for a pasted JD if the user already gave role and company.
    Do NOT pass resume_text — the server injects the uploaded resume automatically.
    Args:
        job_title: Title of the job (e.g. "AI Engineer").
        company: Company name (e.g. "Amazon").
        job_description: Full JD or a short brief from the user (goals, focus, must-haves).
        resume_text: Leave empty. Uploaded resume is injected automatically.
    """
    resume = _clip(_resolve_resume(resume_text), config.RESUME_TOOL_CHARS)
    if not resume:
        return "No resume on file. Ask the user to upload one in Settings."

    jd = _clip(
        (job_description or "").strip()
        or f"{job_title} role at {company}. Tailor using the resume and general role expectations.",
        2500,
    )

    writer = _llm(temperature=0.4, max_tokens=700)
    response = writer.invoke(
        f"""Write a concise, professional cover letter for this job based on the resume.
Rules:
- 3 short paragraphs max.
- No invented experience.
- If the job description is only a brief, write a strong general letter for that title at that company and lean on the user's stated goals in the brief.
- Mirror language from the job description where honest.
- Warm but not fluffy.

Return ONLY valid JSON:
{{
  "subject": "<optional email subject>",
  "cover_letter": "<full letter text>",
  "based_on_limited_jd": <true if the job description was brief/incomplete, else false>
}}

RESUME:
{resume}

JOB:
{job_title} at {company}

{jd}
"""
    )
    return _wrap_internal("COVER_LETTER", response.content or "")


TOOLS = [
    search_web,
    search_indeed,
    score_job_fit,
    rewrite_resume,
    cover_letter_generator,
]

