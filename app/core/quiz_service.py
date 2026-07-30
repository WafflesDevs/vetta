"""MCQ interview quiz — curated role bank first, Anthropic fallback."""
from __future__ import annotations

import json
import os
import random
import uuid
from pathlib import Path

import httpx
from langchain_anthropic import ChatAnthropic
from langsmith import traceable

import app.config as config

_BANK_PATH = Path(__file__).resolve().parent.parent / "data" / "interview_questions.json"
_bank_cache: dict | None = None


def _load_local_bank() -> dict:
    global _bank_cache
    if _bank_cache is not None:
        return _bank_cache
    try:
        _bank_cache = json.loads(_BANK_PATH.read_text(encoding="utf-8"))
    except Exception:
        _bank_cache = {"roles": {}}
    return _bank_cache


def _fetch_remote_bank() -> dict | None:
    """Optional remote JSON bank (same shape as local). No key required for public URLs."""
    url = (os.getenv("QUIZ_BANK_URL") or "").strip()
    if not url:
        return None
    try:
        with httpx.Client(timeout=8.0) as client:
            res = client.get(url)
            if res.status_code >= 400:
                return None
            data = res.json()
            if isinstance(data, dict) and isinstance(data.get("roles"), dict):
                return data
    except Exception:
        return None
    return None


def _normalize_mcq(raw: dict, avoid_lower: set[str]) -> dict | None:
    options = raw.get("options") or []
    if len(options) != 4:
        return None
    question = (raw.get("question") or "").strip()
    if not question or question.lower() in avoid_lower:
        return None
    try:
        correct = int(raw.get("correct_index", 0))
    except (TypeError, ValueError):
        correct = 0
    if correct < 0 or correct > 3:
        correct = 0
    return {
        "question": question,
        "options": [str(o) for o in options],
        "correct_index": correct,
        "explanation": str(raw.get("explanation") or ""),
    }


def _role_tokens(target_roles: str, goals: str) -> list[str]:
    blob = f"{target_roles or ''},{goals or ''}".lower().replace("/", " ").replace("-", " ")
    parts = [p.strip() for p in blob.replace("\n", ",").split(",") if p.strip()]
    # also keep whole string chunks for substring alias match
    return parts or ["general"]


def _match_role_keys(bank: dict, tokens: list[str]) -> list[str]:
    roles = bank.get("roles") or {}
    matched: list[str] = []
    for key, meta in roles.items():
        if key == "general":
            continue
        aliases = [a.lower().strip() for a in (meta.get("aliases") or [])]
        aliases.append(key.replace("_", " "))
        for tok in tokens:
            t = tok.lower().strip()
            if not t:
                continue
            hit = False
            for a in aliases:
                if len(a) < 2:
                    continue
                if t == a:
                    hit = True
                    break
                # Longer substring only (avoids "pm" ⊆ "pmm", bare "engineer" traps)
                if len(a) >= 5 and len(t) >= 5 and (a in t or t in a):
                    hit = True
                    break
                a_words = [w for w in a.replace("-", " ").split() if w]
                t_words = [w for w in t.replace("-", " ").split() if w]
                # Require ≥2 alias words inside the token for multi-word aliases
                if len(a_words) >= 2 and all(w in t for w in a_words):
                    hit = True
                    break
                if len(t_words) >= 2 and all(w in a for w in t_words):
                    hit = True
                    break
            if hit and key not in matched:
                matched.append(key)
                break
    if not matched:
        matched = ["general"]
    elif "general" not in matched:
        matched.append("general")
    return matched


def _pool_from_bank(bank: dict, role_keys: list[str]) -> list[dict]:
    """Role-specific questions first; sprinkle general only as filler."""
    roles = bank.get("roles") or {}
    primary: list[dict] = []
    general: list[dict] = []
    seen: set[str] = set()
    for key in role_keys:
        bucket = general if key == "general" else primary
        meta = roles.get(key) or {}
        for q in meta.get("questions") or []:
            text = (q.get("question") or "").strip().lower()
            if not text or text in seen:
                continue
            seen.add(text)
            bucket.append(q)
    random.shuffle(primary)
    random.shuffle(general)
    return primary + general


def pick_from_bank(
    target_roles: str = "",
    goals: str = "",
    count: int = 5,
    avoid_questions: list[str] | None = None,
) -> list[dict]:
    """Prefer remote bank, then local curated JSON keyed by role aliases."""
    avoided = [q.strip() for q in (avoid_questions or []) if q and str(q).strip()]
    avoid_lower = {q.lower() for q in avoided}
    tokens = _role_tokens(target_roles, goals)

    remote = _fetch_remote_bank()
    local = _load_local_bank()
    banks = [b for b in (remote, local) if b]

    cleaned: list[dict] = []
    for bank in banks:
        role_keys = _match_role_keys(bank, tokens)
        pool = _pool_from_bank(bank, role_keys)
        for raw in pool:
            item = _normalize_mcq(raw, avoid_lower)
            if not item:
                continue
            cleaned.append(item)
            if len(cleaned) >= count:
                return cleaned
        if cleaned:
            break
    return cleaned


