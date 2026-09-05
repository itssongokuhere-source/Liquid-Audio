"""Iteration 12 backend tests — verify /api/search/suggest ordering:
- q=arij → entities[0].type == 'artist' and title contains 'Arijit'
- q=kesar → entities contain a song 'Kesariya' and at most 2 artists
- q=tum hi ho → first song entity title starts with 'Tum Hi Ho'; no artist without 'tum hi ho' in name
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


def test_suggest_arij_artist_first(api):
    r = api.get(f"{API}/search/suggest", params={"q": "arij"}, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    body = r.json()
    entities = body.get("entities") or []
    assert len(entities) >= 1, f"Expected entities, got {entities}"
    first = entities[0]
    assert first.get("type") == "artist", f"Expected first entity type 'artist', got {first.get('type')}"
    title = (first.get("title") or "").lower()
    assert "arijit" in title, f"Expected 'Arijit' in first artist title, got {first.get('title')}"
    # At most 2 artists per spec
    artists = [e for e in entities if e.get("type") == "artist"]
    assert len(artists) <= 2, f"Expected <=2 artist entities, got {len(artists)}"


def test_suggest_kesar_has_kesariya_song(api):
    r = api.get(f"{API}/search/suggest", params={"q": "kesar"}, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    body = r.json()
    entities = body.get("entities") or []
    songs = [e for e in entities if e.get("type") == "song"]
    kesariya = [s for s in songs if (s.get("title") or "").strip().lower().startswith("kesariya")]
    assert len(kesariya) >= 1, f"Expected a Kesariya song entity, got songs={[s.get('title') for s in songs]}"
    artists = [e for e in entities if e.get("type") == "artist"]
    assert len(artists) <= 2, f"Expected <=2 artists, got {len(artists)}: {[a.get('title') for a in artists]}"


def test_suggest_tum_hi_ho_song_first(api):
    r = api.get(f"{API}/search/suggest", params={"q": "tum hi ho"}, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    body = r.json()
    entities = body.get("entities") or []
    songs = [e for e in entities if e.get("type") == "song"]
    assert len(songs) >= 1, f"Expected at least 1 song entity, got {entities}"
    first_song_title = (songs[0].get("title") or "").strip().lower()
    assert first_song_title.startswith("tum hi ho"), (
        f"First song entity should start with 'Tum Hi Ho', got {songs[0].get('title')}"
    )
    # No artist whose name doesn't contain 'tum hi ho' (should be no artist entities really)
    for a in entities:
        if a.get("type") != "artist":
            continue
        name = (a.get("title") or "").lower()
        assert "tum hi ho" in name, f"Unrelated artist entity present: {a.get('title')}"
