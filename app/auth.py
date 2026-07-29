"""
Helpers for auth and reading the current user from the request.
"""
from fastapi import Depends, HTTPException, Header
from supabase import Client
from app.db import get_anon_client, client_for_user


def get_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please log in.")
    return authorization.replace("Bearer ", "").strip()


def get_current_user(token: str = Depends(get_token)) -> dict:
    """Check the JWT with Supabase and return the user dict."""
    client = get_anon_client()
    try:
        result = client.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired login.")

    user = result.user
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired login.")

    return {
        "id": user.id,
        "email": user.email,
        "token": token,
    }


def get_user_db(user: dict = Depends(get_current_user)) -> Client:
    """Supabase client scoped to this logged-in user."""
    return client_for_user(user["token"])
