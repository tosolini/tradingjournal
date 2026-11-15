"""Unit tests for user LLM settings and connection testing."""
from unittest.mock import patch, MagicMock
import pytest

from app.api.analysis import test_llm_endpoint as execute_test_endpoint
from app.models import User
from app.schemas import TestLlmRequest
from app.services.analysis.agents.llm_factory import (
    MockChatClient,
    OpenAIChatClient,
    GeminiChatClient,
    get_user_llm_client,
    test_llm_connection as execute_test_connection,
)


@pytest.fixture
def test_user():
    return User(
        id=1,
        email="test_analyst@example.com",
        username="test_analyst",
        preferences={},
    )


def test_get_user_llm_client_mock():
    client = get_user_llm_client({"provider": "mock"})
    assert isinstance(client, MockChatClient)


def test_get_user_llm_client_openai():
    client = get_user_llm_client({
        "provider": "openai",
        "model": "gpt-4o",
        "api_key": "sk-test12345",
        "base_url": "https://api.openai.com/v1"
    })
    assert isinstance(client, OpenAIChatClient)
    assert client.model == "gpt-4o"
    assert client.api_key == "sk-test12345"


def test_get_user_llm_client_openrouter():
    client = get_user_llm_client({
        "provider": "openrouter",
        "model": "deepseek/deepseek-r1",
        "api_key": "sk-or-v1-test",
    })
    assert isinstance(client, OpenAIChatClient)
    assert client.model == "deepseek/deepseek-r1"
    assert client.api_key == "sk-or-v1-test"
    assert client.base_url == "https://openrouter.ai/api/v1"


def test_get_user_llm_client_gemini():
    client = get_user_llm_client({
        "provider": "gemini",
        "model": "gemini-1.5-pro",
        "api_key": "test-gemini-key",
    })
    assert isinstance(client, GeminiChatClient)
    assert client.model == "gemini-1.5-pro"
    assert client.api_key == "test-gemini-key"


def test_connectivity_mock():
    success, latency, message, err = execute_test_connection(provider="mock")
    assert success is True
    assert latency is not None
    assert "Mock" in message
    assert err is None


def test_connectivity_gemini_missing_key():
    with patch("app.services.analysis.agents.llm_factory.settings.analysis_api_key", ""):
        success, latency, message, err = execute_test_connection(provider="gemini", api_key="")
        assert success is False
        assert "mancante" in (err or "").lower()


def test_connectivity_gemini_missing_model():
    with patch("app.services.analysis.agents.llm_factory.settings.analysis_llm_model", ""):
        success, latency, message, err = execute_test_connection(
            provider="gemini",
            api_key="valid-key",
            model=""
        )
        assert success is False
        assert "modello" in (err or "").lower()


def test_connectivity_gemini_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"candidates": [{"content": {"parts": [{"text": "Pong"}]}}]}

    with patch("requests.post", return_value=mock_resp):
        success, latency, message, err = execute_test_connection(
            provider="gemini",
            model="gemini-2.5-flash",
            api_key="valid-test-key"
        )
        assert success is True
        assert latency is not None
        assert "Gemini" in message
        assert err is None


def test_connectivity_openrouter_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"choices": [{"message": {"content": "Pong"}}]}

    with patch("requests.post", return_value=mock_resp) as mock_post:
        success, latency, message, err = execute_test_connection(
            provider="openrouter",
            model="meta-llama/llama-3.3-70b-instruct",
            api_key="sk-or-test"
        )
        assert success is True
        assert latency is not None
        assert "OpenRouter" in message
        assert err is None
        # Check HTTP-Referer and X-Title were included
        call_headers = mock_post.call_args[1]["headers"]
        assert call_headers["HTTP-Referer"] == "https://tradingjournal.local"
        assert call_headers["Authorization"] == "Bearer sk-or-test"


def test_api_endpoint_mock(test_user):
    req_mock = TestLlmRequest(provider="mock")
    res_mock = execute_test_endpoint(payload=req_mock, current_user=test_user)
    assert res_mock.success is True
    assert res_mock.latency_ms is not None

    req_unknown = TestLlmRequest(provider="non-existent-provider")
    res_unknown = execute_test_endpoint(payload=req_unknown, current_user=test_user)
    assert res_unknown.success is False
    assert "non supportato" in res_unknown.message.lower()


def test_api_endpoint_fallback_to_user_preferences(test_user):
    test_user.preferences = {
        "llm_config": {
            "provider": "openai",
            "model": "gpt-4o",
            "api_key": "user-saved-key",
        }
    }
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"choices": [{"message": {"content": "pong"}}]}

    with patch("requests.post", return_value=mock_resp) as mock_post:
        req = TestLlmRequest(provider="openai", model="gpt-4o", api_key="")
        res = execute_test_endpoint(payload=req, current_user=test_user)
        assert res.success is True
        mock_post.assert_called_once()
        call_headers = mock_post.call_args[1]["headers"]
        assert call_headers["Authorization"] == "Bearer user-saved-key"
