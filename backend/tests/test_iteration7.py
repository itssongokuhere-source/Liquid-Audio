"""Iteration 7 backend tests — LiquidAudio

Covers:
- Artist attribution fix (singers-first) in normalize_song
- Professional /api/search (top artist card + artistSongs + deduped songs, variant filtering)
- /api/tracks/trending exposes artists[] and artistHandle
- /api/tracks/search first-result singer-first attribution
- Regression: /api/tracks/{id}/recommendations, /api/search/suggest?q=arij,
  /api/lyrics for a Hindi trending track, /api/jam POST+GET+DELETE
"""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

VARIANT_RE = re.compile(r"\b(lofi|lo-fi|remix|slowed|mashup)\b", re.I)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Accept": "application/json"})
    return s


# ---------- /api/search — the big new endpoint ----------
class TestStructuredSearch:
    def test_kesariya_shape_and_attribution(self, client):
        r = client.get(f"{API}/search", params={"q": "kesariya"}, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert set(["query", "top", "artists", "artistSongs", "songs"]).issubset(j.keys())
        songs = j["songs"]
        assert songs, "songs[] must be non-empty for 'kesariya'"
        s0 = songs[0]
        assert s0["title"].lower().startswith("kesariya"), f"first title={s0['title']!r}"
        assert s0["artist"].lower().startswith("arijit singh"), (
            f"first artist must start with 'Arijit Singh', got {s0['artist']!r}"
        )
        assert s0["artistHandle"] == "459320", f"artistHandle={s0['artistHandle']!r}"
        assert isinstance(s0["artists"], list) and s0["artists"], "artists[] must be a non-empty list"
        names = [a["name"] for a in s0["artists"]]
        assert "Arijit Singh" in names, f"artists names={names}"
        assert "Pritam" in names, f"artists names={names}"
        assert names.index("Arijit Singh") < names.index("Pritam"), (
            f"Arijit Singh must come before Pritam. names={names}"
        )
        # variant filter
        for t in songs:
            assert not VARIANT_RE.search(t["title"]), f"variant leaked: {t['title']!r}"
        # dedupe: no two songs with same normalized title AND duration within 3s
        seen: list = []
        for t in songs:
            norm = re.sub(r"[^a-z0-9]+", " ", t["title"].lower()).strip()
            d = t.get("duration") or 0
            for pn, pd in seen:
                if pn == norm and abs(pd - d) <= 3:
                    pytest.fail(f"duplicate title/duration: {t['title']!r} {d}s")
            seen.append((norm, d))

    def test_kesariya_lofi_allows_variants(self, client):
        r = client.get(f"{API}/search", params={"q": "kesariya lofi"}, timeout=30)
        assert r.status_code == 200
        songs = r.json()["songs"]
        assert songs, "expected results for 'kesariya lofi'"
        has_lofi = any(VARIANT_RE.search(t["title"]) for t in songs)
        assert has_lofi, f"expected lofi variant in results. titles={[t['title'] for t in songs[:5]]}"

    def test_arijit_singh_top_artist(self, client):
        r = client.get(f"{API}/search", params={"q": "arijit singh"}, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        top = j.get("top")
        assert top and top.get("type") == "artist"
        assert top.get("title") == "Arijit Singh", f"top.title={top.get('title')!r}"
        assert len(j.get("artistSongs") or []) >= 5, f"artistSongs len={len(j.get('artistSongs') or [])}"
        assert j.get("artists"), "artists[] must be non-empty"
        art_ids = {t["id"] for t in j["artistSongs"]}
        for t in j.get("songs") or []:
            assert t["id"] not in art_ids, f"song id {t['id']} duplicated between songs[] and artistSongs[]"

    def test_missing_q_returns_422(self, client):
        r = client.get(f"{API}/search", timeout=15)
        assert r.status_code == 422


# ---------- Trending / legacy search ----------
class TestTrendingAttribution:
    def test_trending_exposes_artists_and_handle(self, client):
        r = client.get(f"{API}/tracks/trending", params={"limit": 5}, timeout=30)
        assert r.status_code == 200
        tracks = r.json()["tracks"]
        assert len(tracks) >= 1
        for t in tracks:
            assert "artists" in t and isinstance(t["artists"], list), f"missing artists[] on {t.get('title')}"
            assert "artistHandle" in t, f"missing artistHandle on {t.get('title')}"
            assert t["artistHandle"] is None or isinstance(t["artistHandle"], str)

    def test_legacy_tracks_search_kesariya_singer_first(self, client):
        r = client.get(f"{API}/tracks/search", params={"q": "kesariya"}, timeout=30)
        assert r.status_code == 200
        tracks = r.json()["tracks"]
        assert tracks
        assert tracks[0]["artist"].lower().startswith("arijit singh"), (
            f"got {tracks[0]['artist']!r}"
        )


# ---------- Regression smoke ----------
class TestRegression:
    def test_recommendations(self, client):
        # get a trending id first
        tr = client.get(f"{API}/tracks/trending", params={"limit": 1}, timeout=30).json()
        tid = tr["tracks"][0]["id"]
        r = client.get(f"{API}/tracks/{tid}/recommendations", params={"limit": 10}, timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json().get("tracks"), list)

    def test_suggest_arij(self, client):
        r = client.get(f"{API}/search/suggest", params={"q": "arij"}, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "suggestions" in j and "entities" in j
        titles = [s.get("text", "") for s in j["suggestions"]]
        ent_titles = [e.get("title", "") for e in j["entities"]]
        blob = " | ".join(titles + ent_titles).lower()
        assert "arijit" in blob, f"expected 'Arijit' in suggestions/entities. blob={blob}"

    def test_lyrics_hindi_trending(self, client):
        tr = client.get(f"{API}/tracks/trending", params={"limit": 1, "genre": "hindi"}, timeout=30).json()
        t = tr["tracks"][0]
        r = client.get(f"{API}/lyrics", params={
            "title": t["title"],
            "artist": t["artist"],
            "album": t.get("album") or "",
            "duration": t.get("duration") or 0,
            "track_id": t["id"],
        }, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert set(["synced", "plain", "instrumental", "source"]).issubset(j.keys())

    def test_jam_lifecycle(self, client):
        device = f"test_dev_iter7_{int(time.time())}"
        # create
        c = client.post(f"{API}/jam", json={"device_id": device, "name": "Iter7"}, timeout=15)
        assert c.status_code == 200, c.text
        room = c.json()
        code = room["code"]
        assert re.fullmatch(r"[A-Z0-9]{6}", code), f"bad code {code!r}"
        # get
        g = client.get(f"{API}/jam/{code}", timeout=15)
        assert g.status_code == 200
        assert g.json()["code"] == code
        # delete
        d = client.delete(f"{API}/jam/{code}", params={"device_id": device}, timeout=15)
        assert d.status_code == 200
        assert d.json().get("ended") is True
        # get again → 404
        g2 = client.get(f"{API}/jam/{code}", timeout=15)
        assert g2.status_code == 404
