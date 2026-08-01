from pydantic_settings import BaseSettings


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
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # Ollama (local)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"

    model_config = {"env_file": ".env"}


settings = Settings()
