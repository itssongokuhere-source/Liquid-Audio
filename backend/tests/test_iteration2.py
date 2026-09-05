"""LiquidAudio iteration 2 backend tests.

Covers:
- GET /api/artists/{handle}: artist + top tracks
- PUT /api/library/playlist/{id}/reorder: reorder tracks
- Regression: POST /api/library/favorite accepts artistHandle field
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or "https://rhythm-glass-ui.preview.emergentagent.com").rstrip("/")
DEVICE_ID = "test_device_2"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- Artist ----------------
class TestArtist:
    def test_artist_jayb1rdmusic(self, client):
        r = client.get(f"{BASE_URL}/api/artists/jayb1rdmusic", timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "artist" in j and "tracks" in j
        a = j["artist"]
        for k in ("name", "handle", "image", "followerCount", "trackCount", "bio", "isVerified"):
            assert k in a, f"missing artist.{k}"
        assert isinstance(a["followerCount"], int)
        assert isinstance(a["trackCount"], int)
        assert isinstance(a["isVerified"], bool)
        # handle should match (case-insensitive)
        assert (a.get("handle") or "").lower() == "jayb1rdmusic"
        tracks = j["tracks"]
        assert isinstance(tracks, list)
        if tracks:
            t = tracks[0]
            for k in ("id", "title", "artist", "duration"):
                assert k in t

    def test_artist_not_found(self, client):
        r = client.get(f"{BASE_URL}/api/artists/__zzz_no_such_user_xyz__", timeout=30)
        # Audius returns empty for unknown handle -> 404
        assert r.status_code in (404, 502), r.text


# ---------------- Favorite artistHandle regression ----------------
class TestFavoriteArtistHandle:
    def test_favorite_accepts_artist_handle(self, client):
        track = {
            "id": "TEST_track_ih_1",
            "title": "TEST_ArtistHandle Song",
            "artist": "TEST Artist",
            "artistHandle": "testartisthandle",
            "artwork": None,
            "duration": 123,
            "genre": None,
        }
        # add
        r = client.post(f"{BASE_URL}/api/library/favorite",
                        json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["favorited"] is True
        fav = next(f for f in j["favorites"] if f["id"] == track["id"])
        assert fav.get("artistHandle") == "testartisthandle"

        # cleanup: toggle off
        r2 = client.post(f"{BASE_URL}/api/library/favorite",
                         json={"device_id": DEVICE_ID, "track": track}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["favorited"] is False


# ---------------- Playlist reorder ----------------
class TestPlaylistReorder:
    playlist_id = None
    track_ids = ["TEST_r_1", "TEST_r_2", "TEST_r_3"]

    def _track(self, i):
        return {
            "id": self.track_ids[i],
            "title": f"TEST Reorder {i}",
            "artist": "TEST Artist",
            "artistHandle": None,
            "artwork": None,
            "duration": 100 + i,
            "genre": None,
        }

    def test_a_create_playlist(self, client):
        r = client.post(f"{BASE_URL}/api/library/playlist",
                        json={"device_id": DEVICE_ID, "name": "TEST_Reorder_PL"}, timeout=15)
        assert r.status_code == 200, r.text
        playlists = r.json()["playlists"]
        pl = [p for p in playlists if p["name"] == "TEST_Reorder_PL"]
        assert pl, "reorder playlist not created"
        TestPlaylistReorder.playlist_id = pl[-1]["id"]

    def test_b_add_three_tracks(self, client):
        pid = TestPlaylistReorder.playlist_id
        assert pid
        # add in order 0,1,2 — each is inserted at position 0, so final order becomes [2,1,0]
        for i in range(3):
            r = client.post(f"{BASE_URL}/api/library/playlist/{pid}/track",
                            json={"device_id": DEVICE_ID, "track": self._track(i)}, timeout=15)
            assert r.status_code == 200

    def test_c_reorder_sets_exact_order(self, client):
        pid = TestPlaylistReorder.playlist_id
        assert pid
        desired = ["TEST_r_1", "TEST_r_2", "TEST_r_3"]
        r = client.put(f"{BASE_URL}/api/library/playlist/{pid}/reorder",
                       json={"device_id": DEVICE_ID, "track_ids": desired}, timeout=15)
        assert r.status_code == 200, r.text
        pl = next(p for p in r.json()["playlists"] if p["id"] == pid)
        got = [t["id"] for t in pl["tracks"]]
        assert got == desired, got

        # verify persistence via GET
        r2 = client.get(f"{BASE_URL}/api/library", params={"device_id": DEVICE_ID}, timeout=15)
        pl2 = next(p for p in r2.json()["playlists"] if p["id"] == pid)
        assert [t["id"] for t in pl2["tracks"]] == desired

    def test_d_reorder_reverse(self, client):
        pid = TestPlaylistReorder.playlist_id
        desired = ["TEST_r_3", "TEST_r_1", "TEST_r_2"]
        r = client.put(f"{BASE_URL}/api/library/playlist/{pid}/reorder",
                       json={"device_id": DEVICE_ID, "track_ids": desired}, timeout=15)
        assert r.status_code == 200
        pl = next(p for p in r.json()["playlists"] if p["id"] == pid)
        assert [t["id"] for t in pl["tracks"]] == desired

    def test_e_reorder_invalid_playlist_404(self, client):
        r = client.put(f"{BASE_URL}/api/library/playlist/not-a-real-id/reorder",
                       json={"device_id": DEVICE_ID, "track_ids": ["a"]}, timeout=15)
        assert r.status_code == 404

    def test_f_cleanup(self, client):
        pid = TestPlaylistReorder.playlist_id
        if not pid:
            return
        for tid in self.track_ids:
            client.delete(f"{BASE_URL}/api/library/playlist/{pid}/track/{tid}",
                          params={"device_id": DEVICE_ID}, timeout=15)
