"""ATS-friendly multi-page PDF resume — same bytes used for preview + download."""
from __future__ import annotations

import re
from io import BytesIO

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)

PAGE_W, PAGE_H = letter
MARGIN_X = 0.65 * inch
MARGIN_TOP = 0.55 * inch
MARGIN_BOTTOM = 0.55 * inch

INK = HexColor("#111111")
MUTED = HexColor("#444444")
RULE = HexColor("#222222")


def _escape(text: str) -> str:
    return (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _is_section(line: str) -> bool:
    raw = line.strip()
    if not raw or len(raw) > 48:
        return False
    if raw.endswith((".", ",", ";", ":")) and len(raw) > 20:
        return False
    letters = [c for c in raw if c.isalpha()]
    if len(letters) < 3:
        return False
    upper = sum(1 for c in letters if c.isupper())
    return upper / len(letters) >= 0.85


def _is_bullet(line: str) -> bool:
    s = line.strip()
    return bool(re.match(r"^([•\-\*–—]|\d+[.)])\s+", s))


def _strip_bullet(line: str) -> str:
    return re.sub(r"^([•\-\*–—]|\d+[.)])\s+", "", line.strip())


def _looks_contact(line: str) -> bool:
    s = line.lower()
    markers = ("@", "http", "linkedin", "github", "phone", "(", ")", "|", " · ", "•")
    if any(m in s for m in markers):
        return True
    if re.search(r"\d{3}[-.\s]?\d{3}[-.\s]?\d{4}", s):
        return True
    return False


def parse_resume_blocks(text: str) -> dict:
    """
    Parse plain resume text into structured parts for layout.
    {
      name, contact_lines, sections: [{title, blocks: [{type, text|items}]}]
    }
    """
    lines = [ln.rstrip() for ln in (text or "").replace("\r\n", "\n").split("\n")]
    # drop leading empties
    while lines and not lines[0].strip():
        lines.pop(0)

    name = ""
    contact_lines: list[str] = []
    body_start = 0

    if lines:
        first = lines[0].strip()
        if first and not _is_section(first):
            name = first
            body_start = 1
            # up to 3 contact-ish lines before first section
            while body_start < len(lines) and body_start < 4:
                cand = lines[body_start].strip()
                if not cand:
                    body_start += 1
                    continue
                if _is_section(cand):
                    break
                if _looks_contact(cand) or (not contact_lines and len(cand) < 120):
                    contact_lines.append(cand)
                    body_start += 1
                    continue
                break

    sections: list[dict] = []
    current: dict | None = None
    paragraph_buf: list[str] = []
    bullets: list[str] = []

    def flush_para():
        nonlocal paragraph_buf
        if current is None or not paragraph_buf:
            paragraph_buf = []
            return
        text_joined = " ".join(paragraph_buf).strip()
        if text_joined:
            current["blocks"].append({"type": "para", "text": text_joined})
        paragraph_buf = []

    def flush_bullets():
        nonlocal bullets
        if current is None or not bullets:
            bullets = []
            return
        current["blocks"].append({"type": "bullets", "items": bullets[:]})
        bullets = []

    def ensure_section(title: str):
        nonlocal current
        flush_para()
        flush_bullets()
        current = {"title": title.strip(), "blocks": []}
        sections.append(current)

    for line in lines[body_start:]:
        raw = line.strip()
        if not raw:
            flush_para()
            flush_bullets()
            continue
        if _is_section(raw):
            ensure_section(raw.upper())
            continue
        if current is None:
            ensure_section("PROFILE")
        if _is_bullet(raw):
            flush_para()
            bullets.append(_strip_bullet(raw))
            continue
        # role / company heading heuristics
        if (
            not bullets
            and len(raw) < 110
            and (
                "|" in raw
                or " — " in raw
                or " - " in raw
                or re.search(r"\b(20\d{2}|19\d{2})\b", raw)
            )
        ):
            flush_para()
            flush_bullets()
            current["blocks"].append({"type": "role", "text": raw})
            continue
        flush_bullets()
        paragraph_buf.append(raw)

    flush_para()
    flush_bullets()

    if not name and sections:
        # fallback: use first line of first para
        name = "Resume"

    return {
        "name": name or "Resume",
        "contact_lines": contact_lines,
        "sections": sections,
    }


def _styles():
    name = ParagraphStyle(
        "VName",
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        alignment=TA_CENTER,
        textColor=INK,
        spaceAfter=4,
    )
    contact = ParagraphStyle(
        "VContact",
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        alignment=TA_CENTER,
        textColor=MUTED,
        spaceAfter=2,
    )
    section = ParagraphStyle(
        "VSection",
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        alignment=TA_LEFT,
        textColor=INK,
        spaceBefore=2,
        spaceAfter=2,
        letterSpacing=0.6,
    )
    role = ParagraphStyle(
        "VRole",
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        alignment=TA_LEFT,
        textColor=INK,
        spaceBefore=6,
        spaceAfter=2,
    )
    body = ParagraphStyle(
        "VBody",
        fontName="Helvetica",
        fontSize=9.5,
        leading=12.5,
        alignment=TA_JUSTIFY,
        textColor=INK,
        spaceAfter=4,
    )
    bullet = ParagraphStyle(
        "VBullet",
        fontName="Helvetica",
        fontSize=9.5,
        leading=12.5,
        alignment=TA_LEFT,
        textColor=INK,
        leftIndent=0,
    )
    return name, contact, section, role, body, bullet


def _page_footer(canvas, doc):
    canvas.saveState()
    page = canvas.getPageNumber()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(PAGE_W / 2, 0.35 * inch, str(page))
    # thin top/bottom margin accents
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.4)
    canvas.line(MARGIN_X, PAGE_H - 0.35 * inch, PAGE_W - MARGIN_X, PAGE_H - 0.35 * inch)
    canvas.restoreState()


