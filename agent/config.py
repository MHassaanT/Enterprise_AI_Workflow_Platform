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

    # LLM Gateway — "gemini" | "openrouter" | "ollama"
    LLM_PROVIDER: str = "gemini"

    # OpenRouter (OpenAI-compatible)
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "openai/gpt-4o-mini"

    # Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # Google Places API (New)
    GOOGLE_PLACES_API_KEY: str = ""
    GOOGLE_PLACES_API: str = ""

    # Ollama (local)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"

    # Search API (Serper.dev) — fallback for Places discovery
    SERPER_API_KEY: str = ""

    # SafePay Gateway
    SAFEPAY_ENVIRONMENT: str = "sandbox"
    SAFEPAY_API_KEY: str = ""
    SAFEPAY_V1_SECRET: str = ""
    SAFEPAY_WEBHOOK_SECRET: str = ""

    @property
    def places_api_key(self) -> str:
        return self.GOOGLE_PLACES_API_KEY or self.GOOGLE_PLACES_API or self.GEMINI_API_KEY

    model_config = {"env_file": env_path, "extra": "ignore"}


settings = Settings()

