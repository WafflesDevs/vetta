from pathlib import Path
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel, EmailStr, field_validator

from app.config import (
    MAX_CHATS,
    MAX_MESSAGES_PER_CHAT,
    ALLOWED_ORIGINS,
    ENV,
    IS_PROD,
    missing_required_env,
)
from app.auth import get_current_user, get_user_db, get_token
from app.db import get_anon_client
from app.core.agent_service import llm_agent, llm_agent_stream
from app.core.resume_loader import extract_resume_text
from app.core.resume_editor import edit_resume_stream
from app.core.resume_pdf import resume_text_to_pdf
from app.core.quiz_service import generate_quiz
from app.core.careers_service import fetch_career_hub_jobs
import json
import os
import traceback


def now_iso():
    return datetime.now(timezone.utc).isoformat()


@asynccontextmanager
async def lifespan(app: FastAPI):
    missing = missing_required_env()
    if missing and IS_PROD:
        raise RuntimeError(f"Missing required env vars: {', '.join(missing)}")
    if missing:
        print(f"Warning: missing env vars (ok for local shell only): {', '.join(missing)}")
    yield


app = FastAPI(title="Vetta", lifespan=lifespan)

_cors_origins = ALLOWED_ORIGINS or ["*"]
_cors_credentials = "*" not in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- request bodies ----------

class AuthBody(BaseModel):
    email: EmailStr
    password: str


class SignupBody(AuthBody):
    display_name: str = ""


class MessageBody(BaseModel):
    content: str


class PreferencesBody(BaseModel):
    target_roles: str = ""
    locations: str = ""
    goals: str = ""
    display_name: str = ""


class ResumeEditBody(BaseModel):
    instruction: str
    resume_text: str = ""


class ResumePdfBody(BaseModel):
    resume_text: str = ""


class QuizAnswerBody(BaseModel):
    selected_index: int


# ---------- auth ----------

@app.post("/api/auth/signup")
def signup(body: SignupBody):
    client = get_anon_client()
    try:
        result = client.auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {"data": {"display_name": body.display_name}},
        })
    except Exception as exc:
        traceback.print_exc()
        detail = str(exc) or "Could not sign up."
        # Common Supabase messages
        low = detail.lower()
        if "already" in low or "registered" in low:
            raise HTTPException(status_code=400, detail="That email is already registered. Try logging in.")
        raise HTTPException(status_code=400, detail="Could not sign up. Try another email or try again.")

    if not result.user:
        raise HTTPException(status_code=400, detail="Could not sign up. Try another email.")

    # profile row is created by the DB trigger; update display name if we have a session
    if body.display_name and result.session:
        try:
            user_client = get_anon_client()
            user_client.postgrest.auth(result.session.access_token)
            user_client.table("profiles").update({
                "display_name": body.display_name,
                "email": body.email,
            }).eq("id", result.user.id).execute()
        except Exception:
            traceback.print_exc()
            # Don't fail signup if profile update fails (email-confirm flows)

    return {
        "user": {"id": result.user.id, "email": result.user.email},
        "session": {
            "access_token": result.session.access_token if result.session else None,
            "refresh_token": result.session.refresh_token if result.session else None,
        },
        "note": "Email sent! Check your inbox to confirm, then log in.",
    }


@app.post("/api/auth/login")
def login(body: AuthBody):
    client = get_anon_client()
    try:
        result = client.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception:
        raise HTTPException(status_code=401, detail="Wrong email or password.")

    if not result.session:
        raise HTTPException(status_code=401, detail="Wrong email or password.")

    return {
        "user": {"id": result.user.id, "email": result.user.email},
        "session": {
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
        },
    }


@app.post("/api/auth/logout")
def logout(token: str = Depends(get_token)):
    client = get_anon_client()
    try:
        client.auth.sign_out()
    except Exception:
        pass
    return {"ok": True}


