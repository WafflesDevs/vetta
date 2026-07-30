from pathlib import Path
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel, EmailStr, field_validator
from urllib.parse import urlparse

from app.config import (
    MAX_CHATS,
    MAX_MESSAGES_PER_CHAT,
    ALLOWED_ORIGINS,
    ENV,
    IS_PROD,
    missing_required_env,
    JOBS_MAX_ITEMS,
    JOBS_CACHE_TTL_SECONDS,
    JOBS_REFRESH_COOLDOWN_SECONDS,
    QUIZ_QUESTIONS_PER_CYCLE,
    PASSWORD_RESET_REDIRECT_URL,
    EMAIL_CONFIRM_REDIRECT_URL,
    PUBLIC_TRY_QUESTIONS,
    PUBLIC_TRY_QUIZ_PER_HOUR,
    PUBLIC_TRY_RESULTS_PER_HOUR,
    PUBLIC_TRY_RESUME_MAX_BYTES,
)
from app.auth import get_current_user, get_user_db, get_token
from app.db import get_anon_client
from app.core import stripe_billing
from app.core.agent_service import llm_agent, llm_agent_stream
from app.core.resume_loader import extract_resume_text
from app.core.resume_editor import edit_resume_stream
from app.core.resume_pdf import resume_text_to_pdf
from app.core.quiz_service import generate_quiz
from app.core.quiz_limits import (
    can_start_quiz,
    quiz_cycles_used,
    quiz_max_cycles,
    quiz_seconds_until_reset,
    record_quiz_cycle,
)
from app.core.public_rate_limit import IpRateLimiter, client_ip
from app.core.public_try_service import (
    build_try_results,
    list_public_roles,
    pick_public_quiz,
)
from app.core.careers_service import (
    enrich_jobs_with_match_scores,
    fetch_career_hub_jobs,
    peek_career_hub_jobs,
    sort_jobs_by_match_score,
)
import json
import os
import time
import traceback
from threading import Lock


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


class ForgotPasswordBody(BaseModel):
    email: EmailStr


class ResetPasswordBody(BaseModel):
    password: str
    refresh_token: str = ""


class VerifyRecoveryBody(BaseModel):
    token_hash: str
    type: str = "recovery"


class ResendConfirmationBody(BaseModel):
    email: EmailStr


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


class StripeCheckoutBody(BaseModel):
    plan: str

    @field_validator("plan")
    @classmethod
    def plan_ok(cls, v: str) -> str:
        return stripe_billing.normalize_checkout_plan(v)


def profile_plan(profile: dict | None) -> str:
    """Current product plan from profiles.plan (free / careerexpert / careerpro)."""
    if not profile:
        return "free"
    plan = (profile.get("plan") or "free").strip().lower()
    if plan in {"careerexpert", "expert", "careerpro", "pro"}:
        return "careerpro" if plan in {"careerpro", "pro"} else "careerexpert"
    return "free"


def can_use_resume_editor(profile: dict | None) -> bool:
    # Paid plans TBA — resume studio unlocked for everyone.
    return True


def chats_max_for(plan: str) -> int:
    return MAX_CHATS


def messages_max_for(plan: str) -> int:
    return MAX_MESSAGES_PER_CHAT


def _chat_message_cap_detail(plan: str, *, at_cap: bool) -> str:
    cap = messages_max_for(plan)
    if at_cap:
        return (
            f"This chat hit the {cap} message limit. "
            "Delete it and start a new one."
        )
    return (
        f"Not enough room left in this chat (max {cap} messages). "
        "Delete it and start a new one."
    )


def jobs_max_for(plan: str) -> int:
    return JOBS_MAX_ITEMS


def jobs_cache_ttl_for(plan: str) -> int:
    return JOBS_CACHE_TTL_SECONDS


def jobs_refresh_cooldown_for(plan: str) -> int:
    return JOBS_REFRESH_COOLDOWN_SECONDS


_hub_refresh_at: dict[str, float] = {}
_hub_refresh_lock = Lock()


def _hub_refresh_remaining(user_id: str, cooldown: int) -> int:
    if cooldown <= 0:
        return 0
    with _hub_refresh_lock:
        last = _hub_refresh_at.get(str(user_id)) or 0.0
    left = int(cooldown - (time.time() - last))
    return max(0, left)


