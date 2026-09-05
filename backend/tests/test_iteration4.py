"""LiquidAudio iteration 4 regression tests — JioSaavn catalog.

Verifies:
- Trending returns real Hindi/English/Punjabi mainstream songs with full metadata
- Search returns Bollywood results (artistHandle present)
- Stream returns audio/mp4 with Accept-Ranges + multi-MB (FULL song)
- Artist endpoint returns {artist, tracks}
- Lyrics endpoint (Hindi with track_id fallback)
- Library flow on device_id=test_device_4 (favorite/recent/playlist)
"""
import os
import uuid

import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or "https://rhythm-glass-ui.preview.emergentagent.com").rstrip("/")
DEVICE_ID = "test_device_4"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def trending_hindi(client):
    r = client.get(f"{BASE_URL}/api/tracks/trending",
                   params={"genre": "Hindi", "limit": 15}, timeout=45)
    assert r.status_code == 200, r.text
    tracks = r.json().get("tracks", [])
    assert tracks, "no trending hindi tracks"
    return tracks


# ---------------- Trending (per-language) ----------------
class TestTrendingLanguages:
    @pytest.mark.parametrize("genre", ["Hindi", "English", "Punjabi"])
    def test_trending_by_language(self, client, genre):
        r = client.get(f"{BASE_URL}/api/tracks/trending",
                       params={"genre": genre, "limit": 10}, timeout=45)
        assert r.status_code == 200, r.text
        tracks = r.json().get("tracks", [])
        assert tracks, f"no tracks for {genre}"
        for t in tracks:
            for f in ("id", "title", "artist", "artwork", "duration", "previewUrl"):
                assert f in t, f"{genre}: missing {f}"
            assert t["title"] and t["artist"]
            assert t["artwork"] and t["artwork"].startswith("http")
        # Most tracks should be > 60s (full songs)
        longs = [t for t in tracks if int(t["duration"]) > 60]
        assert len(longs) >= max(1, len(tracks) // 2), (
            f"{genre}: too many previews — durations={[t['duration'] for t in tracks]}"
        )
        # previewUrl present on at least one track
        assert any(t.get("previewUrl") for t in tracks), f"{genre}: no previewUrl on any track"


# ---------------- Search ----------------
class TestSearch:
    def test_search_kesariya(self, client):
        r = client.get(f"{BASE_URL}/api/tracks/search",
                       params={"q": "kesariya", "limit": 15}, timeout=45)
        assert r.status_code == 200, r.text
        tracks = r.json().get("tracks", [])
        assert tracks, "no kesariya results"
        t = tracks[0]
        for f in ("id", "title", "artist", "artistHandle", "artwork", "duration"):
            assert f in t
        assert t.get("artistHandle"), "artistHandle missing on first result"

    def test_search_arijit(self, client):
        r = client.get(f"{BASE_URL}/api/tracks/search",
                       params={"q": "arijit", "limit": 10}, timeout=45)
        assert r.status_code == 200
        tracks = r.json().get("tracks", [])
        assert tracks


# ---------------- Stream (FULL song) ----------------
class TestStream:
    def test_stream_full_length(self, client, trending_hindi):
        errors = []
        for t in trending_hindi:
            tid = t["id"]
            duration = int(t.get("duration") or 0)
            r = client.get(f"{BASE_URL}/api/tracks/{tid}/stream",
                           stream=True, timeout=60)
            try:
                if r.status_code >= 400:
                    errors.append(f"{tid}:{r.status_code}")
                    continue
                ctype = r.headers.get("Content-Type", "").lower()
                assert "audio" in ctype or "mp4" in ctype or "mpeg" in ctype, f"bad content-type {ctype}"
                assert r.headers.get("Accept-Ranges", "").lower() == "bytes"
                clen = int(r.headers.get("Content-Length", "0") or 0)
                assert clen > 1_000_000, f"stream too small: {clen} bytes (id={tid}, dur={duration}s)"
                assert duration > 60
                chunk = next(r.iter_content(chunk_size=4096), b"")
                assert chunk
                return
            finally:
                r.close()
        pytest.fail(f"No streamable full-length hindi track; errors={errors}")

    def test_stream_range_206(self, client, trending_hindi):
        for t in trending_hindi:
            tid = t["id"]
            r = client.get(f"{BASE_URL}/api/tracks/{tid}/stream",
                           headers={"Range": "bytes=0-8191"},
                           stream=True, timeout=45)
            try:
                if r.status_code >= 400:
                    continue
                assert r.status_code in (200, 206)
                assert r.headers.get("Accept-Ranges", "").lower() == "bytes"
                chunk = next(r.iter_content(chunk_size=1024), b"")
                assert chunk
                return
            finally:
                r.close()
        pytest.fail("No streamable range-supporting track")


