from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect

import app.main
from app.main import app as fastapi_app


def test_starting_twice_creates_the_database_and_keeps_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = tmp_path / "data" / "app.db"
    monkeypatch.setattr(app.main, "DB_PATH", db)

    for _ in range(2):
        with TestClient(fastapi_app) as client:
            assert client.get("/api/health").status_code == 200
            tables = set(inspect(fastapi_app.state.engine).get_table_names())

    assert db.exists()
    assert {"challenge", "round"} <= tables
