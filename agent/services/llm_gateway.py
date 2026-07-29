"""
LLM Gateway — provider-agnostic abstraction.

Switch providers by changing LLM_PROVIDER in .env:
  LLM_PROVIDER=gemini       → Google Gemini Flash via langchain-google-genai
  LLM_PROVIDER=openrouter   → OpenRouter (OpenAI-compatible) via langchain-openai
  LLM_PROVIDER=ollama       → local Ollama model (zero-cost dev/testing)

No code changes needed to switch — only the env var.
"""
from functools import lru_cache
from langchain_core.language_models import BaseChatModel
from config import settings


@lru_cache(maxsize=1)
def get_llm() -> BaseChatModel:
    if settings.LLM_PROVIDER == "ollama":
        from langchain_community.chat_models import ChatOllama
        return ChatOllama(
            model=settings.OLLAMA_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
        )

    if settings.LLM_PROVIDER == "openrouter":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.OPENROUTER_MODEL,
            api_key=settings.OPENROUTER_API_KEY,
            base_url="https://openrouter.ai/api/v1",
            temperature=0.1,
            default_headers={
                "HTTP-Referer": "http://localhost:4000",
                "X-Title": "Enterprise AI Workflow Platform",
            },
        )

    # Default: Gemini
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(
        model=settings.GEMINI_MODEL,
        google_api_key=settings.GEMINI_API_KEY,
        temperature=0.1,
    )
