"""Live resume editor — rewrites resume text from natural-language instructions."""
from __future__ import annotations

from typing import Iterator

from langchain_anthropic import ChatAnthropic
from langsmith import traceable

import app.config as config

EDIT_SYSTEM = """You are Vetta's resume editor. You rewrite the user's resume live in response to their instruction.

Rules:
- Stay truthful: never invent jobs, degrees, employers, metrics, or skills.
- You may rephrase, reorder, tighten, emphasize, and cut weak lines.
- Output format MUST be exactly:

COACH_NOTE: <one short sentence describing what you changed>
---
<full updated resume as plain text>

Resume formatting (must match PDF layout parser):
- Plain text only. No markdown fences. No JSON.
- Line 1: full name
- Next 1–2 lines: contact (email | phone | city | LinkedIn)
- Then ALL CAPS section headers alone on their own line: SUMMARY, EXPERIENCE, EDUCATION, SKILLS, PROJECTS, etc.
- Under EXPERIENCE / PROJECTS, put each role as: Company — Title | Dates
- Bullets start with "- "
- Blank line between sections
- Multi-page is fine when needed (2–3 pages max). Do not force one page unless asked.
"""


def _split_stream_buffer(buf: str) -> tuple[str | None, str, bool]:
    """
    Returns (note_or_None, resume_so_far, note_complete).
    While still before ---, resume_so_far is "".
    """
    sep = "\n---\n"
    if sep in buf:
        before, after = buf.split(sep, 1)
        note = before
        if note.upper().startswith("COACH_NOTE:"):
            note = note.split(":", 1)[1].strip()
        return note.strip() or None, after, True

    # Soft separator variants
    for alt in ("\n---", "---\n"):
        if alt in buf and sep not in buf:
            # wait for more unless we already have a clear note line
            break

    note = None
    if "COACH_NOTE:" in buf.upper() and "\n" in buf:
        lines = buf.splitlines()
        if lines and lines[0].upper().startswith("COACH_NOTE:"):
            note = lines[0].split(":", 1)[1].strip() or None
    return note, "", False


@traceable(name="resume_live_edit", run_type="chain")
def edit_resume_stream(
    current_resume: str,
    instruction: str,
    target_roles: str = "",
    goals: str = "",
) -> Iterator[dict]:
    """Yield status / note / token / done events for a live resume rewrite."""
    current = (current_resume or "").strip()
    if not current:
        yield {"type": "error", "detail": "Upload a resume first."}
        return

    instruction = (instruction or "").strip()
    if not instruction:
        yield {"type": "error", "detail": "Tell me what to change."}
        return

    yield {"type": "status", "text": "Reading your resume..."}

    model = ChatAnthropic(
        model=config.AI_MODEL,
        temperature=0.35,
        streaming=True,
        max_tokens=config.RESUME_EDIT_MAX_TOKENS,
        api_key=config.require_anthropic_api_key(),
    )

    user_prompt = f"""Current resume:
{current[: config.RESUME_TOOL_CHARS]}

Target roles: {target_roles or "not set"}
Goals: {goals or "not set"}

Instruction from the user:
{instruction}

Rewrite the full resume now in the required format."""

    yield {"type": "status", "text": "Rewriting on the page..."}

    buf = ""
    note_sent = False
    resume_sent_len = 0
    note_complete = False

    for chunk in model.stream(
        [
            {"role": "system", "content": EDIT_SYSTEM},
            {"role": "user", "content": user_prompt},
        ]
    ):
        piece = chunk.content or ""
        if isinstance(piece, list):
            piece = "".join(
                (b.get("text") if isinstance(b, dict) else getattr(b, "text", "") or "")
                for b in piece
            )
        if not piece:
            continue
        buf += piece
        note, resume_part, note_complete = _split_stream_buffer(buf)

        if note and not note_sent:
            yield {"type": "note", "text": note}
            note_sent = True

        if note_complete and len(resume_part) > resume_sent_len:
            delta = resume_part[resume_sent_len:]
            resume_sent_len = len(resume_part)
            if delta:
                yield {"type": "token", "text": delta}

    # Final parse if model omitted separator
    final_note, final_resume, done = _split_stream_buffer(buf)
    if not done:
        # Treat entire buffer as resume; try to peel COACH_NOTE line
        text = buf.strip()
        if text.upper().startswith("COACH_NOTE:"):
            first, _, rest = text.partition("\n")
            final_note = first.split(":", 1)[1].strip()
            final_resume = rest.lstrip("-\n ").strip()
        else:
            final_resume = text
            final_note = final_note or "Updated your resume."

    final_resume = (final_resume or "").strip()
    if not final_resume:
        yield {"type": "error", "detail": "Could not produce an updated resume. Try again."}
        return

    if final_note and not note_sent:
        yield {"type": "note", "text": final_note}

    # Catch up any unfinished token stream if separator arrived late
    if len(final_resume) > resume_sent_len:
        yield {"type": "token", "text": final_resume[resume_sent_len:]}

    yield {
        "type": "done",
        "document": final_resume,
        "note": final_note or "Updated your resume.",
    }
