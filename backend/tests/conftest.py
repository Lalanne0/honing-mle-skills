from collections.abc import Iterator

import pytest

from app.main import app
from tests.api_harness import Harness


@pytest.fixture
def h() -> Iterator[Harness]:
    yield Harness()
    app.dependency_overrides.clear()
