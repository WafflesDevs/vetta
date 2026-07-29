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

# Free-tier product limits
MAX_CHATS = int(os.getenv("MAX_CHATS", "2"))
MAX_MESSAGES_PER_CHAT = int(os.getenv("MAX_MESSAGES_PER_CHAT", "30"))

# Jobs hub (cache hard + modest page size)
JOBS_MAX_ITEMS = int(os.getenv("JOBS_MAX_ITEMS", "25"))
JOBS_CACHE_TTL_SECONDS = int(os.getenv("JOBS_CACHE_TTL_SECONDS", str(60 * 60)))

# Agent cost knobs
AGENT_MODEL = os.getenv("AGENT_MODEL", "gpt-4o-mini")
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
    needed = ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"]
    return [k for k in needed if not os.getenv(k)]
