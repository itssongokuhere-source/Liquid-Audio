"""LiquidAudio backend regression tests for iteration 3.

Primary focus:
- Full-length playback: /api/tracks/{id}/stream returns audio/mpeg with a
  large Content-Length (multi-MB, not a ~30s preview) and Accept-Ranges: bytes.
- Trending tracks are FULL songs (duration > 60s).
- Artist endpoint for 'jayb1rdmusic'.
- Library flow scoped to device_id=test_device_3.
"""
import os
import uuid

import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or "https://rhythm-glass-ui.preview.emergentagent.com").rstrip("/")
DEVICE_ID = "test_device_3"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def trending_tracks(client):
    r = client.get(f"{BASE_URL}/api/tracks/trending",
                   params={"limit": 15}, timeout=30)
    assert r.status_code == 200, r.text
    tracks = r.json().get("tracks", [])
    assert tracks, "no trending tracks"
    return tracks


# ----------------- Full-length playback (PRIMARY) -----------------
class TestFullLengthPlayback:
    def test_trending_has_full_length_songs(self, trending_tracks):
        """At least one trending track should be > 60 seconds (a full song)."""
        long_tracks = [t for t in trending_tracks if int(t.get("duration", 0)) > 60]
        assert long_tracks, (
            f"No trending track has duration > 60s — got {[t['duration'] for t in trending_tracks]}"
        )
        # And most trending tracks should be > 60s (not 30s previews)
        assert len(long_tracks) >= max(1, len(trending_tracks) // 2)

    def test_stream_full_length_content(self, client, trending_tracks):
        """Try trending tracks (skip 502s) until we get a stream. Verify multi-MB size."""
        errors = []
        for t in trending_tracks:
            tid = t["id"]
            duration = int(t.get("duration") or 0)
            # HEAD-like: get without Range so we get true Content-Length
            r = client.get(f"{BASE_URL}/api/tracks/{tid}/stream",
                           stream=True, timeout=45)
            try:
                if r.status_code >= 400:
                    errors.append(f"{tid}:{r.status_code}")
                    continue
                ctype = r.headers.get("Content-Type", "").lower()
                assert "audio" in ctype or "mpeg" in ctype, f"bad content-type {ctype}"
                assert r.headers.get("Accept-Ranges", "").lower() == "bytes"
                clen = int(r.headers.get("Content-Length", "0") or 0)
                # A full song at typical bitrate is > ~500KB. 30s preview would be ~500KB max.
                # Assert > 1MB to unambiguously confirm full-length audio.
                assert clen > 1_000_000, (
                    f"Content-Length={clen} too small for full song (duration={duration}s, id={tid})"
                )
                # Verify duration is a full song
                assert duration > 60, f"duration too short: {duration}s (id={tid})"
                # Read a small chunk to confirm body opens
                chunk = next(r.iter_content(chunk_size=4096), b"")
                assert chunk, "empty body"
                return  # success
            finally:
                r.close()
        pytest.fail(f"No streamable full-length track found; errors={errors}")

    def test_stream_range_request(self, client, trending_tracks):
        """Range request should return 206 with content-range + audio bytes."""
        for t in trending_tracks:
            tid = t["id"]
            r = client.get(f"{BASE_URL}/api/tracks/{tid}/stream",
                           headers={"Range": "bytes=0-8191"},
                           stream=True, timeout=30)
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
        pytest.fail("No streamable track with Range")


# ----------------- Artist -----------------
class TestArtist:
    def test_artist_jaybird(self, client):
        r = client.get(f"{BASE_URL}/api/artists/jayb1rdmusic", timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "artist" in j and "tracks" in j
        a = j["artist"]
        for k in ("name", "handle", "image", "followerCount", "trackCount"):
            assert k in a, f"artist missing {k}"
        assert a["handle"] == "jayb1rdmusic"
        assert isinstance(a["followerCount"], int)
        assert isinstance(a["trackCount"], int)
        assert isinstance(j["tracks"], list)

    def test_artist_unknown_404(self, client):
        r = client.get(f"{BASE_URL}/api/artists/__no_such_handle_xyz_12345__", timeout=30)
        assert r.status_code in (404, 502)  # audius may return upstream error


# ----------------- Trending genre filter -----------------
class TestTrendingGenre:
    def test_trending_electronic(self, client):
        r = client.get(f"{BASE_URL}/api/tracks/trending",
                       params={"genre": "Electronic", "limit": 10}, timeout=30)
        assert r.status_code == 200, r.text
        tracks = r.json().get("tracks", [])
        assert tracks
        for t in tracks:
            for f in ("id", "title", "artist", "artwork", "duration"):
                assert f in t


# ----------------- Search -----------------
class TestSearch:
    def test_search_lofi_shapes(self, client):
        r = client.get(f"{BASE_URL}/api/tracks/search",
                       params={"q": "lofi", "limit": 10}, timeout=30)
        assert r.status_code == 200, r.text
        tracks = r.json().get("tracks", [])
        assert tracks
        t = tracks[0]
        for f in ("id", "title", "artist", "artistHandle", "artwork", "duration"):
            assert f in t


# ----------------- Lyrics -----------------
class TestLyrics:
    def test_believer_synced(self, client):
        r = client.get(f"{BASE_URL}/api/lyrics",
                       params={"title": "Believer", "artist": "Imagine Dragons",
                               "duration": 204}, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "synced" in j and "plain" in j and "instrumental" in j
        assert j.get("synced"), "expected synced lyrics"
        assert "[" in j["synced"]


# ----------------- Library on test_device_3 -----------------
class TestLibraryDevice3:
    _pid = None

    def _slim(self, t):
        return {
            "id": t["id"],
            "title": t["title"],
            "artist": t["artist"],
            "artistHandle": t.get("artistHandle"),
            "artwork": t.get("artwork"),
            "duration": t.get("duration", 0),
        }

    def test_a_library_get_initial(self, client):
        r = client.get(f"{BASE_URL}/api/library",
                       params={"device_id": DEVICE_ID}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        for k in ("favorites", "recent", "playlists"):
            assert k in j and isinstance(j[k], list)

    def test_b_favorite_toggle(self, client, trending_tracks):
        track = self._slim(trending_tracks[0])
        r = client.post(f"{BASE_URL}/api/library/favorite",
                        json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["favorited"] is True
        assert any(f["id"] == track["id"] for f in j["favorites"])
        # verify GET
        r2 = client.get(f"{BASE_URL}/api/library",
                        params={"device_id": DEVICE_ID}, timeout=15)
        assert any(f["id"] == track["id"] for f in r2.json()["favorites"])
        # toggle off
        r = client.post(f"{BASE_URL}/api/library/favorite",
                        json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r.json()["favorited"] is False

    def test_c_recent_add(self, client, trending_tracks):
        track = self._slim(trending_tracks[0])
        r = client.post(f"{BASE_URL}/api/library/recent",
                        json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r.status_code == 200
        assert r.json()["recent"][0]["id"] == track["id"]

    def test_d_playlist_create_add_reorder_delete(self, client, trending_tracks):
        name = f"TEST_iter3_{uuid.uuid4().hex[:6]}"
        r = client.post(f"{BASE_URL}/api/library/playlist",
                        json={"device_id": DEVICE_ID, "name": name}, timeout=15)
        assert r.status_code == 200
        playlists = r.json()["playlists"]
        pid = next(p["id"] for p in playlists if p["name"] == name)
        TestLibraryDevice3._pid = pid

        # add three tracks
        ids = []
        for t in trending_tracks[:3]:
            slim = self._slim(t)
            ids.append(slim["id"])
            r = client.post(f"{BASE_URL}/api/library/playlist/{pid}/track",
                            json={"device_id": DEVICE_ID, "track": slim}, timeout=15)
            assert r.status_code == 200

        # reorder (reverse)
        reversed_ids = list(reversed(ids))
        r = client.put(f"{BASE_URL}/api/library/playlist/{pid}/reorder",
                       json={"device_id": DEVICE_ID, "track_ids": reversed_ids},
                       timeout=15)
        assert r.status_code == 200
        target = next(p for p in r.json()["playlists"] if p["id"] == pid)
        assert [t["id"] for t in target["tracks"]] == reversed_ids

        # delete one
        r = client.delete(f"{BASE_URL}/api/library/playlist/{pid}/track/{ids[0]}",
                          params={"device_id": DEVICE_ID}, timeout=15)
        assert r.status_code == 200
        target = next(p for p in r.json()["playlists"] if p["id"] == pid)
        assert not any(t["id"] == ids[0] for t in target["tracks"])

    def test_e_reorder_unknown_playlist_404(self, client):
        r = client.put(f"{BASE_URL}/api/library/playlist/not-a-real-id/reorder",
                       json={"device_id": DEVICE_ID, "track_ids": []}, timeout=15)
        assert r.status_code == 404
