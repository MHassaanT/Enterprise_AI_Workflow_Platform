from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PORT: int = 8000
    BACKEND_URL: str = "http://localhost:4000"
    INTERNAL_SERVICE_TOKEN: str = "internal_secret_change_in_production"

    # LLM Gateway — "gemini" | "openrouter" | "ollama"
    LLM_PROVIDER: str = "gemini"

    # Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # OpenRouter (OpenAI-compatible)
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "google/gemini-2.0-flash-exp:free"

    # Ollama (local)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"

    model_config = {"env_file": ".env"}


settings = Settings()
