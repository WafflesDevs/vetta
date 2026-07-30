"""Public lead-gen try funnel — static bank quiz + heuristic resume check (no LLM)."""
from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any

_BANK_PATH = Path(__file__).resolve().parent.parent / "data" / "interview_questions.json"
_bank_cache: dict | None = None

ROLE_LABELS = {
    "software_engineer": "Software Engineer",
    "product_manager": "Product Manager",
    "data": "Data / Analytics",
    "design": "Design",
    "marketing": "Marketing",
    "sales": "Sales",
    "customer_success": "Customer Success",
    "finance": "Finance / Accounting",
    "operations": "Operations",
    "hr_recruiting": "HR / Recruiting",
    "devops": "DevOps / SRE",
    "cybersecurity": "Cybersecurity",
    "content": "Content / Writing",
    "nursing_healthcare": "Nursing / Healthcare",
    "teaching_education": "Teaching / Education",
    "general": "General / Exploring",
}

# Public picker order. Roles without their own bank entry map via ROLE_BANK_FALLBACK.
PUBLIC_ROLE_ORDER = list(ROLE_LABELS.keys())

# Roles shown in the picker but served from a closest existing bank key (no AI).
ROLE_BANK_FALLBACK = {
    "nursing_healthcare": "general",
    "teaching_education": "general",
}

ROLE_KEYWORDS = {
    "software_engineer": [
        "python", "java", "javascript", "typescript", "react", "node", "api",
        "backend", "frontend", "full stack", "aws", "docker", "kubernetes",
        "sql", "git", "ci/cd", "microservices", "system design",
    ],
    "product_manager": [
        "roadmap", "stakeholder", "prioritization", "user research", "metrics",
        "okrs", "a/b", "product", "discovery", "backlog", "go-to-market", "mvp",
    ],
    "data": [
        "sql", "python", "tableau", "looker", "etl", "warehouse", "statistics",
        "machine learning", "pandas", "experiment", "dashboard", "analytics",
    ],
    "design": [
        "figma", "ux", "ui", "prototype", "wireframe", "accessibility",
        "design system", "user research", "usability", "interaction",
    ],
    "marketing": [
        "seo", "content", "campaign", "growth", "analytics", "brand",
        "email", "conversion", "paid", "social", "funnel", "crm",
    ],
    "sales": [
        "pipeline", "quota", "crm", "outbound", "discovery", "negotiation",
        "closing", "arr", "ae", "sdr", "account", "revenue",
    ],
    "customer_success": [
        "retention", "onboarding", "churn", "nps", "expansion", "renewal",
        "adoption", "csm", "health score", "escalation", "qbr",
    ],
    "finance": [
        "forecast", "budget", "gaap", "audit", "variance", "fp&a",
        "reconciliation", "financial model", "p&l", "accounting", "excel",
    ],
    "operations": [
        "process", "efficiency", "sla", "vendor", "supply chain", "logistics",
        "okrs", "cross-functional", "sop", "capacity", "workflow",
    ],
    "hr_recruiting": [
        "recruiting", "sourcing", "interview", "onboarding", "employee relations",
        "compensation", "talent", "ats", "diversity", "performance",
    ],
    "devops": [
        "ci/cd", "kubernetes", "docker", "terraform", "aws", "observability",
        "sre", "incident", "monitoring", "infrastructure", "automation",
    ],
    "cybersecurity": [
        "threat", "vulnerability", "siem", "incident response", "zero trust",
        "iam", "penetration", "compliance", "soc", "risk", "encryption",
    ],
    "content": [
        "editorial", "seo", "copywriting", "storytelling", "newsletter",
        "brand voice", "cms", "content strategy", "writing", "audience",
    ],
    "nursing_healthcare": [
        "patient", "clinical", "care", "emr", "triage", "compliance",
        "hipaa", "nursing", "assessment", "multidisciplinary",
    ],
    "teaching_education": [
        "curriculum", "lesson", "classroom", "assessment", "student",
        "differentiation", "pedagogy", "instruction", "learning outcomes",
    ],
    "general": [
        "leadership", "collaboration", "project", "communication", "results",
        "owned", "delivered", "improved", "managed", "launched",
    ],
}

_ACTION_VERBS = {
    "led", "built", "created", "launched", "improved", "owned", "designed",
    "developed", "shipped", "managed", "reduced", "increased", "automated",
    "delivered", "drove", "optimized", "implemented", "scaled", "negotiated",
    "analyzed", "architected", "migrated", "mentored", "coordinated",
}

_SECTION_PATTERNS = [
    (r"\b(experience|work history|employment)\b", "Experience"),
    (r"\b(education|university|bachelor|master)\b", "Education"),
    (r"\b(skills|technologies|tech stack)\b", "Skills"),
    (r"\b(projects|portfolio)\b", "Projects"),
]


def _load_local_bank() -> dict:
    global _bank_cache
    if _bank_cache is not None:
        return _bank_cache
    try:
        _bank_cache = json.loads(_BANK_PATH.read_text(encoding="utf-8"))
    except Exception:
        _bank_cache = {"roles": {}}
    return _bank_cache


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


