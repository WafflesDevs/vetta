"""Read text out of a resume PDF or DOCX upload."""
from io import BytesIO
from docx import Document
from pypdf import PdfReader


def extract_resume_text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()

    if name.endswith(".pdf"):
        reader = PdfReader(BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages).strip()

    if name.endswith(".docx"):
        doc = Document(BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs).strip()

    raise ValueError("Please upload a PDF or DOCX file.")
