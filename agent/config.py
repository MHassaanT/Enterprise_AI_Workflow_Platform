import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)


class Settings(BaseSettings):
    PORT: int = 8000
    BACKEND_URL: str = "http://localhost:4000"
    INTERNAL_SERVICE_TOKEN: str = "internal_secret_change_in_production"
    DATABASE_URL: str = "postgresql://hassan:zareaai123@localhost:5432/ai_platform"
    ENCRYPTION_KEY: str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

    # LLM Gateway — "openrouter" | "gemini" | "ollama"
    LLM_PROVIDER: str = "openrouter"

    # OpenRouter (OpenAI-compatible)
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "openai/gpt-4o-mini"

    # Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # Ollama (local)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"

    # Search API (Serper.dev) — used for B2B company discovery in Sales Agent
    SERPER_API_KEY: str = ""

    # ZeroBounce API — used for email verifier fallback when Port 25 fails
    ZEROBOUNCE_API_KEY: str = ""

    model_config = {"env_file": env_path, "extra": "ignore"}


settings = Settings()

