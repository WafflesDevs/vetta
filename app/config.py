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

# Stripe (keys live in .env only; checkout not wired yet)
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "")

# Free-tier product limits (matches Free plan on /pricing)
MAX_CHATS = int(os.getenv("MAX_CHATS", "1"))
MAX_MESSAGES_PER_CHAT = int(os.getenv("MAX_MESSAGES_PER_CHAT", "60"))

# Jobs hub — plan-aware page size + scrape cache
JOBS_MAX_ITEMS = int(os.getenv("JOBS_MAX_ITEMS", "200"))  # Pro default / legacy
JOBS_MAX_ITEMS_FREE = int(os.getenv("JOBS_MAX_ITEMS_FREE", "5"))
JOBS_MAX_ITEMS_EXPERT = int(os.getenv("JOBS_MAX_ITEMS_EXPERT", "120"))
JOBS_MAX_ITEMS_PRO = int(os.getenv("JOBS_MAX_ITEMS_PRO", str(JOBS_MAX_ITEMS)))
JOBS_CACHE_TTL_SECONDS = int(os.getenv("JOBS_CACHE_TTL_SECONDS", str(60 * 60)))
JOBS_CACHE_TTL_FREE_SECONDS = int(
    os.getenv("JOBS_CACHE_TTL_FREE_SECONDS", str(6 * 60 * 60))
)
JOBS_CACHE_TTL_PAID_SECONDS = int(
    os.getenv("JOBS_CACHE_TTL_PAID_SECONDS", str(30 * 60))
)
JOBS_REFRESH_COOLDOWN_FREE_SECONDS = int(
    os.getenv("JOBS_REFRESH_COOLDOWN_FREE_SECONDS", str(60 * 60))
)
# AI match % cache (user + job url + resume/prefs fingerprint)
JOBS_MATCH_CACHE_TTL_SECONDS = int(
    os.getenv("JOBS_MATCH_CACHE_TTL_SECONDS", str(6 * 60 * 60))
)
# Cap how many hub jobs get AI match scores per request (rest stay unscored)
JOBS_MATCH_SCORE_MAX = int(os.getenv("JOBS_MATCH_SCORE_MAX", "25"))

# Interview quiz
QUIZ_MAX_CYCLES_FREE = int(os.getenv("QUIZ_MAX_CYCLES_FREE", "1"))
QUIZ_QUESTIONS_PER_CYCLE = int(os.getenv("QUIZ_QUESTIONS_PER_CYCLE", "5"))

# Public lead-gen try funnel (anonymous, bank-only — no LLM)
PUBLIC_TRY_QUESTIONS = int(os.getenv("PUBLIC_TRY_QUESTIONS", "4"))
PUBLIC_TRY_QUIZ_PER_HOUR = int(os.getenv("PUBLIC_TRY_QUIZ_PER_HOUR", "10"))
PUBLIC_TRY_RESULTS_PER_HOUR = int(os.getenv("PUBLIC_TRY_RESULTS_PER_HOUR", "20"))
PUBLIC_TRY_RESUME_MAX_BYTES = int(os.getenv("PUBLIC_TRY_RESUME_MAX_BYTES", str(1_000_000)))

# Anthropic (Claude) — primary LLM provider
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

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