# ---------------- Artist ----------------
class TestArtist:
    def test_artist_from_trending(self, client, trending_hindi):
        handles = [t.get("artistHandle") for t in trending_hindi if t.get("artistHandle")]
        assert handles, "no artistHandle in trending hindi"
        last_err = None
        for handle in handles[:5]:
            r = client.get(f"{BASE_URL}/api/artists/{handle}", timeout=45)
            if r.status_code != 200:
                last_err = f"{handle}:{r.status_code}"
                continue
            j = r.json()
            assert "artist" in j and "tracks" in j
            a = j["artist"]
            for k in ("name", "image", "followerCount", "trackCount"):
                assert k in a, f"artist missing {k}"
            assert isinstance(a["followerCount"], int)
            assert isinstance(a["trackCount"], int)
            assert isinstance(j["tracks"], list)
            return
        pytest.fail(f"no working artist from trending; last={last_err}")


# ---------------- Lyrics ----------------
class TestLyrics:
    def test_lyrics_kesariya(self, client):
        r = client.get(f"{BASE_URL}/api/lyrics",
                       params={"title": "Kesariya", "artist": "Arijit Singh",
                               "duration": 268, "track_id": "rjkrTnma"},
                       timeout=45)
        assert r.status_code == 200
        j = r.json()
        assert "synced" in j and "plain" in j and "instrumental" in j
        # At least one of synced/plain should exist for a well-known Bollywood song
        assert j.get("synced") or j.get("plain"), "no lyrics returned"


# ---------------- Library on test_device_4 ----------------
class TestLibraryDevice4:
    _pid = None

    def _slim(self, t):
        return {
            "id": t["id"],
            "title": t["title"],
            "artist": t["artist"],
            "artistHandle": t.get("artistHandle"),
            "artwork": t.get("artwork"),
            "duration": int(t.get("duration", 0)),
            "album": t.get("album"),
            "previewUrl": t.get("previewUrl"),
        }

    def test_a_library_get_initial(self, client):
        r = client.get(f"{BASE_URL}/api/library",
                       params={"device_id": DEVICE_ID}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        for k in ("favorites", "recent", "playlists"):
            assert k in j and isinstance(j[k], list)

    def test_b_favorite_toggle_with_new_fields(self, client, trending_hindi):
        track = self._slim(trending_hindi[0])
        # ensure new track fields are accepted
        assert "previewUrl" in track and "album" in track and "artistHandle" in track
        r = client.post(f"{BASE_URL}/api/library/favorite",
                        json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["favorited"] is True
        assert any(f["id"] == track["id"] for f in j["favorites"])
        # verify GET persistence
        r2 = client.get(f"{BASE_URL}/api/library",
                        params={"device_id": DEVICE_ID}, timeout=15)
        assert any(f["id"] == track["id"] for f in r2.json()["favorites"])
        # toggle off
        r = client.post(f"{BASE_URL}/api/library/favorite",
                        json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r.json()["favorited"] is False

    def test_c_recent_add(self, client, trending_hindi):
        track = self._slim(trending_hindi[0])
        r = client.post(f"{BASE_URL}/api/library/recent",
                        json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r.status_code == 200
        assert r.json()["recent"][0]["id"] == track["id"]

    def test_d_playlist_create_add_reorder_delete(self, client, trending_hindi):
        name = f"TEST_iter4_{uuid.uuid4().hex[:6]}"
        r = client.post(f"{BASE_URL}/api/library/playlist",
                        json={"device_id": DEVICE_ID, "name": name}, timeout=15)
        assert r.status_code == 200
        playlists = r.json()["playlists"]
        pid = next(p["id"] for p in playlists if p["name"] == name)
        TestLibraryDevice4._pid = pid

        ids = []
        for t in trending_hindi[:3]:
            slim = self._slim(t)
            ids.append(slim["id"])
            r = client.post(f"{BASE_URL}/api/library/playlist/{pid}/track",
                            json={"device_id": DEVICE_ID, "track": slim}, timeout=15)
            assert r.status_code == 200, r.text

        reversed_ids = list(reversed(ids))
        r = client.put(f"{BASE_URL}/api/library/playlist/{pid}/reorder",
                       json={"device_id": DEVICE_ID, "track_ids": reversed_ids},
                       timeout=15)
        assert r.status_code == 200
        target = next(p for p in r.json()["playlists"] if p["id"] == pid)
        assert [t["id"] for t in target["tracks"]] == reversed_ids

        r = client.delete(f"{BASE_URL}/api/library/playlist/{pid}/track/{ids[0]}",
                          params={"device_id": DEVICE_ID}, timeout=15)
        assert r.status_code == 200
        target = next(p for p in r.json()["playlists"] if p["id"] == pid)
        assert not any(t["id"] == ids[0] for t in target["tracks"])

    def test_e_reorder_unknown_playlist_404(self, client):
        r = client.put(f"{BASE_URL}/api/library/playlist/not-a-real-id/reorder",
                       json={"device_id": DEVICE_ID, "track_ids": []}, timeout=15)
        assert r.status_code == 404
