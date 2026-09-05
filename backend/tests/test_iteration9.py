"""Iteration 9 backend test (tiny):
- GET /api/home/mixes?device_id=tester-refresh&refresh=true called twice → both 200 with non-empty mixes[].
- Cleanup db.mixes_cache / db.libraries entries for device_id 'tester-refresh'.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://rhythm-glass-ui.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"
DEVICE = "tester-refresh"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    # cleanup — best-effort delete of tester-refresh entries
    try:
        from pymongo import MongoClient
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        c = MongoClient(mongo_url)[db_name]
        c.libraries.delete_many({"device_id": DEVICE})
        c.mixes_cache.delete_many({"device_id": DEVICE})
    except Exception as e:  # pragma: no cover
        print("cleanup failed:", e)


def _assert_mixes_response(body):
    assert "day" in body and "mixes" in body, f"Missing day/mixes keys in {body.keys()}"
    mixes = body["mixes"]
    assert isinstance(mixes, list) and len(mixes) >= 1, f"Expected non-empty mixes[], got {mixes}"
    for m in mixes:
        assert "id" in m and "tracks" in m
        assert isinstance(m["tracks"], list) and len(m["tracks"]) >= 1


def test_home_mixes_refresh_twice(api):
    # 1st call
    r1 = api.get(f"{API}/home/mixes", params={"device_id": DEVICE, "refresh": "true"}, timeout=90)
    assert r1.status_code == 200, f"1st refresh call failed: {r1.status_code} {r1.text[:200]}"
    body1 = r1.json()
    _assert_mixes_response(body1)

    # 2nd call (same-day; deterministic seed may return identical ids — just verify 200 + non-empty)
    r2 = api.get(f"{API}/home/mixes", params={"device_id": DEVICE, "refresh": "true"}, timeout=90)
    assert r2.status_code == 200, f"2nd refresh call failed: {r2.status_code} {r2.text[:200]}"
    body2 = r2.json()
    _assert_mixes_response(body2)
