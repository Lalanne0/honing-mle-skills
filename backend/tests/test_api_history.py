from tests.api_harness import HIDDEN_TEXT, Harness


def create(h: Harness, level: str, topic: str) -> str:
    challenge_id: str = h.create(level=level, topic=topic).json()["id"]
    return challenge_id


def answer(h: Harness, challenge_id: str) -> None:
    response = h.client.post(
        f"/api/challenges/{challenge_id}/answers", json={"round": 1, "answer_md": "Answer."}
    )
    assert response.status_code == 200


# --- history ----------------------------------------------------------------------


def test_history_lists_challenges_newest_first_with_score_and_state(h: Harness) -> None:
    older = create(h, "mid", "model_serving")
    answer(h, older)
    newer = create(h, "senior", "feature_stores")

    response = h.client.get("/api/challenges")

    assert response.status_code == 200
    body = response.json()
    assert [c["id"] for c in body] == [newer, older]
    assert body[0]["state"] == {"kind": "awaiting", "round": 1}
    assert body[0]["score"] is None
    assert body[0]["rounds_answered"] == 0
    assert body[1]["state"] == {"kind": "awaiting", "round": 2}
    assert body[1]["score"] == 60  # FakeLLM scores 3 out of 5 on every dimension
    assert body[1]["rounds_answered"] == 1
    assert body[1]["level"] == "mid"
    assert body[1]["topic"] == "model_serving"
    assert body[1]["scenario_md"].startswith("Fake mid challenge")
    assert "created_at" in body[1]


def test_history_filters_by_topic_and_level(h: Harness) -> None:
    wanted = create(h, "mid", "model_serving")
    create(h, "senior", "model_serving")
    create(h, "mid", "feature_stores")

    response = h.client.get("/api/challenges", params={"topic": "model_serving", "level": "mid"})

    assert [c["id"] for c in response.json()] == [wanted]


def test_history_rejects_an_unknown_topic(h: Harness) -> None:
    assert h.client.get("/api/challenges", params={"topic": "astrology"}).status_code == 422


def test_history_never_sends_the_reference_or_the_rubric(h: Harness) -> None:
    answer(h, create(h, "mid", "model_serving"))

    response = h.client.get("/api/challenges")

    assert_no_hidden_text_in(response.text)
    for item in response.json():
        assert {"reference_md", "rubric", "comparison"}.isdisjoint(item)


def assert_no_hidden_text_in(text: str) -> None:
    for hidden in HIDDEN_TEXT:
        assert hidden not in text


# --- stats ------------------------------------------------------------------------


def test_stats_of_an_empty_store_are_empty(h: Harness) -> None:
    response = h.client.get("/api/stats")

    assert response.status_code == 200
    assert response.json() == []


def test_stats_summarise_each_topic(h: Harness) -> None:
    answer(h, create(h, "mid", "model_serving"))
    revealed = create(h, "mid", "model_serving")
    h.client.post(f"/api/challenges/{revealed}/reveal")

    response = h.client.get("/api/stats")

    (serving,) = response.json()
    assert serving["topic"] == "model_serving"
    assert serving["attempts"] == 2
    assert serving["graded"] == 1
    assert serving["average_score"] == 60
    assert serving["trend"] is None
    assert [d["key"] for d in serving["weakest_dimensions"]] == ["architecture", "requirements"]
    assert serving["weakest_dimensions"][0] == {"key": "architecture", "average_score": 3}


def test_stats_never_send_rubric_text_before_reveal(h: Harness) -> None:
    answer(h, create(h, "mid", "model_serving"))

    response = h.client.get("/api/stats")

    assert_no_hidden_text_in(response.text)
    assert "Architecture" not in response.text  # dimension names are rubric text
