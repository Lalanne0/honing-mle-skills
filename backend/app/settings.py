"""App settings.

The gateway settings (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) are read from
`backend/.env` only; shell environment variables are ignored, so a key exported
in a shell can never be picked up by accident. `LLM_MODE` is not secret, so the
shell may override it (for example `LLM_MODE=fake make dev`).
"""

from pathlib import Path
from typing import Any, Literal, Self

from pydantic import SecretStr, model_validator
from pydantic_settings import (
    BaseSettings,
    EnvSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

LLMMode = Literal["real", "fake"]


class _ModeFromShell(EnvSettingsSource):
    """Reads `LLM_MODE`, and nothing else, from the shell environment."""

    def __call__(self) -> dict[str, Any]:
        return {k: v for k, v in super().__call__().items() if k == "llm_mode"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", hide_input_in_errors=True)

    llm_mode: LLMMode = "real"
    llm_base_url: str = ""
    llm_api_key: SecretStr = SecretStr("")
    llm_model: str = ""

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return init_settings, _ModeFromShell(settings_cls), dotenv_settings

    @model_validator(mode="after")
    def _gateway_is_configured(self) -> Self:
        if self.llm_mode == "fake":
            return self
        values = {
            "LLM_BASE_URL": self.llm_base_url,
            "LLM_API_KEY": self.llm_api_key.get_secret_value(),
            "LLM_MODEL": self.llm_model,
        }
        missing = [name for name, value in values.items() if not value.strip()]
        if missing:
            raise ValueError(f"set {', '.join(missing)} in backend/.env (or LLM_MODE=fake)")
        return self


def load_settings(env_file: Path = ENV_FILE) -> Settings:
    """Read settings from `env_file`; only `LLM_MODE` may come from the shell."""
    return Settings(_env_file=env_file)
