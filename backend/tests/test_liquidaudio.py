"""LiquidAudio backend integration tests.

Covers:
- Discovery (trending, trending?genre=Electronic, search)
- Track detail + stream proxy (audio/mpeg + Accept-Ranges)
- Lyrics (LRCLIB proxy)
- Library flows (favorites toggle, recent, playlists)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://rhythm-glass-ui.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
DEVICE_ID = "test_device_1"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def trending_track(client):
    r = client.get(f"{BASE_URL}/api/tracks/trending", params={"limit": 10}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "tracks" in data and len(data["tracks"]) > 0, "No trending tracks returned"
    return data["tracks"][0]


# ----------------- Discovery -----------------
class TestDiscovery:
    def test_root(self, client):
        r = client.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_trending_default(self, client):
        r = client.get(f"{BASE_URL}/api/tracks/trending", timeout=30)
        assert r.status_code == 200, r.text
        tracks = r.json().get("tracks", [])
        assert len(tracks) > 0
        t = tracks[0]
        for f in ("id", "title", "artist", "artwork", "duration"):
            assert f in t, f"missing {f}"
        assert isinstance(t["duration"], int)
        assert t["id"]

    def test_trending_genre_electronic(self, client):
        r = client.get(f"{BASE_URL}/api/tracks/trending",
                       params={"genre": "Electronic", "limit": 10}, timeout=30)
        assert r.status_code == 200, r.text
        tracks = r.json().get("tracks", [])
        assert len(tracks) > 0

    def test_search_lofi(self, client):
        r = client.get(f"{BASE_URL}/api/tracks/search",
                       params={"q": "lofi", "limit": 10}, timeout=30)
        assert r.status_code == 200, r.text
        tracks = r.json().get("tracks", [])
        assert len(tracks) > 0
        assert tracks[0]["id"]

    def test_search_missing_q_400(self, client):
        r = client.get(f"{BASE_URL}/api/tracks/search", timeout=15)
        assert r.status_code == 422  # FastAPI query validation


# ----------------- Stream -----------------
class TestStream:
    def test_stream_returns_audio(self, client, trending_track):
        tid = trending_track["id"]
        # Use Range to avoid downloading whole file
        r = client.get(f"{BASE_URL}/api/tracks/{tid}/stream",
                       headers={"Range": "bytes=0-2047"},
                       stream=True, timeout=30)
        try:
            assert r.status_code in (200, 206), f"status={r.status_code}"
            ctype = r.headers.get("Content-Type", "")
            assert "audio" in ctype.lower() or "mpeg" in ctype.lower(), f"content-type={ctype}"
            assert r.headers.get("Accept-Ranges", "").lower() == "bytes"
            # read a small chunk to make sure the stream body opens
            chunk = next(r.iter_content(chunk_size=1024), b"")
            assert chunk, "empty stream body"
        finally:
            r.close()


# ----------------- Lyrics -----------------
class TestLyrics:
    def test_lyrics_believer(self, client):
        r = client.get(f"{BASE_URL}/api/lyrics",
                       params={"title": "Believer", "artist": "Imagine Dragons", "duration": 204},
                       timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "synced" in j and "plain" in j and "instrumental" in j
        # Believer is very common on LRCLIB
        assert j.get("synced"), "expected synced LRC lyrics for Believer"
        assert "[" in j["synced"] and "]" in j["synced"]  # LRC-like

    def test_lyrics_unknown_graceful(self, client):
        r = client.get(f"{BASE_URL}/api/lyrics",
                       params={"title": "___zzz_no_such_track_xyz",
                               "artist": "___zzz_no_such_artist_xyz",
                               "duration": 60},
                       timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j.get("synced") in (None, "") or isinstance(j.get("synced"), str)


# ----------------- Library -----------------
class TestLibrary:
    _created_playlist_id = None

    def _sample_track(self, base):
        return {
            "id": base["id"],
            "title": base["title"],
            "artist": base["artist"],
            "artwork": base.get("artwork"),
            "duration": base.get("duration", 0),
            "genre": base.get("genre"),
        }

    def test_a_get_library_initial(self, client):
        r = client.get(f"{BASE_URL}/api/library", params={"device_id": DEVICE_ID}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        for k in ("favorites", "recent", "playlists"):
            assert k in j and isinstance(j[k], list)

    def test_b_favorite_toggle_add_and_remove(self, client, trending_track):
        track = self._sample_track(trending_track)
        # add
        r = client.post(f"{BASE_URL}/api/library/favorite",
                        json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["favorited"] is True
        assert any(f["id"] == track["id"] for f in j["favorites"])

        # verify GET
        r2 = client.get(f"{BASE_URL}/api/library", params={"device_id": DEVICE_ID}, timeout=15)
        assert any(f["id"] == track["id"] for f in r2.json()["favorites"])

        # remove
        r = client.post(f"{BASE_URL}/api/library/favorite",
                        json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["favorited"] is False
        assert not any(f["id"] == track["id"] for f in j["favorites"])

    def test_c_recent_add(self, client, trending_track):
        track = self._sample_track(trending_track)
        r = client.post(f"{BASE_URL}/api/library/recent",
                        json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["recent"][0]["id"] == track["id"]

    def test_d_playlist_create(self, client):
        r = client.post(f"{BASE_URL}/api/library/playlist",
                        json={"device_id": DEVICE_ID, "name": "TEST_Playlist_1"}, timeout=15)
        assert r.status_code == 200, r.text
        playlists = r.json()["playlists"]
        found = [p for p in playlists if p["name"] == "TEST_Playlist_1"]
        assert found, "created playlist not found"
        TestLibrary._created_playlist_id = found[-1]["id"]

    def test_e_playlist_add_track(self, client, trending_track):
        pid = TestLibrary._created_playlist_id
        assert pid, "playlist id missing (test_d didn't run)"
        track = self._sample_track(trending_track)
        r = client.post(f"{BASE_URL}/api/library/playlist/{pid}/track",
                        json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r.status_code == 200, r.text
        playlists = r.json()["playlists"]
        target = next(p for p in playlists if p["id"] == pid)
        assert any(t["id"] == track["id"] for t in target["tracks"])

    def test_f_playlist_remove_track(self, client, trending_track):
        pid = TestLibrary._created_playlist_id
        assert pid
        tid = trending_track["id"]
        r = client.delete(f"{BASE_URL}/api/library/playlist/{pid}/track/{tid}",
                          params={"device_id": DEVICE_ID}, timeout=15)
        assert r.status_code == 200
        playlists = r.json()["playlists"]
        target = next(p for p in playlists if p["id"] == pid)
        assert not any(t["id"] == tid for t in target["tracks"])

    def test_g_playlist_add_invalid_id_404(self, client, trending_track):
        track = self._sample_track(trending_track)
        r = client.post(f"{BASE_URL}/api/library/playlist/not-a-real-id/track",
                        json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r.status_code == 404