@traceable(name="interview_quiz_anthropic", run_type="chain")
def _generate_quiz_anthropic(
    target_roles: str = "",
    locations: str = "",
    goals: str = "",
    resume_text: str = "",
    count: int = 5,
    avoid_questions: list[str] | None = None,
    seed_stems: list[str] | None = None,
) -> list[dict]:
    count = max(3, min(count, 8))
    model = ChatAnthropic(
        model=config.AGENT_MODEL,
        temperature=0.95,
        max_tokens=1400,
        api_key=config.require_anthropic_api_key(),
    )
    seed = f"{uuid.uuid4().hex[:10]}-{random.randint(1000, 9999)}"
    avoided = [q.strip() for q in (avoid_questions or []) if q and str(q).strip()]
    avoid_block = ""
    if avoided:
        listed = "\n".join(f"- {q}" for q in avoided[:20])
        avoid_block = f"""
DO NOT repeat or lightly rephrase any of these previous questions:
{listed}

Create a completely fresh set with different angles, skills, and scenarios.
"""

    seed_block = ""
    if seed_stems:
        listed = "\n".join(f"- {s}" for s in seed_stems[:8])
        seed_block = f"""
Ground at least some items in these common interview themes (turn into MCQs, do not copy verbatim if avoid list conflicts):
{listed}
"""

    angles = [
        "behavioral / STAR",
        "role-specific technical judgment",
        "conflict or feedback",
        "prioritization under constraints",
        "communication with stakeholders",
        "learning from a miss",
        "tools and workflow choices",
    ]
    random.shuffle(angles)
    focus = ", ".join(angles[:4])
    resume_snip = (resume_text or "")[: config.RESUME_PREVIEW_CHARS]

    prompt = f"""Create {count} multiple-choice interview questions for this candidate.
Base questions on their target roles / goals. Prefer common real interview questions for those roles.
Ground scenarios in the resume when possible. Do not invent resume facts.
Variation seed: {seed}
Prefer these angles this round: {focus}
{avoid_block}{seed_block}
TARGET ROLES: {target_roles or "general professional roles"}
LOCATIONS: {locations or "any"}
GOALS: {goals or "land a strong role"}
RESUME (optional):
{resume_snip}

Return ONLY valid JSON:
{{
  "questions": [
    {{
      "question": "<interview question>",
      "options": ["<choice>", "<choice>", "<choice>", "<choice>"],
      "correct_index": <0-3>,
      "explanation": "<short why this answer is best>"
    }}
  ]
}}
"""
    raw = model.invoke(prompt).content
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()

    data = json.loads(text)
    questions = data.get("questions", [])
    cleaned = []
    avoid_lower = {q.lower() for q in avoided}
    for q in questions:
        item = _normalize_mcq(q, avoid_lower)
        if item:
            cleaned.append(item)
    return cleaned


@traceable(name="interview_quiz", run_type="chain")
def generate_quiz(
    target_roles: str = "",
    locations: str = "",
    goals: str = "",
    resume_text: str = "",
    count: int = 5,
    avoid_questions: list[str] | None = None,
) -> list[dict]:
    """
    Prefer curated/common questions for the user's target role(s).
    Falls back to Anthropic MCQ generation when the bank is short.
    """
    count = max(3, min(int(count or 5), 8))
    bank_qs = pick_from_bank(
        target_roles=target_roles,
        goals=goals,
        count=count,
        avoid_questions=avoid_questions,
    )
    if len(bank_qs) >= count:
        return bank_qs[:count]

    need = count - len(bank_qs)
    try:
        generated = _generate_quiz_anthropic(
            target_roles=target_roles,
            locations=locations,
            goals=goals,
            resume_text=resume_text,
            count=max(need, 3),
            avoid_questions=(avoid_questions or [])
            + [q["question"] for q in bank_qs],
            seed_stems=[q["question"] for q in bank_qs] or None,
        )
    except Exception:
        generated = []

    merged = list(bank_qs)
    seen = {q["question"].lower() for q in merged}
    for q in generated:
        if q["question"].lower() in seen:
            continue
        merged.append(q)
        seen.add(q["question"].lower())
        if len(merged) >= count:
            break

    if len(merged) >= 3:
        return merged[:count]

    # Last resort: bank alone even if short
    if merged:
        return merged
    return bank_qs
