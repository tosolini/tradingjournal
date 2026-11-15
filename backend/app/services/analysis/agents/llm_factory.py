"""Agnostic LLM Provider supporting Gemini, OpenAI, Anthropic, and Ollama."""
import json
import logging
from abc import ABC, abstractmethod
from typing import Optional
import requests

from app.config import settings

logger = logging.getLogger(__name__)


class BaseChatClient(ABC):
    """Abstract chat client interface."""

    @abstractmethod
    def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        pass


class MockChatClient(BaseChatClient):
    """Deterministic mock client for tests and dry runs."""

    def __init__(self, responses: Optional[dict[str, str]] = None):
        self.responses = responses or {}
        self.call_history: list[dict[str, str]] = []

    def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        self.call_history.append({"system": system_prompt, "user": user_prompt})
        for key, resp in self.responses.items():
            if key.lower() in system_prompt.lower() or key.lower() in user_prompt.lower():
                return resp
        return "Report sintetico generato in modalità test (Mock)."


class OpenAIChatClient(BaseChatClient):
    """Client for OpenAI and any OpenAI-compatible API (Ollama, Groq, OpenRouter)."""

    def __init__(self, api_key: str, model: str, base_url: Optional[str] = None):
        self.api_key = api_key or "no-key"
        self.model = model
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")

    def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


class GeminiChatClient(BaseChatClient):
    """Native Gemini REST Client."""

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        # Clean model name if passed with prefix
        self.model = model.replace("models/", "")

    def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        # Use Google Gemini's OpenAI-compatible endpoint or native generateContent
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
            f"?key={self.api_key}"
        )
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\nUSER INPUT:\n{user_prompt}"}]}
            ],
            "generationConfig": {
                "temperature": temperature,
            },
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            return "Nessuna risposta ricevuta dal modello."
        return candidates[0]["content"]["parts"][0]["text"]


class AnthropicChatClient(BaseChatClient):
    """Client for Anthropic Claude messages API."""

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
        }
        payload = {
            "model": self.model,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
            "max_tokens": 4096,
            "temperature": temperature,
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        return data["content"][0]["text"]


def get_llm_client(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> BaseChatClient:
    """Agnostic factory returning the configured Chat Client."""
    prov = (provider or settings.analysis_llm_provider).lower()
    mod = model or settings.analysis_llm_model
    key = api_key or settings.analysis_api_key
    b_url = base_url or settings.analysis_base_url

    if prov == "mock":
        return MockChatClient()

    if prov == "gemini":
        if not key:
            logger.warning("Gemini API key is not set; falling back to MockChatClient")
            return MockChatClient()
        return GeminiChatClient(api_key=key, model=mod)

    elif prov == "anthropic":
        if not key:
            logger.warning("Anthropic API key is not set; falling back to MockChatClient")
            return MockChatClient()
        return AnthropicChatClient(api_key=key, model=mod)

    elif prov == "ollama":
        ollama_url = b_url or "http://localhost:11434/v1"
        return OpenAIChatClient(api_key="ollama", model=mod or "llama3.2", base_url=ollama_url)

    elif prov == "openai":
        if not key:
            logger.warning("OpenAI API key is not set; falling back to MockChatClient")
            return MockChatClient()
        return OpenAIChatClient(api_key=key, model=mod, base_url=b_url)

    # Default fallback
    return MockChatClient()