def _mark_hub_refresh(user_id: str) -> None:
    with _hub_refresh_lock:
        _hub_refresh_at[str(user_id)] = time.time()


# ---------- auth ----------

def _spa_origin_from_request(request: Request) -> str:
    origin = (request.headers.get("origin") or "").strip()
    if not origin:
        referer = (request.headers.get("referer") or "").strip()
        if referer:
            parsed = urlparse(referer)
            if parsed.scheme and parsed.netloc:
                origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin:
        host = urlparse(origin).hostname or ""
        if host in {"127.0.0.1", "localhost"} and ":8000" in origin:
            return "http://localhost:5173"
        return origin.rstrip("/")
    return "http://localhost:5173"


def _password_reset_redirect(request: Request) -> str:
    """Redirect target for Supabase recovery emails (must be Vite SPA in local dev)."""
    if PASSWORD_RESET_REDIRECT_URL:
        return PASSWORD_RESET_REDIRECT_URL
    return f"{_spa_origin_from_request(request)}/reset-password"


def _email_confirm_redirect(request: Request) -> str:
    """Redirect target for signup confirmation emails."""
    if EMAIL_CONFIRM_REDIRECT_URL:
        return EMAIL_CONFIRM_REDIRECT_URL
    return f"{_spa_origin_from_request(request)}/confirm-email"


def _user_email_confirmed(user) -> bool:
    if not user:
        return False
    confirmed = getattr(user, "email_confirmed_at", None) or getattr(
        user, "confirmed_at", None
    )
    if confirmed:
        return True
    if isinstance(user, dict):
        return bool(user.get("email_confirmed_at") or user.get("confirmed_at"))
    return False


@app.post("/api/auth/signup")
def signup(body: SignupBody, request: Request):
    """Create account. Always requires email confirmation before login."""
    client = get_anon_client()
    redirect_to = _email_confirm_redirect(request)
    try:
        result = client.auth.sign_up(
            {
                "email": body.email,
                "password": body.password,
                "options": {
                    "data": {"display_name": body.display_name},
                    "email_redirect_to": redirect_to,
                },
            }
        )
    except Exception as exc:
        traceback.print_exc()
        detail = str(exc) or "Could not sign up."
        low = detail.lower()
        if "already" in low or "registered" in low:
            raise HTTPException(
                status_code=400,
                detail="That email is already registered. Try logging in.",
            )
        raise HTTPException(
            status_code=400,
            detail="Could not sign up. Try another email or try again.",
        )

    if not result.user:
        raise HTTPException(status_code=400, detail="Could not sign up. Try another email.")

    # Never auto-login on signup — confirm email first.
    # Turn "Confirm email" ON in Supabase Auth settings so login is blocked until verified.
    if body.display_name and result.session and _user_email_confirmed(result.user):
        try:
            user_client = get_anon_client()
            user_client.postgrest.auth(result.session.access_token)
            user_client.table("profiles").update(
                {
                    "display_name": body.display_name,
                    "email": body.email,
                }
            ).eq("id", result.user.id).execute()
        except Exception:
            traceback.print_exc()

    return {
        "user": {"id": result.user.id, "email": result.user.email},
        "session": {"access_token": None, "refresh_token": None},
        "requires_email_confirmation": True,
        "note": "Check your email to confirm your account, then log in.",
        "redirect_to": redirect_to,
    }


@app.post("/api/auth/login")
def login(body: AuthBody):
    client = get_anon_client()
    try:
        result = client.auth.sign_in_with_password(
            {
                "email": body.email,
                "password": body.password,
            }
        )
    except Exception as exc:
        low = str(exc).lower()
        if "confirm" in low or "not confirmed" in low or "email not confirmed" in low:
            raise HTTPException(
                status_code=403,
                detail="Confirm your email before logging in. Check your inbox for the link.",
            )
        raise HTTPException(status_code=401, detail="Wrong email or password.")

    if not result.session:
        raise HTTPException(status_code=401, detail="Wrong email or password.")

    if result.user and not _user_email_confirmed(result.user):
        raise HTTPException(
            status_code=403,
            detail="Confirm your email before logging in. Check your inbox for the link.",
        )

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


