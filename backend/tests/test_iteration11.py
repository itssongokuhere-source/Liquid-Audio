"""Iteration 11 backend tests — verify search fix:
- GET /api/search?q=hosanna → top is None, artistSongs empty, songs[0].title == 'Hosanna'
- GET /api/search?q=arijit singh → top.title 'Arijit Singh', artistSongs >= 5
- GET /api/search?q=kesariya → songs[0].title starts with 'Kesariya', artist starts 'Arijit Singh'
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL must be set")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def test_search_hosanna_no_top_no_artist_songs(api):
    r = api.get(f"{API}/search", params={"q": "hosanna"}, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    body = r.json()
    assert body.get("top") is None, f"Expected top=None but got {body.get('top')}"
    assert body.get("artistSongs") in (None, []), f"Expected empty artistSongs, got {body.get('artistSongs')}"
    songs = body.get("songs") or []
    assert len(songs) >= 1, f"Expected songs, got {songs}"
    first_title = (songs[0].get("title") or "").strip().lower()
    assert first_title.startswith("hosanna"), f"First song title should start with 'Hosanna', got {songs[0].get('title')}"


def test_search_arijit_singh_has_top_and_artist_songs(api):
    r = api.get(f"{API}/search", params={"q": "arijit singh"}, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    body = r.json()
    top = body.get("top")
    assert top is not None, "Expected non-null top card"
    top_title = (top.get("title") or "").strip().lower()
    assert "arijit" in top_title, f"Expected 'Arijit' in top.title, got {top.get('title')}"
    artist_songs = body.get("artistSongs") or []
    assert len(artist_songs) >= 5, f"Expected >=5 artistSongs, got {len(artist_songs)}"


def test_search_kesariya(api):
    r = api.get(f"{API}/search", params={"q": "kesariya"}, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    body = r.json()
    songs = body.get("songs") or []
    assert len(songs) >= 1
    first = songs[0]
    title = (first.get("title") or "").strip().lower()
    artist = (first.get("artist") or "").strip().lower()
    assert title.startswith("kesariya"), f"Expected 'Kesariya' first, got {first.get('title')}"
    assert artist.startswith("arijit singh"), f"Expected artist 'Arijit Singh', got {first.get('artist')}"
