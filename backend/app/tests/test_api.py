import pytest
from fastapi.testclient import TestClient
import sys
import os

# Add the logmentor root to path so imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from backend.app.main import app

client = TestClient(app)

SAMPLE_LOG = """2026-06-09 09:00:01 INFO Server started
2026-06-09 09:02:08 ERROR Database connection timed out
2026-06-09 09:02:10 ERROR Database connection timed out
2026-06-09 09:05:22 ERROR Authentication failed for user admin"""


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_diagnose_empty_log():
    response = client.post("/diagnose", json={"log_text": ""})
    assert response.status_code == 400


def test_get_history_empty():
    response = client.get("/history", headers={"x-session-id": "test-session-abc"})
    assert response.status_code == 200
    assert "history" in response.json()


def test_clear_history():
    response = client.delete("/history", headers={"x-session-id": "test-session-abc"})
    assert response.status_code == 200


def test_challenge_scenarios_load():
    response = client.get("/challenge/scenarios")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_challenge_filter_by_difficulty():
    response = client.get("/challenge/scenarios?difficulty=beginner")
    assert response.status_code == 200
    for s in response.json():
        assert s["difficulty"] == "beginner"


def test_challenge_invalid_scenario():
    response = client.post("/challenge/attempt", json={
        "scenario_id": "fake-id-999",
        "user_answer": "something"
    })
    assert response.status_code == 404


def test_follow_up_empty_question():
    response = client.post("/follow-up", json={
        "log_text": SAMPLE_LOG,
        "question": ""
    })
    assert response.status_code == 400