@app.post("/api/auth/resend-confirmation")
def resend_confirmation(body: ResendConfirmationBody, request: Request):
    """Resend signup confirmation email. Always ok (no email leak)."""
    client = get_anon_client()
    redirect_to = _email_confirm_redirect(request)
    try:
        client.auth.resend(
            {
                "type": "signup",
                "email": body.email,
                "options": {"email_redirect_to": redirect_to},
            }
        )
    except Exception:
        traceback.print_exc()
    return {
        "ok": True,
        "message": "If that email needs confirmation, we sent another link.",
        "redirect_to": redirect_to,
    }


@app.post("/api/auth/forgot-password")
def forgot_password(body: ForgotPasswordBody, request: Request):
    """Send a Supabase password-reset email. Always returns ok (no email leak)."""
    client = get_anon_client()
    redirect_to = _password_reset_redirect(request)
    try:
        client.auth.reset_password_for_email(
            body.email,
            {"redirect_to": redirect_to},
        )
    except Exception:
        traceback.print_exc()
    return {
        "ok": True,
        "message": "Check your email for a reset link.",
        "redirect_to": redirect_to,
    }


@app.post("/api/auth/verify-recovery")
def verify_recovery(body: VerifyRecoveryBody):
    """Exchange a recovery/signup token_hash (query-param flow) for a session."""
    client = get_anon_client()
    token_hash = (body.token_hash or "").strip()
    otp_type = (body.type or "recovery").strip() or "recovery"
    if not token_hash:
        raise HTTPException(
            status_code=400,
            detail="Link is missing a token. Request a new one.",
        )
    try:
        result = client.auth.verify_otp(
            {
                "token_hash": token_hash,
                "type": otp_type,
            }
        )
    except Exception:
        traceback.print_exc()
        raise HTTPException(
            status_code=400,
            detail="That link is invalid or expired. Request a new one.",
        ) from None

    if not result.session:
        raise HTTPException(
            status_code=400,
            detail="Could not verify that link. Request a new one.",
        )

    return {
        "user": {"id": result.user.id, "email": result.user.email} if result.user else None,
        "session": {
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
        },
    }


@app.post("/api/auth/reset-password")
def reset_password(body: ResetPasswordBody, token: str = Depends(get_token)):
    """Set a new password using the recovery session from the email link."""
    if len(body.password or "") < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters.",
        )
    if not body.refresh_token:
        raise HTTPException(
            status_code=400,
            detail="Missing recovery session. Open the link from your email again.",
        )

    client = get_anon_client()
    try:
        client.auth.set_session(token, body.refresh_token)
        client.auth.update_user({"password": body.password})
    except Exception:
        traceback.print_exc()
        raise HTTPException(
            status_code=400,
            detail="Could not update password. Request a new reset link.",
        )

    return {"ok": True, "message": "Password updated. You can log in now."}


@app.get("/api/me")
def me(
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
    sync: bool = Query(False),
):
    profile = db.table("profiles").select("*").eq("id", user["id"]).maybe_single().execute()
    p = profile.data or {}
    # Stripe / paid plans are TBA — do not sync plan from Stripe.
    _ = (sync, p)  # sync query kept for API compat
    return {
        "user": {"id": user["id"], "email": user["email"]},
        "profile": profile.data,
        "plan": profile_plan(profile.data),
    }


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
    profile = db.table("profiles").select("*").eq("id", user["id"]).maybe_single().execute()
    if not can_use_resume_editor(profile.data):
        raise HTTPException(
            status_code=403,
            detail="Live resume editing is on CareerExpert and CareerPro. Upload stays free in Settings.",
        )
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
        .select("plan,resume_text,target_roles,goals,resume_filename")
        .eq("id", user["id"])
        .maybe_single()
        .execute()
    )
    p = profile.data or {}
    if not can_use_resume_editor(p):
        raise HTTPException(
            status_code=403,
            detail="Live resume editing is on CareerExpert and CareerPro.",
        )
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


# ---------- chats + messages (plan-aware caps) ----------

@app.get("/api/chats")
def list_chats(user: dict = Depends(get_current_user), db=Depends(get_user_db)):
    profile = (
        db.table("profiles")
        .select("*")
        .eq("id", user["id"])
        .maybe_single()
        .execute()
    )
    plan = profile_plan(profile.data)
    result = (
        db.table("chats")
        .select("*")
        .eq("user_id", user["id"])
        .order("updated_at", desc=True)
        .execute()
    )
    return {
        "chats": result.data or [],
        "max_chats": chats_max_for(plan),
        "plan": plan,
    }