def build_resume_story(text: str) -> list:
    name_s, contact_s, section_s, role_s, body_s, bullet_s = _styles()
    data = parse_resume_blocks(text)
    story: list = []

    story.append(Paragraph(_escape(data["name"]), name_s))
    for line in data["contact_lines"]:
        story.append(Paragraph(_escape(line), contact_s))
    story.append(Spacer(1, 8))
    story.append(
        HRFlowable(
            width="100%",
            thickness=1.25,
            color=RULE,
            spaceBefore=0,
            spaceAfter=8,
        )
    )

    for sec in data["sections"]:
        header_bits = [
            Paragraph(_escape(sec["title"]), section_s),
            HRFlowable(
                width="100%",
                thickness=0.7,
                color=RULE,
                spaceBefore=1,
                spaceAfter=6,
            ),
        ]
        block_flows: list = []
        for block in sec["blocks"]:
            if block["type"] == "role":
                block_flows.append(Paragraph(_escape(block["text"]), role_s))
            elif block["type"] == "para":
                block_flows.append(Paragraph(_escape(block["text"]), body_s))
            elif block["type"] == "bullets":
                items = []
                for item in block["items"]:
                    items.append(
                        ListItem(
                            Paragraph(_escape(item), bullet_s),
                            leftIndent=12,
                            bulletColor=INK,
                        )
                    )
                if items:
                    block_flows.append(
                        ListFlowable(
                            items,
                            bulletType="bullet",
                            start="•",
                            leftIndent=14,
                            bulletFontName="Helvetica",
                            bulletFontSize=9,
                            spaceBefore=1,
                            spaceAfter=4,
                        )
                    )
        # Keep section header with first block to avoid orphan headers across pages
        if block_flows:
            story.append(KeepTogether(header_bits + [block_flows[0]]))
            story.extend(block_flows[1:])
        else:
            story.append(KeepTogether(header_bits))
        story.append(Spacer(1, 4))

    if len(story) <= 3:
        story.append(Paragraph(_escape("(Empty resume)"), body_s))

    return story


def resume_text_to_pdf(text: str, filename: str = "vetta-resume.pdf") -> bytes:
    """Return multi-page PDF bytes. Preview and download share this builder."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=MARGIN_X,
        rightMargin=MARGIN_X,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        title=filename,
        author="Vetta",
    )
    story = build_resume_story(text or "")
    doc.build(story, onFirstPage=_page_footer, onLaterPages=_page_footer)
    return buf.getvalue()