@app.get("/api/me")
def me(user: dict = Depends(get_current_user), db=Depends(get_user_db)):
    profile = db.table("profiles").select("*").eq("id", user["id"]).maybe_single().execute()
    return {"user": {"id": user["id"], "email": user["email"]}, "profile": profile.data}


# ---------- preferences / profile ----------

@app.put("/api/preferences")
def update_preferences(
    body: PreferencesBody,
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    data = {
        "target_roles": body.target_roles,
        "locations": body.locations,
        "goals": body.goals,
        "updated_at": "now()",
    }
    if body.display_name:
        data["display_name"] = body.display_name

    result = db.table("profiles").update({
        "target_roles": body.target_roles,
        "locations": body.locations,
        "goals": body.goals,
        **({"display_name": body.display_name} if body.display_name else {}),
    }).eq("id", user["id"]).execute()

    # if no profile row yet (trigger missed), create it
    if not result.data:
        insert_row = {
            "id": user["id"],
            "email": user["email"],
            "target_roles": body.target_roles,
            "locations": body.locations,
            "goals": body.goals,
            "display_name": body.display_name or "",
        }
        result = db.table("profiles").upsert(insert_row).execute()

    return {"profile": result.data[0] if result.data else {
        "id": user["id"],
        "target_roles": body.target_roles,
        "locations": body.locations,
        "goals": body.goals,
        "display_name": body.display_name,
    }}


# ---------- resume upload + live editor ----------

@app.post("/api/resume")
async def upload_resume(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 8MB).")

    try:
        text = extract_resume_text(file.filename or "", data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not text:
        raise HTTPException(status_code=400, detail="Could not read text from that file.")

    result = db.table("profiles").update({
        "resume_text": text,
        "resume_filename": file.filename,
    }).eq("id", user["id"]).execute()

    return {
        "filename": file.filename,
        "chars": len(text),
        "preview": text[:400],
        "profile": result.data[0] if result.data else None,
    }


@app.delete("/api/resume")
def delete_resume(user: dict = Depends(get_current_user), db=Depends(get_user_db)):
    result = db.table("profiles").update({
        "resume_text": "",
        "resume_filename": "",
    }).eq("id", user["id"]).execute()

    return {
        "ok": True,
        "profile": result.data[0] if result.data else None,
    }


@app.post("/api/resume/save")
def save_resume_text(
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    text = (body.get("resume_text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Resume text is empty.")
    if len(text) > 100_000:
        raise HTTPException(status_code=400, detail="Resume text is too long.")

    filename = body.get("resume_filename")
    update = {"resume_text": text}
    if filename:
        update["resume_filename"] = filename
    elif not body.get("keep_filename"):
        update["resume_filename"] = "vetta-resume.txt"

    result = db.table("profiles").update(update).eq("id", user["id"]).execute()
    return {"ok": True, "profile": result.data[0] if result.data else None}


@app.post("/api/resume/edit/stream")
def stream_resume_edit(
    body: ResumeEditBody,
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    profile = (
        db.table("profiles")
        .select("resume_text,target_roles,goals,resume_filename")
        .eq("id", user["id"])
        .maybe_single()
        .execute()
    )
    p = profile.data or {}
    current = (body.resume_text or p.get("resume_text") or "").strip()
    if not current:
        raise HTTPException(status_code=400, detail="Upload a resume first.")

    instruction = (body.instruction or "").strip()
    if not instruction:
        raise HTTPException(status_code=400, detail="Tell me what to change.")

    def generate():
        final_doc = None
        final_note = None
        try:
            for event in edit_resume_stream(
                current,
                instruction,
                target_roles=p.get("target_roles") or "",
                goals=p.get("goals") or "",
            ):
                if event.get("type") == "done":
                    final_doc = event.get("document")
                    final_note = event.get("note")
                yield json.dumps(event) + "\n"

            if final_doc:
                result = db.table("profiles").update({
                    "resume_text": final_doc,
                    "resume_filename": p.get("resume_filename") or "vetta-resume.pdf",
                }).eq("id", user["id"]).execute()
                yield json.dumps({
                    "type": "saved",
                    "document": final_doc,
                    "note": final_note,
                    "profile": result.data[0] if result.data else None,
                }) + "\n"
        except Exception as e:
            traceback.print_exc()
            yield json.dumps({"type": "error", "detail": str(e) or "Edit failed."}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.get("/api/resume/pdf")
def download_resume_pdf(
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    profile = (
        db.table("profiles")
        .select("resume_text,resume_filename,display_name")
        .eq("id", user["id"])
        .maybe_single()
        .execute()
    )
    p = profile.data or {}
    text = (p.get("resume_text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="No resume to download.")

    name = (p.get("display_name") or "resume").strip() or "resume"
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in name).strip("-") or "resume"
    filename = f"{safe}-vetta.pdf"
    pdf_bytes = resume_text_to_pdf(text, filename=filename)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/resume/pdf")
def preview_resume_pdf(
    body: ResumePdfBody,
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    """Same PDF builder as download — live WYSIWYG preview (multi-page)."""
    text = (body.resume_text or "").strip()
    if not text:
        profile = (
            db.table("profiles")
            .select("resume_text")
            .eq("id", user["id"])
            .maybe_single()
            .execute()
        )
        text = ((profile.data or {}).get("resume_text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="No resume to preview.")

    pdf_bytes = resume_text_to_pdf(text, filename="vetta-resume-preview.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="vetta-resume-preview.pdf"'},
    )


# ---------- chats (max 2) + messages (max 30) ----------

@app.get("/api/chats")
def list_chats(user: dict = Depends(get_current_user), db=Depends(get_user_db)):
    result = (
        db.table("chats")
        .select("*")
        .eq("user_id", user["id"])
        .order("updated_at", desc=True)
        .execute()
    )
    return {"chats": result.data or [], "max_chats": MAX_CHATS}


@app.post("/api/chats")
def create_chat(user: dict = Depends(get_current_user), db=Depends(get_user_db)):
    existing = (
        db.table("chats")
        .select("id")
        .eq("user_id", user["id"])
        .execute()
    )
    if existing.data and len(existing.data) >= MAX_CHATS:
        raise HTTPException(
            status_code=400,
            detail=f"Free tier allows only {MAX_CHATS} chats. Delete one to make a new chat.",
        )

    result = db.table("chats").insert({
        "user_id": user["id"],
        "title": "New chat",
    }).execute()
    return {"chat": result.data[0]}


@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: str, user: dict = Depends(get_current_user), db=Depends(get_user_db)):
    db.table("messages").delete().eq("chat_id", chat_id).eq("user_id", user["id"]).execute()
    db.table("chats").delete().eq("id", chat_id).eq("user_id", user["id"]).execute()
    return {"ok": True}


@app.get("/api/chats/{chat_id}/messages")
def get_messages(chat_id: str, user: dict = Depends(get_current_user), db=Depends(get_user_db)):
    chat = (
        db.table("chats")
        .select("*")
        .eq("id", chat_id)
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )
    if not chat.data:
        raise HTTPException(status_code=404, detail="Chat not found.")

    msgs = (
        db.table("messages")
        .select("*")
        .eq("chat_id", chat_id)
        .order("created_at")
        .execute()
    )
    return {
        "chat": chat.data,
        "messages": msgs.data or [],
        "max_messages": MAX_MESSAGES_PER_CHAT,
    }


@app.post("/api/chats/{chat_id}/messages")
def send_message(
    chat_id: str,
    body: MessageBody,
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    chat = (
        db.table("chats")
        .select("*")
        .eq("id", chat_id)
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )
    if not chat.data:
        raise HTTPException(status_code=404, detail="Chat not found.")

    existing = (
        db.table("messages")
        .select("id")
        .eq("chat_id", chat_id)
        .execute()
    )
    count = len(existing.data or [])
    # each user turn adds 2 messages (user + assistant)
    if count >= MAX_MESSAGES_PER_CHAT:
        raise HTTPException(
            status_code=400,
            detail=f"This chat hit the {MAX_MESSAGES_PER_CHAT} message limit. Delete it and start a new one.",
        )
    if count + 2 > MAX_MESSAGES_PER_CHAT:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough room left in this chat (max {MAX_MESSAGES_PER_CHAT} messages). Delete it and start a new one.",
        )

    profile = db.table("profiles").select("resume_text").eq("id", user["id"]).maybe_single().execute()
    resume = (profile.data or {}).get("resume_text") or None

    history = (
        db.table("messages")
        .select("role, content")
        .eq("chat_id", chat_id)
        .order("created_at")
        .execute()
    )

    db.table("messages").insert({
        "chat_id": chat_id,
        "user_id": user["id"],
        "role": "user",
        "content": body.content,
    }).execute()

    answer = llm_agent(body.content, history.data or [], resume)

    db.table("messages").insert({
        "chat_id": chat_id,
        "user_id": user["id"],
        "role": "assistant",
        "content": answer,
    }).execute()

    if chat.data.get("title") == "New chat":
        title = body.content.strip()[:48] or "New chat"
        db.table("chats").update({"title": title, "updated_at": now_iso()}).eq("id", chat_id).execute()
    else:
        db.table("chats").update({"updated_at": now_iso()}).eq("id", chat_id).execute()

    msgs = (
        db.table("messages")
        .select("*")
        .eq("chat_id", chat_id)
        .order("created_at")
        .execute()
    )
    return {"messages": msgs.data or [], "reply": answer}


@app.post("/api/chats/{chat_id}/messages/stream")
def send_message_stream(
    chat_id: str,
    body: MessageBody,
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    chat = (
        db.table("chats")
        .select("*")
        .eq("id", chat_id)
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )
    if not chat.data:
        raise HTTPException(status_code=404, detail="Chat not found.")

    existing = (
        db.table("messages")
        .select("id")
        .eq("chat_id", chat_id)
        .execute()
    )
    count = len(existing.data or [])
    if count >= MAX_MESSAGES_PER_CHAT:
        raise HTTPException(
            status_code=400,
            detail=f"This chat hit the {MAX_MESSAGES_PER_CHAT} message limit. Delete it and start a new one.",
        )
    if count + 2 > MAX_MESSAGES_PER_CHAT:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough room left in this chat (max {MAX_MESSAGES_PER_CHAT} messages). Delete it and start a new one.",
        )

    profile = db.table("profiles").select("resume_text").eq("id", user["id"]).maybe_single().execute()
    resume = (profile.data or {}).get("resume_text") or None

    history = (
        db.table("messages")
        .select("role, content")
        .eq("chat_id", chat_id)
        .order("created_at")
        .execute()
    )

    db.table("messages").insert({
        "chat_id": chat_id,
        "user_id": user["id"],
        "role": "user",
        "content": body.content,
    }).execute()

    user_id = user["id"]
    original_title = chat.data.get("title")
    user_content = body.content

    def event_stream():
        answer = ""
        try:
            yield json.dumps({"type": "status", "text": "Thinking..."}) + "\n"
            for event in llm_agent_stream(user_content, history.data or [], resume):
                if event.get("type") == "done":
                    answer = event.get("content") or answer
                yield json.dumps(event) + "\n"

            if not answer.strip():
                answer = "I could not generate a reply. Try again."

            db.table("messages").insert({
                "chat_id": chat_id,
                "user_id": user_id,
                "role": "assistant",
                "content": answer,
            }).execute()

            if original_title == "New chat":
                title = user_content.strip()[:48] or "New chat"
                db.table("chats").update({"title": title, "updated_at": now_iso()}).eq("id", chat_id).execute()
            else:
                db.table("chats").update({"updated_at": now_iso()}).eq("id", chat_id).execute()

            msgs = (
                db.table("messages")
                .select("*")
                .eq("chat_id", chat_id)
                .order("created_at")
                .execute()
            )
            yield json.dumps({"type": "final", "messages": msgs.data or []}) + "\n"
        except Exception as exc:
            traceback.print_exc()
            yield json.dumps({"type": "error", "detail": str(exc)}) + "\n"

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------- jobs (Jobright-style hub) ----------

class JobSaveBody(BaseModel):
    status: str  # liked | applied | external
    title: str = ""
    company: str = ""
    location: str = ""
    salary: str = ""
    url: str = ""
    description: str = ""
    job_type: str = ""
    posted_at: str = ""

    @field_validator("salary", "job_type", "url", "title", "company", "location", "posted_at", mode="before")
    @classmethod
    def coerce_text(cls, v):
        if v is None:
            return ""
        if isinstance(v, (dict, list)):
            return json.dumps(v)
        return str(v)

    @classmethod
    def _as_text(cls, v):
        if v is None:
            return ""
        if isinstance(v, (dict, list)):
            return json.dumps(v)
        return str(v)

    def normalized(self) -> dict:
        url = (self.url or "").strip()
        if not url:
            slug = f"{self.title}|{self.company}|{self.location}".strip("|")
            url = f"job://{slug}" if slug else ""
        return {
            "status": (self.status or "").strip().lower(),
            "title": self.title or "",
            "company": self.company or "",
            "location": self.location or "",
            "salary": self._as_text(self.salary),
            "url": url,
            "description": self.description or "",
            "job_type": self._as_text(self.job_type),
            "posted_at": self.posted_at or "",
        }


@app.get("/api/careers/hub")
def careers_hub(user: dict = Depends(get_current_user), db=Depends(get_user_db)):
    profile = db.table("profiles").select("*").eq("id", user["id"]).maybe_single().execute()
    p = profile.data or {}
    jobs = fetch_career_hub_jobs(p.get("target_roles", ""), p.get("locations", ""))

    saves = (
        db.table("job_saves")
        .select("*")
        .eq("user_id", user["id"])
        .execute()
    )
    saved = saves.data or []
    by_url = {s["url"]: s for s in saved if s.get("url")}

    # mark recommended jobs with current save status
    enriched = []
    for job in jobs:
        url = job.get("url") or ""
        save = by_url.get(url)
        enriched.append({
            **job,
            "saved_status": save["status"] if save else None,
        })

    liked = [s for s in saved if s.get("status") == "liked"]
    applied = [s for s in saved if s.get("status") == "applied"]
    external = [s for s in saved if s.get("status") == "external"]

    return {
        "preferences": {
            "target_roles": p.get("target_roles", ""),
            "locations": p.get("locations", ""),
            "goals": p.get("goals", ""),
        },
        "recommended": enriched,
        "liked": liked,
        "applied": applied,
        "external": external,
        "counts": {
            "recommended": len(enriched),
            "liked": len(liked),
            "applied": len(applied),
            "external": len(external),
        },
        # keep old key so nothing else breaks
        "jobs": enriched,
    }


@app.get("/api/jobs/saves")
def list_job_saves(user: dict = Depends(get_current_user), db=Depends(get_user_db)):
    saves = (
        db.table("job_saves")
        .select("*")
        .eq("user_id", user["id"])
        .execute()
    )
    saved = saves.data or []
    liked = [s for s in saved if s.get("status") == "liked"]
    applied = [s for s in saved if s.get("status") == "applied"]
    external = [s for s in saved if s.get("status") == "external"]
    return {
        "liked": liked,
        "applied": applied,
        "external": external,
        "counts": {
            "liked": len(liked),
            "applied": len(applied),
            "external": len(external),
        },
    }


@app.post("/api/jobs/save")
def save_job(body: JobSaveBody, user: dict = Depends(get_current_user), db=Depends(get_user_db)):
    row = body.normalized()
    status = row["status"]
    if status not in ("liked", "applied", "external"):
        raise HTTPException(status_code=400, detail="status must be liked, applied, or external")
    if not row["url"]:
        raise HTTPException(status_code=400, detail="Job URL is required")

    row["user_id"] = user["id"]

    try:
        result = (
            db.table("job_saves")
            .upsert(row, on_conflict="user_id,url")
            .execute()
        )
        job = (result.data or [row])[0]
    except Exception as exc:
        # fallback to select + update/insert for older clients
        existing = (
            db.table("job_saves")
            .select("id")
            .eq("user_id", user["id"])
            .eq("url", row["url"])
            .maybe_single()
            .execute()
        )
        if existing.data:
            result = (
                db.table("job_saves")
                .update({
                    "status": status,
                    "title": row["title"],
                    "company": row["company"],
                    "location": row["location"],
                    "salary": row["salary"],
                    "description": row["description"],
                    "job_type": row["job_type"],
                    "posted_at": row["posted_at"],
                })
                .eq("id", existing.data["id"])
                .execute()
            )
            job = (result.data or [row])[0]
        else:
            result = db.table("job_saves").insert(row).execute()
            job = (result.data or [row])[0]
            if not result.data:
                # RLS might hide RETURNING — verify row exists
                check = (
                    db.table("job_saves")
                    .select("*")
                    .eq("user_id", user["id"])
                    .eq("url", row["url"])
                    .maybe_single()
                    .execute()
                )
                if not check.data:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Could not save job. Run supabase/job_saves.sql in Supabase if the table is missing. ({exc})",
                    )
                job = check.data

    return {"job": job, "ok": True}


@app.delete("/api/jobs/save")
def unsave_job(url: str, user: dict = Depends(get_current_user), db=Depends(get_user_db)):
    if not url:
        raise HTTPException(status_code=400, detail="url query param required")
    db.table("job_saves").delete().eq("user_id", user["id"]).eq("url", url).execute()
    return {"ok": True}


# ---------- quiz ----------

class QuizStartBody(BaseModel):
    avoid_questions: list[str] = []


@app.post("/api/quiz/start")
def quiz_start(
    body: QuizStartBody | None = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    profile = db.table("profiles").select("*").eq("id", user["id"]).maybe_single().execute()
    p = profile.data or {}
    avoid = (body.avoid_questions if body else None) or []
    questions = generate_quiz(
        target_roles=p.get("target_roles", ""),
        locations=p.get("locations", ""),
        goals=p.get("goals", ""),
        resume_text=p.get("resume_text", ""),
        count=5,
        avoid_questions=avoid,
    )
    if not questions:
        # one more try without filters if the model mirrored old items
        questions = generate_quiz(
            target_roles=p.get("target_roles", ""),
            locations=p.get("locations", ""),
            goals=p.get("goals", ""),
            resume_text=p.get("resume_text", ""),
            count=5,
            avoid_questions=avoid,
        )
    playable = []
    for i, q in enumerate(questions):
        playable.append({
            "id": i,
            "question": q["question"],
            "options": q["options"],
            "correct_index": q["correct_index"],
            "explanation": q["explanation"],
        })
    return {"questions": playable}


# ---------- plans (TBA) ----------

@app.get("/api/plans")
def plans():
    return {
        "plans": [
            {
                "id": "careerfinder",
                "name": "CareerFinder",
                "price": "TBA",
                "blurb": "Discover roles that match where you are now.",
                "features": ["TBA", "TBA", "TBA"],
            },
            {
                "id": "careerexpert",
                "name": "CareerExpert",
                "price": "TBA",
                "blurb": "Deeper resume coaching and fit scoring.",
                "features": ["TBA", "TBA", "TBA"],
            },
            {
                "id": "careerpro",
                "name": "CareerPro",
                "price": "TBA",
                "blurb": "Full job-search stack for serious applicants.",
                "features": ["TBA", "TBA", "TBA"],
            },
        ]
    }


# ---------- health + frontend ----------

@app.get("/api/health")
def health():
    return {
        "ok": True,
        "service": "vetta",
        "env": ENV,
        "langsmith": os.getenv("LANGSMITH_TRACING", "").lower() == "true",
    }


STATIC_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        index = STATIC_DIR / "index.html"
        file_path = STATIC_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(index)
