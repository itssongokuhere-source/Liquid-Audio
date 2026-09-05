"""Iteration 8 backend tests:
- /api/home/mixes (cold + history-driven; caching)
- /api/lyrics Hinglish behavior (no Devanagari default; latin/native)
- /api/tracks/{id}/recommendations cleanliness (no duplicates/variants/self)
"""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://rhythm-glass-ui.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEVANAGARI = re.compile(r"[\u0900-\u097F]")
VARIANT_RX = re.compile(r"(slowed|reverb|sped\s*up|mashup|lofi|remix)", re.I)


def _normalize_title(t: str) -> str:
    t = re.sub(r"\([^)]*\)", "", t or "")
    t = re.sub(r"\[[^\]]*\]", "", t)
    return re.sub(r"\s+", " ", t).strip().lower()


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    # cleanup — best effort delete of tester-* library docs & mixes_cache
    try:
        from pymongo import MongoClient
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        c = MongoClient(mongo_url)[db_name]
        c.libraries.delete_many({"device_id": {"$regex": "^tester-"}})
        c.mixes_cache.delete_many({"device_id": {"$regex": "^tester-"}})
    except Exception as e:  # pragma: no cover
        print("cleanup failed:", e)


# ---------------- Health / smoke ----------------
def test_health(api):
    r = api.get(f"{API}/tracks/trending?limit=3", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json().get("tracks"), list)


# ---------------- Mixes (cold device) ----------------
def test_mixes_cold_device(api):
    r = api.get(f"{API}/home/mixes", params={"device_id": "tester-cold"}, timeout=60)
    assert r.status_code == 200
    body = r.json()
    assert "day" in body and "mixes" in body
    mixes = body["mixes"]
    assert isinstance(mixes, list) and len(mixes) >= 2
    ids = {m["id"] for m in mixes}
    assert "discover-mix" in ids, f"Cold device should include discover-mix, got {ids}"
    # At least one language mix
    assert any(mid.startswith("lang-") for mid in ids), f"Cold device should have a lang- mix, got {ids}"

    for m in mixes:
        for key in ("id", "title", "subtitle", "color", "covers", "tracks"):
            assert key in m, f"Missing key {key} in mix {m.get('id')}"
        assert isinstance(m["tracks"], list) and len(m["tracks"]) >= 6, \
            f"Mix {m['id']} must have >=6 tracks, has {len(m['tracks'])}"
        assert isinstance(m["covers"], list) and len(m["covers"]) >= 1


# ---------------- Mixes (history-driven) ----------------
@pytest.fixture(scope="module")
def history_tracks(api):
    r = api.get(f"{API}/tracks/search", params={"q": "arijit singh", "limit": 6}, timeout=30)
    assert r.status_code == 200
    tracks = r.json().get("tracks", [])
    assert len(tracks) >= 6, f"Need 6 arijit singh tracks, got {len(tracks)}"
    return tracks


def test_seed_history_and_mixes(api, history_tracks):
    device = "tester-hist"
    # Post recent 2x for first 5
    for t in history_tracks[:5]:
        for _ in range(2):
            resp = api.post(f"{API}/library/recent", json={"device_id": device, "track": t}, timeout=20)
            assert resp.status_code == 200, resp.text

    # Favorite the 6th
    fav = history_tracks[5]
    r = api.post(f"{API}/library/favorite", json={"device_id": device, "track": fav}, timeout=20)
    assert r.status_code == 200, r.text

    # Verify library plays counts
    lib = api.get(f"{API}/library", params={"device_id": device}, timeout=20).json()
    plays = lib.get("plays", {}) or {}
    for t in history_tracks[:5]:
        assert plays.get(t["id"], 0) >= 2, f"plays for {t['id']} = {plays.get(t['id'])}"

    # Build mixes with refresh=true
    r = api.get(f"{API}/home/mixes",
                params={"device_id": device, "refresh": "true"}, timeout=90)
    assert r.status_code == 200
    mixes = r.json()["mixes"]
    ids = {m["id"] for m in mixes}
    # Discover Mix
    assert "discover-mix" in ids, f"Missing discover-mix: {ids}"
    # At least one 'Your Mix N' whose subtitle names an artist
    your_mixes = [m for m in mixes if m["id"].startswith("your-mix-")]
    assert your_mixes, f"Expected a Your Mix N, got {ids}"
    artist_names = {(t.get("artist") or "").split(",")[0].strip().lower() for t in history_tracks}
    subtitle_ok = any(any(a and a in (m.get("subtitle") or "").lower() for a in artist_names)
                      for m in your_mixes)
    assert subtitle_ok, f"No Your Mix subtitle names a known artist. Subtitles: {[m.get('subtitle') for m in your_mixes]}"
    # On Repeat (plays >= 2 for >=4 tracks -> we posted 5 tracks × 2 plays)
    assert "on-repeat" in ids, f"Missing on-repeat: {ids}"

    # 2nd call without refresh should be quick (cached) and same mix ids
    t0 = time.time()
    r2 = api.get(f"{API}/home/mixes", params={"device_id": device}, timeout=15)
    elapsed = time.time() - t0
    assert r2.status_code == 200
    ids2 = {m["id"] for m in r2.json()["mixes"]}
    assert ids2 == ids, f"Cached mix ids differ: {ids} vs {ids2}"
    assert elapsed < 5.0, f"Cached mixes should be fast, took {elapsed:.2f}s"


