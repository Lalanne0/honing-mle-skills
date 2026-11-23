from app.llm.fake import FakeLLM
from app.llm.gateway import OpenAICompatibleLLM
from app.llm.port import LLMPort
from app.settings import Settings


def make_llm(settings: Settings) -> LLMPort:
    """The LLM that `LLM_MODE` selects."""
    if settings.llm_mode == "fake":
        return FakeLLM()
    return OpenAICompatibleLLM(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
    )
