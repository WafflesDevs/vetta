import os
from dotenv import load_dotenv

load_dotenv()


def configure_langsmith() -> None:
    """Wire LangSmith env names so tracing works on local + Render."""
    api_key = os.getenv("LANGSMITH_API_KEY") or os.getenv("LANGCHAIN_API_KEY") or ""
    project = os.getenv("LANGSMITH_PROJECT") or os.getenv("LANGCHAIN_PROJECT") or "vetta"
    tracing = (
        os.getenv("LANGSMITH_TRACING")
        or os.getenv("LANGCHAIN_TRACING_V2")
        or "false"
    ).strip().lower()

    if api_key:
        os.environ["LANGSMITH_API_KEY"] = api_key
        os.environ["LANGCHAIN_API_KEY"] = api_key

    os.environ["LANGSMITH_PROJECT"] = project
    os.environ["LANGCHAIN_PROJECT"] = project

    enabled = tracing in ("1", "true", "yes", "on")
    os.environ["LANGSMITH_TRACING"] = "true" if enabled else "false"
    os.environ["LANGCHAIN_TRACING_V2"] = "true" if enabled else "false"


configure_langsmith()

ENV = os.getenv("ENV", "development").strip().lower()
IS_PROD = ENV in ("production", "prod")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SECRET_KEY = (
    os.getenv("SUPABASE_SECRET_KEY", "")
    or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
)

# Password reset email redirect (e.g. http://localhost:5173/reset-password).
# If empty, forgot-password uses the request Origin + /reset-password.
PASSWORD_RESET_REDIRECT_URL = os.getenv("PASSWORD_RESET_REDIRECT_URL", "").strip()

# Stripe (keys + price IDs live in .env only)
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRODUCT_EXPERT = os.getenv("STRIPE_PRODUCT_EXPERT", "")
STRIPE_PRODUCT_PRO = os.getenv("STRIPE_PRODUCT_PRO", "")
STRIPE_PRICE_EXPERT = os.getenv("STRIPE_PRICE_EXPERT", "")
STRIPE_PRICE_PRO = os.getenv("STRIPE_PRICE_PRO", "")
# Public app origin for Checkout / Customer Portal redirects (e.g. http://localhost:5173)
APP_URL = (
    os.getenv("APP_URL", "")
    or os.getenv("FRONTEND_URL", "")
    or "http://localhost:5173"
).strip().rstrip("/")

# Chat limits (same for everyone — paid plans TBA)
MAX_CHATS = int(os.getenv("MAX_CHATS", "2"))
MAX_MESSAGES_PER_CHAT = int(os.getenv("MAX_MESSAGES_PER_CHAT", "30"))
# Legacy env aliases (ignored for gating; kept so old deploys don't break)
MAX_CHATS_EXPERT = int(os.getenv("MAX_CHATS_EXPERT", str(MAX_CHATS)))
MAX_CHATS_PRO = int(os.getenv("MAX_CHATS_PRO", str(MAX_CHATS)))
MAX_MESSAGES_EXPERT = int(os.getenv("MAX_MESSAGES_EXPERT", str(MAX_MESSAGES_PER_CHAT)))
MAX_MESSAGES_PRO = int(os.getenv("MAX_MESSAGES_PRO", str(MAX_MESSAGES_PER_CHAT)))