# ---------------- Lyrics: Hinglish (no Devanagari) ----------------
@pytest.fixture(scope="module")
def hindi_trending(api):
    r = api.get(f"{API}/tracks/trending", params={"lang": "hindi", "limit": 8}, timeout=30)
    assert r.status_code == 200
    return r.json().get("tracks", [])


def test_lyrics_tum_hi_ho_no_devanagari(api):
    r = api.get(f"{API}/lyrics", params={
        "title": "Tum Hi Ho", "artist": "Arijit Singh", "duration": 262}, timeout=30)
    assert r.status_code == 200
    body = r.json()
    synced = body.get("synced") or ""
    plain = body.get("plain") or ""
    assert not DEVANAGARI.search(synced), "synced contains Devanagari (default should be latin)"
    assert not DEVANAGARI.search(plain), "plain contains Devanagari (default should be latin)"
    # Timestamps like [00:11.20] preserved when synced
    if synced:
        assert re.search(r"\[\d{2}:\d{2}\.\d{2}\]", synced), "Expected [MM:SS.xx] timestamps in synced"


def test_lyrics_script_native_ok(api):
    r = api.get(f"{API}/lyrics", params={
        "title": "Tum Hi Ho", "artist": "Arijit Singh",
        "duration": 262, "script": "native"}, timeout=30)
    assert r.status_code == 200  # may contain Devanagari OR Latin, just must be 200


def test_lyrics_hindi_trending_latin(api, hindi_trending):
    tested = 0
    for t in hindi_trending:
        if tested >= 3:
            break
        r = api.get(f"{API}/lyrics", params={
            "title": t["title"], "artist": t["artist"],
            "duration": t.get("duration") or 0,
            "track_id": t["id"]}, timeout=30)
        if r.status_code != 200:
            continue
        body = r.json()
        synced = body.get("synced") or ""
        plain = body.get("plain") or ""
        if not synced and not plain:
            continue  # instrumental / no lyrics found, skip
        assert not DEVANAGARI.search(synced), f"Devanagari in synced for {t['title']}"
        assert not DEVANAGARI.search(plain), f"Devanagari in plain for {t['title']}"
        tested += 1
    assert tested >= 1, "Could not test any Hindi trending lyrics"


# ---------------- Recommendations cleanliness ----------------
def test_related_cleanliness(api):
    r = api.get(f"{API}/tracks/search",
                params={"q": "barsaat banjaare", "limit": 1}, timeout=30)
    assert r.status_code == 200
    tracks = r.json().get("tracks", [])
    assert tracks, "No search hit for 'barsaat banjaare'"
    seed = tracks[0]
    seed_norm = _normalize_title(seed["title"])
    r = api.get(f"{API}/tracks/{seed['id']}/recommendations", timeout=30)
    assert r.status_code == 200
    recs = r.json().get("tracks", [])
    assert recs, "No recommendations for seed"
    seen_ids = set()
    seen_norm = set()
    for t in recs:
        assert t["id"] != seed["id"], "Recommendation includes seed id"
        norm = _normalize_title(t["title"])
        assert norm != seed_norm, f"Recommendation has same normalized title as seed: {t['title']}"
        assert not VARIANT_RX.search(t["title"]), f"Variant title leaked into recs: {t['title']}"
        assert t["id"] not in seen_ids, f"Duplicate id in recs: {t['id']}"
        assert norm not in seen_norm, f"Duplicate normalized title in recs: {t['title']}"
        seen_ids.add(t["id"])
        seen_norm.add(norm)
