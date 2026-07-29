from supabase import create_client, Client
from app.config import SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY


def get_anon_client() -> Client:
    """Normal client — signup/login and checking tokens."""
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def get_admin_client() -> Client:
    """Server client using the secret key (if you have one)."""
    key = SUPABASE_SECRET_KEY or SUPABASE_ANON_KEY
    return create_client(SUPABASE_URL, key)


def client_for_user(access_token: str) -> Client:
    """Talk to the DB as the logged-in user so RLS rules apply."""
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client