def _role_tokens(target_roles: str) -> list[str]:
    blob = (target_roles or "").lower().replace("/", " ").replace("-", " ")
    parts = [p.strip() for p in blob.replace("\n", ",").split(",") if p.strip()]
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
                if t == a or t == key:
                    hit = True
                    break
                if len(a) >= 5 and len(t) >= 5 and (a in t or t in a):
                    hit = True
                    break
                a_words = [w for w in a.replace("-", " ").split() if w]
                t_words = [w for w in t.replace("-", " ").split() if w]
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


def _resolve_bank_role(role: str) -> str:
    """Map picker ids to a bank key (explicit fallbacks first)."""
    key = (role or "").strip().lower().replace(" ", "_").replace("/", "_").replace("-", "_")
    key = re.sub(r"_+", "_", key).strip("_") or "general"
    if key in ROLE_BANK_FALLBACK:
        return ROLE_BANK_FALLBACK[key]
    bank = _load_local_bank()
    if key in (bank.get("roles") or {}):
        return key
    return key


def list_public_roles() -> list[dict[str, str]]:
    bank = _load_local_bank()
    roles = bank.get("roles") or {}
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for key in PUBLIC_ROLE_ORDER:
        label = ROLE_LABELS.get(key)
        if not label:
            continue
        bank_key = ROLE_BANK_FALLBACK.get(key, key)
        if bank_key not in roles and key not in roles:
            continue
        out.append({"id": key, "label": label})
        seen.add(key)
    for key in roles:
        if key in seen:
            continue
        out.append({"id": key, "label": ROLE_LABELS.get(key, key.replace("_", " ").title())})
    return out


def pick_public_quiz(role: str = "", count: int = 4) -> tuple[list[dict], str]:
    """Local curated bank only — never calls an LLM or remote bank."""
    count = max(3, min(int(count or 4), 5))
    role = (role or "").strip() or "general"
    bank = _load_local_bank()
    role_id = role.lower().replace(" ", "_").replace("/", "_").replace("-", "_")
    role_id = re.sub(r"_+", "_", role_id).strip("_")
    if role_id in ROLE_BANK_FALLBACK:
        role_keys = list(dict.fromkeys([ROLE_BANK_FALLBACK[role_id], "general"]))
    elif role_id in (bank.get("roles") or {}):
        role_keys = [role_id] if role_id == "general" else [role_id, "general"]
    else:
        resolved = _resolve_bank_role(role)
        role_keys = _match_role_keys(bank, _role_tokens(resolved))
    primary = role_keys[0] if role_keys else "general"
    pool = _pool_from_bank(bank, role_keys)
    cleaned: list[dict] = []
    avoid: set[str] = set()
    for raw in pool:
        item = _normalize_mcq(raw, avoid)
        if not item:
            continue
        cleaned.append(item)
        avoid.add(item["question"].lower())
        if len(cleaned) >= count:
            break
    return cleaned, primary


def _clip_pct(n: float) -> int:
    return int(max(0, min(100, round(n))))