@app.post("/api/chats")
def create_chat(user: dict = Depends(get_current_user), db=Depends(get_user_db)):
    profile = (
        db.table("profiles")
        .select("*")
        .eq("id", user["id"])
        .maybe_single()
        .execute()
    )
    plan = profile_plan(profile.data)
    max_chats = chats_max_for(plan)
    existing = (
        db.table("chats")
        .select("id")
        .eq("user_id", user["id"])
        .execute()
    )
    if existing.data and len(existing.data) >= max_chats:
        detail = (
            f"You can have at most {max_chats} chats. "
            "Delete one to make a new chat."
        )
        raise HTTPException(status_code=400, detail=detail)

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
    profile = (
        db.table("profiles")
        .select("*")
        .eq("id", user["id"])
        .maybe_single()
        .execute()
    )
    plan = profile_plan(profile.data)
    return {
        "chat": chat.data,
        "messages": msgs.data or [],
        "max_messages": messages_max_for(plan),
        "plan": plan,
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
    profile = (
        db.table("profiles")
        .select("*")
        .eq("id", user["id"])
        .maybe_single()
        .execute()
    )
    plan = profile_plan(profile.data)
    msg_cap = messages_max_for(plan)
    # each user turn adds 2 messages (user + assistant)
    if count >= msg_cap:
        raise HTTPException(
            status_code=400,
            detail=_chat_message_cap_detail(plan, at_cap=True),
        )
    if count + 2 > msg_cap:
        raise HTTPException(
            status_code=400,
            detail=_chat_message_cap_detail(plan, at_cap=False),
        )

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
    profile = (
        db.table("profiles")
        .select("*")
        .eq("id", user["id"])
        .maybe_single()
        .execute()
    )
    plan = profile_plan(profile.data)
    msg_cap = messages_max_for(plan)
    if count >= msg_cap:
        raise HTTPException(
            status_code=400,
            detail=_chat_message_cap_detail(plan, at_cap=True),
        )
    if count + 2 > msg_cap:
        raise HTTPException(
            status_code=400,
            detail=_chat_message_cap_detail(plan, at_cap=False),
        )

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
def careers_hub(
    force: bool = Query(False),
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    profile = db.table("profiles").select("*").eq("id", user["id"]).maybe_single().execute()
    p = profile.data or {}
    plan = profile_plan(p)
    max_jobs = jobs_max_for(plan)
    cache_ttl = jobs_cache_ttl_for(plan)
    cooldown = jobs_refresh_cooldown_for(plan)
    refresh_wait = _hub_refresh_remaining(user["id"], cooldown)

    want_force = bool(force)
    if want_force and refresh_wait > 0:
        # Free cooldown: never re-scrape — serve cache only
        cached_only = peek_career_hub_jobs(
            p.get("target_roles", ""),
            p.get("locations", ""),
            max_items=max_jobs,
        )
        jobs, from_cache = (cached_only or []), True
    else:
        jobs, from_cache = fetch_career_hub_jobs(
            p.get("target_roles", ""),
            p.get("locations", ""),
            max_items=max_jobs,
            cache_ttl_seconds=cache_ttl,
            force=want_force,
        )
        if not from_cache:
            _mark_hub_refresh(user["id"])
            refresh_wait = cooldown

    saves = (
        db.table("job_saves")
        .select("*")
        .eq("user_id", user["id"])
        .execute()
    )
    saved = saves.data or []
    by_url = {s["url"]: s for s in saved if s.get("url")}

    prefs = {
        "target_roles": p.get("target_roles", ""),
        "locations": p.get("locations", ""),
        "goals": p.get("goals", ""),
    }
    scored = enrich_jobs_with_match_scores(
        jobs,
        user_id=user["id"],
        resume_text=p.get("resume_text") or "",
        prefs=prefs,
    )

    # mark recommended jobs with current save status + AI match %
    enriched = []
    for job in scored:
        url = job.get("url") or ""
        save = by_url.get(url)
        enriched.append({
            **job,
            "saved_status": save["status"] if save else None,
        })

    # Best matches first; null/missing scores last
    enriched = sort_jobs_by_match_score(enriched)

    liked = [s for s in saved if s.get("status") == "liked"]
    applied = [s for s in saved if s.get("status") == "applied"]
    external = [s for s in saved if s.get("status") == "external"]

    return {
        "preferences": prefs,
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
        "limits": {
            "plan": plan,
            "max_jobs": max_jobs,
            "cache_ttl_seconds": cache_ttl,
            "refresh_cooldown_seconds": cooldown,
            "refresh_wait_seconds": refresh_wait,
            "from_cache": from_cache,
            "note": f"Job search limited to {max_jobs} due to cost",
        },
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


# ---------- public try funnel (anonymous, low-cost) ----------

_public_quiz_limiter = IpRateLimiter(PUBLIC_TRY_QUIZ_PER_HOUR, 3600)
_public_results_limiter = IpRateLimiter(PUBLIC_TRY_RESULTS_PER_HOUR, 3600)


class PublicTryQuizBody(BaseModel):
    role: str = "general"


def _enforce_public_limit(limiter: IpRateLimiter, request: Request) -> None:
    ok, detail = limiter.check(client_ip(request))
    if not ok:
        raise HTTPException(status_code=429, detail=detail)


@app.get("/api/public/try/roles")
def public_try_roles():
    return {"roles": list_public_roles()}


@app.post("/api/public/try/quiz")
def public_try_quiz(request: Request, body: PublicTryQuizBody | None = None):
    _enforce_public_limit(_public_quiz_limiter, request)
    role = ((body.role if body else None) or "general").strip() or "general"
    questions, matched = pick_public_quiz(role=role, count=PUBLIC_TRY_QUESTIONS)
    if not questions:
        raise HTTPException(status_code=503, detail="Quiz bank unavailable. Try again later.")
    playable = []
    for i, q in enumerate(questions):
        playable.append({
            "id": i,
            "question": q["question"],
            "options": q["options"],
            "correct_index": q["correct_index"],
            "explanation": q["explanation"],
        })
    return {
        "questions": playable,
        "role": matched,
        "source": "local_bank",
        "count": len(playable),
    }


@app.post("/api/public/try/results")
async def public_try_results(request: Request):
    """
    JSON or multipart. Heuristic resume check only — no LLM.
    Fields: role, quiz_correct, quiz_total, resume_text; optional file field `resume`.
    """
    _enforce_public_limit(_public_results_limiter, request)

    content_type = (request.headers.get("content-type") or "").lower()
    role_val = "general"
    correct = 0
    total = 1
    text = ""

    if "multipart/form-data" in content_type:
        form = await request.form()
        role_val = str(form.get("role") or "general").strip() or "general"
        try:
            correct = int(form.get("quiz_correct") or 0)
        except (TypeError, ValueError):
            correct = 0
        try:
            total = int(form.get("quiz_total") or 1)
        except (TypeError, ValueError):
            total = 1
        text = str(form.get("resume_text") or "").strip()
        upload = form.get("resume")
        if upload is not None and hasattr(upload, "read"):
            data = await upload.read()
            filename = getattr(upload, "filename", "") or ""
            if data and filename:
                if len(data) > PUBLIC_TRY_RESUME_MAX_BYTES:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Resume too large (max {PUBLIC_TRY_RESUME_MAX_BYTES // 1000}KB).",
                    )
                try:
                    extracted = extract_resume_text(filename, data)
                    if extracted:
                        text = extracted
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=str(exc)) from exc
                except Exception:
                    raise HTTPException(
                        status_code=400, detail="Could not read that resume file."
                    ) from None
    else:
        try:
            raw = await request.json()
        except Exception:
            raw = {}
        if not isinstance(raw, dict):
            raw = {}
        role_val = str(raw.get("role") or "general").strip() or "general"
        try:
            correct = int(raw.get("quiz_correct", 0))
        except (TypeError, ValueError):
            correct = 0
        try:
            total = int(raw.get("quiz_total", 1))
        except (TypeError, ValueError):
            total = 1
        text = str(raw.get("resume_text") or "").strip()

    if len(text) > 40_000:
        text = text[:40_000]

    return build_try_results(
        role=role_val,
        quiz_correct=correct,
        quiz_total=total,
        resume_text=text,
    )


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
    plan = profile_plan(p)
    avoid = (body.avoid_questions if body else None) or []
    is_new_round = bool(avoid)
    ok, detail = can_start_quiz(plan, user["id"], is_new_round=is_new_round)
    if not ok:
        raise HTTPException(status_code=403, detail=detail)

    questions = generate_quiz(
        target_roles=p.get("target_roles", ""),
        locations=p.get("locations", ""),
        goals=p.get("goals", ""),
        resume_text=p.get("resume_text", ""),
        count=QUIZ_QUESTIONS_PER_CYCLE,
        avoid_questions=avoid,
    )
    if not questions:
        # one more try without filters if the model mirrored old items
        questions = generate_quiz(
            target_roles=p.get("target_roles", ""),
            locations=p.get("locations", ""),
            goals=p.get("goals", ""),
            resume_text=p.get("resume_text", ""),
            count=QUIZ_QUESTIONS_PER_CYCLE,
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
    used = record_quiz_cycle(user["id"]) if playable else quiz_cycles_used(user["id"])
    max_cycles = quiz_max_cycles(plan)
    remaining = max(0, max_cycles - used)
    return {
        "questions": playable,
        "source": "role_bank_or_model",
        "limits": {
            "plan": plan,
            "cycles_used": used,
            "max_cycles": max_cycles,
            "cycles_remaining": remaining,
            "window_seconds": 3600,
            "reset_in_seconds": quiz_seconds_until_reset(user["id"]),
            "note": f"{max_cycles} quiz cycles per hour",
        },
    }


# ---------- plans (paid tiers TBA) ----------

PLANS = [
    {
        "id": "free",
        "name": "Free",
        "price": "TBA",
        "price_period": "",
        "badge": "TBA",
        "blurb": "Full product access while paid plans are TBA.",
        "features": [
            "2 chats · 30 messages each",
            "Delete a chat to free a slot or reset the message cap",
            "Job search limited to 10 due to cost · refresh once per hour",
            "Interview quiz: 2 cycles per hour",
            "Live PDF resume editor",
        ],
        "restrictions": [],
        "cta": "Coming soon",
        "cta_disabled": True,
        "featured": False,
    },
    {
        "id": "careerexpert",
        "name": "CareerExpert",
        "price": "TBA",
        "price_period": "",
        "badge": "TBA",
        "blurb": "Paid tiers coming soon.",
        "features": ["TBA"],
        "restrictions": [],
        "cta": "Coming soon",
        "cta_disabled": True,
        "featured": True,
    },
    {
        "id": "careerpro",
        "name": "CareerPro",
        "price": "TBA",
        "price_period": "",
        "badge": "TBA",
        "blurb": "Paid tiers coming soon.",
        "features": ["TBA"],
        "restrictions": [],
        "cta": "Coming soon",
        "cta_disabled": True,
        "featured": False,
    },
]


@app.get("/api/plans")
def plans():
    return {
        "tagline": "Paid plans are TBA. Everyone currently gets the full product.",
        "note": (
            "Chat: 2 open chats, 30 messages each. "
            "Jobs: limited to 10 due to cost (refresh once per hour). "
            "Quiz: 2 cycles per hour."
        ),
        "plans": PLANS,
        "checkout_ready": False,
    }


# ---------- Stripe billing (disabled — paid plans TBA) ----------

_STRIPE_TBA = "Billing is TBA. Paid plans are not available yet."


@app.post("/api/stripe/checkout")
def stripe_checkout(
    body: StripeCheckoutBody,
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    raise HTTPException(status_code=503, detail=_STRIPE_TBA)


@app.post("/api/stripe/portal")
def stripe_portal(
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    raise HTTPException(status_code=503, detail=_STRIPE_TBA)


@app.post("/api/stripe/sync")
def stripe_sync(
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    raise HTTPException(status_code=503, detail=_STRIPE_TBA)


@app.get("/api/stripe/debug")
def stripe_debug(
    user: dict = Depends(get_current_user),
    db=Depends(get_user_db),
):
    raise HTTPException(status_code=503, detail=_STRIPE_TBA)


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    return {"ok": True, "ignored": True, "reason": "billing_tba"}


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
