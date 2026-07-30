from supabase import create_client, Client
from app.config import SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY


def get_anon_client() -> Client:
    """Normal client — signup/login and checking tokens."""
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def get_admin_client() -> Client:
    """Service-role / secret key client — bypasses RLS for plan sync writes."""
    if not SUPABASE_SECRET_KEY:
        raise RuntimeError(
            "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is required for "
            "server-side profiles.plan writes. The anon key is blocked by RLS."
        )
    return create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)


def client_for_user(access_token: str) -> Client:
    """Talk to the DB as the logged-in user so RLS rules apply."""
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client
