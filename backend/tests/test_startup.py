from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import inspect

import app.main
from app.llm.fake import FakeLLM
from app.llm.gateway import OpenAICompatibleLLM
from app.main import app as fastapi_app


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Use a throwaway database and env file; never the real backend/.env."""
    monkeypatch.setattr(app.main, "DB_PATH", tmp_path / "data" / "app.db")
    monkeypatch.delenv("LLM_MODE", raising=False)
    use_env(tmp_path, monkeypatch, "LLM_MODE=fake\n")


def use_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, text: str) -> None:
    env = tmp_path / ".env"
    env.write_text(text)
    monkeypatch.setattr(app.main, "ENV_FILE_PATH", env)


def test_starting_twice_creates_the_database_and_keeps_it(tmp_path: Path) -> None:
    for _ in range(2):
        with TestClient(fastapi_app) as client:
            assert client.get("/api/health").status_code == 200
            tables = set(inspect(fastapi_app.state.engine).get_table_names())

    assert (tmp_path / "data" / "app.db").exists()
    assert {"challenge", "round"} <= tables


def test_fake_mode_starts_with_the_fake_llm() -> None:
    with TestClient(fastapi_app):
        assert isinstance(fastapi_app.state.llm, FakeLLM)


def test_real_mode_starts_with_the_gateway_llm(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    use_env(tmp_path, monkeypatch, "LLM_BASE_URL=http://g.test/v1\nLLM_API_KEY=k\nLLM_MODEL=m\n")

    with TestClient(fastapi_app):
        assert isinstance(fastapi_app.state.llm, OpenAICompatibleLLM)


def test_real_mode_refuses_to_start_without_gateway_settings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    use_env(tmp_path, monkeypatch, "LLM_MODE=real\n")

    with (
        pytest.raises(ValidationError, match="LLM_BASE_URL, LLM_API_KEY, LLM_MODEL"),
        TestClient(fastapi_app),
    ):
        pass
