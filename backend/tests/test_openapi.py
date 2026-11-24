import json

import pytest

from app import openapi


def test_main_prints_the_spec_with_the_challenge_routes(capsys: pytest.CaptureFixture[str]) -> None:
    openapi.main()

    spec = json.loads(capsys.readouterr().out)
    assert "/api/challenges" in spec["paths"]
    assert "/api/challenges/{challenge_id}" in spec["paths"]
    assert "get" in spec["paths"]["/api/challenges"]
    assert "/api/stats" in spec["paths"]
    assert {"ChallengePublic", "ChallengeRevealed", "ChallengeSummary", "TopicStats"} <= spec[
        "components"
    ]["schemas"].keys()