# Jobs hub — capped for cost (same for everyone; paid plans TBA)
JOBS_MAX_ITEMS = int(os.getenv("JOBS_MAX_ITEMS", "10"))
JOBS_MAX_ITEMS_FREE = int(os.getenv("JOBS_MAX_ITEMS_FREE", str(JOBS_MAX_ITEMS)))
JOBS_MAX_ITEMS_EXPERT = int(os.getenv("JOBS_MAX_ITEMS_EXPERT", str(JOBS_MAX_ITEMS)))
JOBS_MAX_ITEMS_PRO = int(os.getenv("JOBS_MAX_ITEMS_PRO", str(JOBS_MAX_ITEMS)))
JOBS_CACHE_TTL_SECONDS = int(os.getenv("JOBS_CACHE_TTL_SECONDS", str(60 * 60)))
JOBS_CACHE_TTL_FREE_SECONDS = int(
    os.getenv("JOBS_CACHE_TTL_FREE_SECONDS", str(JOBS_CACHE_TTL_SECONDS))
)
JOBS_CACHE_TTL_PAID_SECONDS = int(
    os.getenv("JOBS_CACHE_TTL_PAID_SECONDS", str(JOBS_CACHE_TTL_SECONDS))
)
# Force refresh at most once per hour
JOBS_REFRESH_COOLDOWN_SECONDS = int(
    os.getenv("JOBS_REFRESH_COOLDOWN_SECONDS", str(60 * 60))
)
JOBS_REFRESH_COOLDOWN_FREE_SECONDS = int(
    os.getenv("JOBS_REFRESH_COOLDOWN_FREE_SECONDS", str(JOBS_REFRESH_COOLDOWN_SECONDS))
)
# AI match % cache (user + job url + resume/prefs fingerprint)
JOBS_MATCH_CACHE_TTL_SECONDS = int(
    os.getenv("JOBS_MATCH_CACHE_TTL_SECONDS", str(6 * 60 * 60))
)
# Cap how many hub jobs get AI match scores per request (rest stay unscored)
JOBS_MATCH_SCORE_MAX = int(os.getenv("JOBS_MATCH_SCORE_MAX", "25"))

# Interview quiz — 2 cycles per rolling hour
QUIZ_MAX_CYCLES_PER_HOUR = int(os.getenv("QUIZ_MAX_CYCLES_PER_HOUR", "2"))
# Legacy alias
QUIZ_MAX_CYCLES_FREE = int(os.getenv("QUIZ_MAX_CYCLES_FREE", str(QUIZ_MAX_CYCLES_PER_HOUR)))
QUIZ_QUESTIONS_PER_CYCLE = int(os.getenv("QUIZ_QUESTIONS_PER_CYCLE", "5"))
QUIZ_CYCLE_WINDOW_SECONDS = int(os.getenv("QUIZ_CYCLE_WINDOW_SECONDS", str(60 * 60)))

# Public lead-gen try funnel (anonymous, bank-only — no LLM)
PUBLIC_TRY_QUESTIONS = int(os.getenv("PUBLIC_TRY_QUESTIONS", "4"))
PUBLIC_TRY_QUIZ_PER_HOUR = int(os.getenv("PUBLIC_TRY_QUIZ_PER_HOUR", "10"))
PUBLIC_TRY_RESULTS_PER_HOUR = int(os.getenv("PUBLIC_TRY_RESULTS_PER_HOUR", "20"))
PUBLIC_TRY_RESUME_MAX_BYTES = int(os.getenv("PUBLIC_TRY_RESUME_MAX_BYTES", str(1_000_000)))

# Anthropic (Claude) — primary LLM provider
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
if ANTHROPIC_API_KEY:
    # Keep process env in sync so SDKs that read os.environ also work.
    os.environ["ANTHROPIC_API_KEY"] = ANTHROPIC_API_KEY


def anthropic_api_key() -> str:
    """Fresh Anthropic key (re-reads env so reloads / late dotenv still work)."""
    key = (os.getenv("ANTHROPIC_API_KEY") or ANTHROPIC_API_KEY or "").strip()
    if key:
        os.environ["ANTHROPIC_API_KEY"] = key
    return key


def require_anthropic_api_key() -> str:
    key = anthropic_api_key()
    if not key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is missing. Add it to .env (local) or Render env vars, then restart the API."
        )
    return key


# Agent / generation cost knobs (Claude models)
AGENT_MODEL = os.getenv("AGENT_MODEL", "claude-sonnet-4-5")
RESUME_EDIT_MODEL = os.getenv("RESUME_EDIT_MODEL", AGENT_MODEL)
# Cheap model for hub batch / single job match scoring
MATCH_SCORE_MODEL = os.getenv("MATCH_SCORE_MODEL", "claude-haiku-4-5")
AGENT_HISTORY_TURNS = int(os.getenv("AGENT_HISTORY_TURNS", "8"))
RESUME_PREVIEW_CHARS = int(os.getenv("RESUME_PREVIEW_CHARS", "1500"))
RESUME_TOOL_CHARS = int(os.getenv("RESUME_TOOL_CHARS", "3500"))
AGENT_MAX_TOKENS = int(os.getenv("AGENT_MAX_TOKENS", "900"))

ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if o.strip()
]


def missing_required_env() -> list[str]:
    needed = ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"]
    return [k for k in needed if not os.getenv(k)]
