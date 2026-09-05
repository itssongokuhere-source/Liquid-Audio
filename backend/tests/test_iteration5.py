"""LiquidAudio iteration 5 tests.

Covers:
- /api/tracks/{id}/recommendations (with exclude)
- /api/tracks/{id}/radio (>=10 unique, no seed)
- /api/app/version + POST publish + /api/app/releases (admin PIN)
- /api/artwork/palette
- /api/tracks/{id}/stream with Range and q variants
Cleanup: any release inserted with version=9.9.9 is removed at teardown.
"""
import os
import re
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or "https://rhythm-glass-ui.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="session")
def trending(client):
    r = client.get(f"{BASE_URL}/api/tracks/trending",
                   params={"limit": 3}, timeout=45)
    assert r.status_code == 200, r.text
    tracks = r.json().get("tracks", [])
    assert tracks, "no trending tracks"
    return tracks


@pytest.fixture(scope="session")
def seed_track(trending):
    return trending[0]


# ------------------- Recommendations -------------------
class TestRecommendations:
    def test_reco_basic(self, client, seed_track):
        tid = seed_track["id"]
        r = client.get(f"{BASE_URL}/api/tracks/{tid}/recommendations", timeout=60)
        assert r.status_code == 200, r.text
        tracks = r.json().get("tracks", [])
        assert tracks, "no recommendation tracks"
        for t in tracks:
            assert t["id"] != tid, "seed track leaked into recs"
            for f in ("id", "title", "artist", "artwork"):
                assert f in t

    def test_reco_exclude(self, client, seed_track):
        tid = seed_track["id"]
        # take some reco ids to exclude
        r0 = client.get(f"{BASE_URL}/api/tracks/{tid}/recommendations",
                        params={"limit": 10}, timeout=60)
        assert r0.status_code == 200
        ids = [t["id"] for t in r0.json()["tracks"]]
        assert len(ids) >= 2
        excl = ids[:2]
        r = client.get(f"{BASE_URL}/api/tracks/{tid}/recommendations",
                       params={"exclude": ",".join(excl), "limit": 20},
                       timeout=60)
        assert r.status_code == 200
        got_ids = {t["id"] for t in r.json()["tracks"]}
        for e in excl:
            assert e not in got_ids, f"excluded id {e} present"
        assert tid not in got_ids


# ------------------- Radio -------------------
class TestRadio:
    def test_radio_basic(self, client, seed_track):
        tid = seed_track["id"]
        r = client.get(f"{BASE_URL}/api/tracks/{tid}/radio", timeout=90)
        assert r.status_code == 200, r.text
        tracks = r.json().get("tracks", [])
        assert len(tracks) >= 10, f"radio too short: {len(tracks)}"
        ids = [t["id"] for t in tracks]
        assert tid not in ids, "seed track in radio"
        assert len(set(ids)) == len(ids), "duplicates in radio"


# ------------------- App version / releases -------------------
class TestAppVersion:
    @classmethod
    def teardown_class(cls):
        # Safety net cleanup
        c = MongoClient(MONGO_URL)
        try:
            c[DB_NAME].app_releases.delete_many({"version": "9.9.9"})
        finally:
            c.close()

    def _cleanup(self, mongo):
        mongo.app_releases.delete_many({"version": "9.9.9"})

    def test_a_no_release_initial(self, client, mongo):
        self._cleanup(mongo)
        r = client.get(f"{BASE_URL}/api/app/version",
                       params={"current": "1.0.0"}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["latest"] is None
        assert j["update_available"] is False

    def test_b_publish_wrong_pin(self, client):
        r = client.post(f"{BASE_URL}/api/app/version", json={
            "pin": "0000",
            "version": "9.9.9",
            "apk_url": "https://example.com/test.apk",
            "notes": "test",
        }, timeout=15)
        assert r.status_code == 403, r.text

    def test_c_publish_correct_pin(self, client):
        r = client.post(f"{BASE_URL}/api/app/version", json={
            "pin": "2468",
            "version": "9.9.9",
            "apk_url": "https://example.com/test.apk",
            "notes": "test",
        }, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["release"]["version"] == "9.9.9"

    def test_d_update_available_when_older(self, client):
        r = client.get(f"{BASE_URL}/api/app/version",
                       params={"current": "1.1.0"}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["update_available"] is True
        assert j["latest"]["version"] == "9.9.9"

    def test_e_no_update_when_same(self, client):
        r = client.get(f"{BASE_URL}/api/app/version",
                       params={"current": "9.9.9"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["update_available"] is False

    def test_f_releases_contains(self, client):
        r = client.get(f"{BASE_URL}/api/app/releases", timeout=15)
        assert r.status_code == 200
        rels = r.json()["releases"]
        assert any(x["version"] == "9.9.9" for x in rels)

    def test_g_cleanup(self, client, mongo):
        self._cleanup(mongo)
        r = client.get(f"{BASE_URL}/api/app/version",
                       params={"current": "1.0.0"}, timeout=15)
        assert r.json()["latest"] is None


# ------------------- Artwork palette -------------------
class TestPalette:
    def test_palette(self, client, seed_track):
        url = seed_track["artwork"]
        r = client.get(f"{BASE_URL}/api/artwork/palette",
                       params={"url": url}, timeout=45)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("accent", "dominant", "background"):
            assert k in j, f"missing {k}"
            assert j[k] and HEX_RE.match(j[k]), f"bad {k}={j[k]}"


# ------------------- Stream with q + Range -------------------
class TestStreamQualities:
    @pytest.mark.parametrize("q", ["96", "160", "320"])
    def test_range_206(self, client, seed_track, q):
        tid = seed_track["id"]
        r = client.get(f"{BASE_URL}/api/tracks/{tid}/stream",
                       params={"q": q},
                       headers={"Range": "bytes=0-100"},
                       stream=True, timeout=60)
        try:
            assert r.status_code == 206, f"q={q} status={r.status_code}"
            assert r.headers.get("Content-Range"), f"q={q} no Content-Range"
            assert r.headers.get("Accept-Ranges", "").lower() == "bytes"
        finally:
            r.close()
