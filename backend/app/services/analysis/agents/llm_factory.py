"""Agnostic LLM Provider supporting Gemini, OpenAI, Anthropic, and Ollama."""
import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Optional
import requests

from app.config import settings
from app.i18n import translate_locale

logger = logging.getLogger(__name__)


class BaseChatClient(ABC):
    """Abstract chat client interface."""

    @abstractmethod
    def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        pass


class MockChatClient(BaseChatClient):
    """Deterministic mock client for tests and dry runs."""

    def __init__(self, responses: Optional[dict[str, str]] = None, language: str = "en"):
        self.responses = responses or {}
        self.call_history: list[dict[str, str]] = []
        self.language = "it" if str(language).lower().startswith("it") else "en"

    def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        self.call_history.append({"system": system_prompt, "user": user_prompt})
        for key, resp in self.responses.items():
            if key.lower() in system_prompt.lower() or key.lower() in user_prompt.lower():
                return resp
        if self.language == "it":
            return "Report sintetico generato in modalità test (Mock)."
        return "Synthetic report generated in test (Mock) mode."


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
            "HTTP-Referer": "https://tradingjournal.local",
            "X-Title": "Trading Journal",
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
    language: str = "en",
) -> BaseChatClient:
    """Agnostic factory returning the configured Chat Client."""
    prov = (provider or settings.analysis_llm_provider).lower()
    mod = model or settings.analysis_llm_model
    key = api_key or settings.analysis_api_key
    b_url = base_url or settings.analysis_base_url

    if prov == "mock":
        return MockChatClient(language=language)

    if prov == "gemini":
        if not key:
            logger.warning("Gemini API key is not set; falling back to MockChatClient")
            return MockChatClient(language=language)
        return GeminiChatClient(api_key=key, model=mod)

    elif prov == "anthropic":
        if not key:
            logger.warning("Anthropic API key is not set; falling back to MockChatClient")
            return MockChatClient(language=language)
        return AnthropicChatClient(api_key=key, model=mod)

    elif prov == "ollama":
        ollama_url = b_url or "http://localhost:11434/v1"
        return OpenAIChatClient(api_key="ollama", model=mod or "llama3.2", base_url=ollama_url)

    elif prov == "openai":
        if not key:
            logger.warning("OpenAI API key is not set; falling back to MockChatClient")
            return MockChatClient(language=language)
        return OpenAIChatClient(api_key=key, model=mod, base_url=b_url)

    elif prov == "openrouter":
        if not key:
            logger.warning("OpenRouter API key is not set; falling back to MockChatClient")
            return MockChatClient(language=language)
        openrouter_url = b_url or "https://openrouter.ai/api/v1"
        return OpenAIChatClient(api_key=key, model=mod, base_url=openrouter_url)

    # Default fallback
    return MockChatClient(language=language)


def get_user_llm_client(
    user_llm_config: Optional[dict[str, Any]] = None, language: str = "en"
) -> BaseChatClient:
    """Return LLM client resolved from user preferences or global settings."""
    if user_llm_config and isinstance(user_llm_config, dict):
        provider = user_llm_config.get("provider")
        model = user_llm_config.get("model")
        api_key = user_llm_config.get("api_key")
        base_url = user_llm_config.get("base_url")
        return get_llm_client(
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
            language=language,
        )

    return get_llm_client()


