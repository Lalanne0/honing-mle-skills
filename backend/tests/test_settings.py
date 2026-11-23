from pathlib import Path

import pytest
from pydantic import ValidationError

from app.settings import load_settings

KEY = "sk-test-do-not-leak-0123456789"
FULL = f"LLM_BASE_URL=http://gateway.test/v1\nLLM_API_KEY={KEY}\nLLM_MODEL=anthropic/test-model\n"


def env_file(tmp_path: Path, text: str) -> Path:
    path = tmp_path / ".env"
    path.write_text(text)
    return path


def test_reads_the_gateway_settings_from_the_env_file(tmp_path: Path) -> None:
    settings = load_settings(env_file(tmp_path, FULL))

    assert settings.llm_mode == "real"
    assert settings.llm_base_url == "http://gateway.test/v1"
    assert settings.llm_api_key.get_secret_value() == KEY
    assert settings.llm_model == "anthropic/test-model"


def test_ignores_gateway_settings_from_the_shell(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LLM_BASE_URL", "http://shell.test/v1")
    monkeypatch.setenv("LLM_API_KEY", "sk-from-shell")
    monkeypatch.setenv("LLM_MODEL", "shell-model")

    settings = load_settings(env_file(tmp_path, FULL))

    assert settings.llm_base_url == "http://gateway.test/v1"
    assert settings.llm_api_key.get_secret_value() == KEY
    assert settings.llm_model == "anthropic/test-model"


def test_a_key_only_in_the_shell_counts_as_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LLM_API_KEY", "sk-from-shell")
    text = "LLM_BASE_URL=http://gateway.test/v1\nLLM_MODEL=m\n"

    with pytest.raises(ValidationError, match="LLM_API_KEY"):
        load_settings(env_file(tmp_path, text))


@pytest.mark.parametrize("name", ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"])
def test_real_mode_names_each_missing_setting_without_leaking_the_key(
    tmp_path: Path, name: str
) -> None:
    text = "".join(line + "\n" for line in FULL.splitlines() if not line.startswith(name))

    with pytest.raises(ValidationError) as caught:
        load_settings(env_file(tmp_path, text))

    assert name in str(caught.value)
    assert KEY not in str(caught.value)


def test_fake_mode_needs_no_gateway_settings(tmp_path: Path) -> None:
    settings = load_settings(env_file(tmp_path, "LLM_MODE=fake\n"))

    assert settings.llm_mode == "fake"


def test_the_shell_may_choose_fake_mode(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_MODE", "fake")

    assert load_settings(env_file(tmp_path, "LLM_MODE=real\n")).llm_mode == "fake"


def test_a_missing_env_file_means_no_settings(tmp_path: Path) -> None:
    with pytest.raises(ValidationError, match="LLM_BASE_URL"):
        load_settings(tmp_path / "absent.env")


def test_the_key_is_hidden_in_repr(tmp_path: Path) -> None:
    settings = load_settings(env_file(tmp_path, FULL))

    assert KEY not in repr(settings)
    assert KEY not in str(settings)
