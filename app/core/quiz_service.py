"""MCQ interview quiz — separate from the main chat agent."""
import json
import random
import uuid
from langchain_openai import ChatOpenAI
from langsmith import traceable

import app.config as config


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
    Returns a list of questions like:
    {
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correct_index": 0,
      "explanation": "..."
    }
    """
    count = max(3, min(count, 8))
    model = ChatOpenAI(model=config.AGENT_MODEL, temperature=0.95, max_tokens=1400)
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
Base questions on their target roles / goals. Ground scenarios in the resume when possible.
Do not invent resume facts.
Variation seed: {seed}
Prefer these angles this round: {focus}
{avoid_block}
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
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()

    data = json.loads(text)
    questions = data.get("questions", [])
    cleaned = []
    avoid_lower = {q.lower() for q in avoided}
    for q in questions:
        options = q.get("options") or []
        if len(options) != 4:
            continue
        question = (q.get("question") or "").strip()
        if question.lower() in avoid_lower:
            continue
        cleaned.append({
            "question": question,
            "options": options,
            "correct_index": int(q.get("correct_index", 0)),
            "explanation": q.get("explanation", ""),
        })
    return cleaned