def test_llm_connection(
    provider: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    locale: str = "en",
) -> tuple[bool, Optional[int], str, Optional[str]]:
    """
    Test real-time connectivity and credentials for an LLM provider.
    Returns (success, latency_ms, message, error_message).
    """
    prov = (provider or "mock").strip().lower()
    t_start = time.perf_counter()

    def _tr(key: str, **kwargs: Any) -> str:
        return translate_locale(locale, key, **kwargs)

    if prov == "mock":
        latency_ms = max(1, int((time.perf_counter() - t_start) * 1000))
        return True, latency_ms, _tr("test.mock_ready"), None

    effective_key = (api_key or "").strip() or settings.analysis_api_key

    try:
        if prov == "gemini":
            if not effective_key:
                return False, None, _tr("test.connection_failed"), _tr("test.missing_api_key", provider="Google Gemini")
            eff_model = (model or settings.analysis_llm_model or "").strip().replace("models/", "")
            if not eff_model:
                return False, None, _tr("test.connection_failed"), _tr("test.missing_model")
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/{eff_model}:generateContent"
                f"?key={effective_key}"
            )
            payload = {
                "contents": [{"role": "user", "parts": [{"text": "Ping"}]}],
                "generationConfig": {"maxOutputTokens": 5, "temperature": 0.1},
            }
            resp = requests.post(url, json=payload, timeout=12)
            latency_ms = int((time.perf_counter() - t_start) * 1000)
            if resp.status_code == 200:
                return True, latency_ms, _tr("test.success", provider="Gemini", model=eff_model), None
            else:
                err_detail = resp.text[:200]
                try:
                    err_json = resp.json()
                    err_detail = err_json.get("error", {}).get("message", err_detail)
                except Exception:
                    pass
                return False, latency_ms, _tr("test.api_error", provider="Gemini"), f"HTTP {resp.status_code}: {err_detail}"

        elif prov == "openai":
            if not effective_key:
                return False, None, _tr("test.connection_failed"), _tr("test.missing_api_key", provider="OpenAI")
            eff_model = (model or settings.analysis_llm_model or "").strip()
            if not eff_model:
                return False, None, _tr("test.connection_failed"), _tr("test.missing_model")
            eff_base_url = (base_url or settings.analysis_base_url or "https://api.openai.com/v1").rstrip("/")
            url = f"{eff_base_url}/chat/completions"
            headers = {
                "Authorization": f"Bearer {effective_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": eff_model,
                "messages": [{"role": "user", "content": "Ping"}],
                "max_tokens": 5,
            }
            resp = requests.post(url, headers=headers, json=payload, timeout=12)
            latency_ms = int((time.perf_counter() - t_start) * 1000)
            if resp.status_code == 200:
                return True, latency_ms, _tr("test.success", provider="OpenAI", model=eff_model), None
            else:
                err_detail = resp.text[:200]
                try:
                    err_json = resp.json()
                    err_detail = err_json.get("error", {}).get("message", err_detail)
                except Exception:
                    pass
                return False, latency_ms, _tr("test.api_error", provider="OpenAI"), f"HTTP {resp.status_code}: {err_detail}"

        elif prov == "anthropic":
            if not effective_key:
                return False, None, _tr("test.connection_failed"), _tr("test.missing_api_key", provider="Anthropic")
            eff_model = (model or settings.analysis_llm_model or "").strip()
            if not eff_model:
                return False, None, _tr("test.connection_failed"), _tr("test.missing_model")
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "x-api-key": effective_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
            payload = {
                "model": eff_model,
                "messages": [{"role": "user", "content": "Ping"}],
                "max_tokens": 5,
            }
            resp = requests.post(url, headers=headers, json=payload, timeout=12)
            latency_ms = int((time.perf_counter() - t_start) * 1000)
            if resp.status_code == 200:
                return True, latency_ms, _tr("test.success", provider="Anthropic", model=eff_model), None
            else:
                err_detail = resp.text[:200]
                try:
                    err_json = resp.json()
                    err_detail = err_json.get("error", {}).get("message", err_detail)
                except Exception:
                    pass
                return False, latency_ms, _tr("test.api_error", provider="Anthropic"), f"HTTP {resp.status_code}: {err_detail}"

        elif prov == "ollama":
            eff_base_url = (base_url or settings.analysis_base_url or "http://localhost:11434").rstrip("/")
            # Remove trailing /v1 if present for tags check
            root_url = eff_base_url[:-3] if eff_base_url.endswith("/v1") else eff_base_url
            tags_url = f"{root_url}/api/tags"
            resp = requests.get(tags_url, timeout=6)
            latency_ms = int((time.perf_counter() - t_start) * 1000)
            if resp.status_code == 200:
                return True, latency_ms, _tr("test.success_ollama", url=root_url), None
            else:
                return False, latency_ms, _tr("test.ollama_error"), f"HTTP {resp.status_code}: {resp.text[:200]}"

        elif prov == "openrouter":
            if not effective_key:
                return False, None, _tr("test.connection_failed"), _tr("test.missing_api_key", provider="OpenRouter")
            eff_model = (model or settings.analysis_llm_model or "").strip()
            if not eff_model:
                return False, None, _tr("test.connection_failed"), _tr("test.missing_model")
            eff_base_url = (base_url or settings.analysis_base_url or "https://openrouter.ai/api/v1").rstrip("/")
            url = f"{eff_base_url}/chat/completions"
            headers = {
                "Authorization": f"Bearer {effective_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://tradingjournal.local",
                "X-Title": "Trading Journal",
            }
            payload = {
                "model": eff_model,
                "messages": [{"role": "user", "content": "Ping"}],
                "max_tokens": 5,
            }
            resp = requests.post(url, headers=headers, json=payload, timeout=12)
            latency_ms = int((time.perf_counter() - t_start) * 1000)
            if resp.status_code == 200:
                return True, latency_ms, _tr("test.success", provider="OpenRouter", model=eff_model), None
            else:
                err_detail = resp.text[:200]
                try:
                    err_json = resp.json()
                    err_detail = err_json.get("error", {}).get("message", err_detail)
                except Exception:
                    pass
                return False, latency_ms, _tr("test.api_error", provider="OpenRouter"), f"HTTP {resp.status_code}: {err_detail}"

        else:
            return False, None, _tr("test.unsupported_provider"), _tr("test.unknown_provider", provider=provider)

    except requests.exceptions.ConnectionError as err:
        return False, None, _tr("test.connection_error"), _tr("test.host_unreachable", detail=str(err)[:200])
    except requests.exceptions.Timeout:
        return False, None, _tr("test.timeout"), _tr("test.timeout_detail")
    except Exception as exc:
        return False, None, _tr("test.unexpected_error"), str(exc)[:250]