def analyze_resume_heuristic(resume_text: str, role: str = "") -> dict[str, Any]:
    text = (resume_text or "").strip()
    if not text:
        return {
            "provided": False,
            "score": 0,
            "fixes": [
                {
                    "text": "Add a resume so Vetta can tailor applications and coach against real experience.",
                    "maps_to": "resume",
                    "capability": "Live PDF resume editor",
                }
            ],
        }

    lower = text.lower()
    words = re.findall(r"[a-zA-Z']+", lower)
    word_count = len(words)
    fixes: list[dict[str, str]] = []
    score = 35

    if word_count < 120:
        fixes.append({
            "text": "Resume is very short — expand impact bullets so recruiters see depth.",
            "maps_to": "resume",
            "capability": "Live PDF resume editor",
        })
    elif word_count > 900:
        fixes.append({
            "text": "Resume runs long — tighten to the strongest, role-relevant wins.",
            "maps_to": "resume",
            "capability": "Live PDF resume editor",
        })
        score += 8
    else:
        score += 18

    has_email = bool(re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, re.I))
    has_phone = bool(re.search(r"(\+?\d[\d\s().-]{7,}\d)", text))
    if has_email or has_phone:
        score += 8
    else:
        fixes.append({
            "text": "Missing clear contact info (email/phone) near the top.",
            "maps_to": "resume",
            "capability": "Live PDF resume editor",
        })

    found_sections = 0
    for pat, _label in _SECTION_PATTERNS:
        if re.search(pat, lower):
            found_sections += 1
    score += min(16, found_sections * 5)
    if found_sections < 2:
        fixes.append({
            "text": "Structure is fuzzy — make Experience, Skills, and Education easy to scan.",
            "maps_to": "resume",
            "capability": "Live PDF resume editor",
        })

    verb_hits = sum(1 for w in words if w in _ACTION_VERBS)
    if verb_hits >= 6:
        score += 12
    elif verb_hits >= 3:
        score += 6
    else:
        fixes.append({
            "text": "Swap passive lines for ownership verbs (led, shipped, reduced, launched).",
            "maps_to": "coach",
            "capability": "Coach chat",
        })

    metric_hits = len(re.findall(r"\b\d+(\.\d+)?%?\b", text))
    if metric_hits >= 4:
        score += 14
    elif metric_hits >= 1:
        score += 7
    else:
        fixes.append({
            "text": "Add measurable outcomes (%, time saved, revenue, users) to stand out.",
            "maps_to": "coach",
            "capability": "Coach chat",
        })

    role_key = (role or "general").strip().lower().replace(" ", "_")
    if role_key not in ROLE_KEYWORDS:
        matched = _match_role_keys(_load_local_bank(), _role_tokens(role))
        role_key = matched[0] if matched else "general"
    kws = ROLE_KEYWORDS.get(role_key) or ROLE_KEYWORDS["general"]
    kw_hits = sum(1 for k in kws if k in lower)
    if kw_hits >= 4:
        score += 12
    elif kw_hits >= 2:
        score += 6
    else:
        fixes.append({
            "text": f"Light on {ROLE_LABELS.get(role_key, 'role')}-specific keywords recruiters and ATS scan for.",
            "maps_to": "hub",
            "capability": "Job hub matching",
        })
        fixes.append({
            "text": "Practice role-common interview angles so answers sound interview-ready.",
            "maps_to": "quiz",
            "capability": "Interview quiz",
        })

    if len(fixes) < 2:
        fixes.append({
            "text": "Run live job matches next — see which openings fit before you apply.",
            "maps_to": "hub",
            "capability": "Job hub matching",
        })

    seen: set[str] = set()
    uniq = []
    for f in fixes:
        t = f["text"]
        if t in seen:
            continue
        seen.add(t)
        uniq.append(f)

    return {
        "provided": True,
        "score": _clip_pct(score),
        "word_count": word_count,
        "fixes": uniq[:5],
    }


def build_try_results(
    *,
    role: str,
    quiz_correct: int,
    quiz_total: int,
    resume_text: str = "",
) -> dict[str, Any]:
    total = max(1, int(quiz_total or 1))
    correct = max(0, min(int(quiz_correct or 0), total))
    quiz_pct = _clip_pct(100.0 * correct / total)

    resume = analyze_resume_heuristic(resume_text, role=role)
    resume_score = int(resume.get("score") or 0) if resume.get("provided") else 28

    if resume.get("provided"):
        readiness = _clip_pct(0.55 * quiz_pct + 0.45 * resume_score)
    else:
        # Slightly softer baseline when resume is skipped so the illustrative lift reads clearer.
        readiness = _clip_pct(0.68 * quiz_pct + 0.32 * 28)

    # Product-estimate lift: aggressive enough to feel impressive, still capped below 100.
    quiz_gap = max(22, int((97 - quiz_pct) * 0.78))
    ready_gap = max(26, int((95 - readiness) * 0.74))
    with_quiz = _clip_pct(quiz_pct + quiz_gap)
    with_ready = _clip_pct(readiness + ready_gap)

    fixes = list(resume.get("fixes") or [])
    if quiz_pct < 70:
        fixes.insert(
            0,
            {
                "text": "Interview answers need more structure — drill common big-company MCQs with explanations.",
                "maps_to": "quiz",
                "capability": "Interview quiz",
            },
        )
    if quiz_pct >= 70 and not any(f.get("maps_to") == "coach" for f in fixes):
        fixes.append({
            "text": "Use coach chat to turn strong quiz instincts into STAR stories for real interviews.",
            "maps_to": "coach",
            "capability": "Coach chat",
        })

    seen: set[str] = set()
    clean_fixes = []
    for f in fixes:
        t = f.get("text") or ""
        if not t or t in seen:
            continue
        seen.add(t)
        clean_fixes.append(f)
        if len(clean_fixes) >= 5:
            break

    return {
        "role": role or "general",
        "current": {
            "quiz_pct": quiz_pct,
            "readiness_pct": readiness,
            "quiz_correct": correct,
            "quiz_total": total,
            "resume_score": resume_score if resume.get("provided") else None,
        },
        "with_vetta": {
            "quiz_pct": with_quiz,
            "readiness_pct": with_ready,
            "framing": "Illustrative product estimate of what coaching + practice can unlock — not a hiring guarantee.",
        },
        "resume": {
            "provided": bool(resume.get("provided")),
            "score": resume.get("score"),
        },
        "fixes": clean_fixes,
        "capabilities": [
            {"id": "quiz", "label": "Interview quiz", "blurb": "Role MCQs with explanations"},
            {"id": "resume", "label": "PDF resume editor", "blurb": "Tailor + export the real PDF"},
            {"id": "coach", "label": "Coach chat", "blurb": "Fit reads and interview angles"},
            {"id": "hub", "label": "Job hub", "blurb": "Match openings before you apply"},
        ],
    }
