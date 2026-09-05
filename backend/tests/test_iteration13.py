"""Iteration 13 backend tests — verify /api/lyrics for Hindi trending tracks.

Acceptance:
- For 5 Hindi trending tracks (GET /api/tracks/trending?genre=hindi&limit=5):
  - GET /api/lyrics with title/artist/album/duration/track_id → 200
  - Where synced is returned: first LRC timestamp is <= 60s AND >=10 timestamped lines
  - Response text is not Devanagari
- Deliberately wrong duration (duration=999) still returns 200 (plain or synced fallback) — never 500.
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL must be set")
API = f"{BASE_URL}/api"

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
LRC_TS_RE = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def hindi_tracks(api):
    r = api.get(f"{API}/tracks/trending", params={"genre": "hindi", "limit": 5}, timeout=45)
    assert r.status_code == 200, f"trending {r.status_code} {r.text[:200]}"
    body = r.json()
    tracks = body.get("tracks") if isinstance(body, dict) else body
    assert isinstance(tracks, list) and len(tracks) >= 5, f"Expected >=5 hindi tracks, got {tracks}"
    return tracks[:5]


def _first_ts_seconds(lrc: str) -> float | None:
    for line in lrc.split("\n"):
        m = LRC_TS_RE.search(line)
        if m:
            return int(m.group(1)) * 60 + float(m.group(2))
    return None


def _num_timestamped_lines(lrc: str) -> int:
    count = 0
    for line in lrc.split("\n"):
        if LRC_TS_RE.search(line):
            # Ensure the line has some content beyond just the timestamp
            content = LRC_TS_RE.sub("", line).strip()
            if content:
                count += 1
    return count


def test_lyrics_for_5_hindi_trending_tracks(api, hindi_tracks):
    """For each of 5 Hindi trending tracks: /api/lyrics returns 200; if synced,
    first timestamp <=60s and >=10 timestamped lines; no Devanagari in returned text."""
    failures = []
    synced_seen = 0
    for t in hindi_tracks:
        params = {
            "title": t.get("title") or "",
            "artist": t.get("artist") or "",
            "album": t.get("album") or "",
            "duration": t.get("duration") or 0,
            "track_id": t.get("id") or "",
        }
        r = api.get(f"{API}/lyrics", params=params, timeout=60)
        if r.status_code != 200:
            failures.append(f"{t.get('title')}: status {r.status_code} {r.text[:120]}")
            continue
        body = r.json()
        synced = body.get("synced")
        plain = body.get("plain")

        # No Devanagari in whichever text we get back
        for label, txt in (("synced", synced), ("plain", plain)):
            if txt and DEVANAGARI_RE.search(txt):
                failures.append(f"{t.get('title')}: Devanagari present in {label}")

        if synced:
            synced_seen += 1
            first_ts = _first_ts_seconds(synced)
            n_lines = _num_timestamped_lines(synced)
            if first_ts is None or first_ts > 60:
                failures.append(f"{t.get('title')}: first LRC ts {first_ts}s > 60s")
            if n_lines < 10:
                failures.append(f"{t.get('title')}: only {n_lines} timestamped lines")

    assert not failures, "Lyrics acceptance failures:\n  - " + "\n  - ".join(failures)
    # Advisory only: we don't force every track to have synced (fallback allowed)
    print(f"synced_seen={synced_seen}/{len(hindi_tracks)}")


def test_lyrics_wrong_duration_never_500(api, hindi_tracks):
    """A wildly wrong duration must never yield 500 — plain or empty fallback allowed."""
    t = hindi_tracks[0]
    params = {
        "title": t.get("title") or "",
        "artist": t.get("artist") or "",
        "album": t.get("album") or "",
        "duration": 999,
        "track_id": t.get("id") or "",
    }
    r = api.get(f"{API}/lyrics", params=params, timeout=60)
    assert r.status_code == 200, f"Expected 200 on wrong duration, got {r.status_code} {r.text[:200]}"
    body = r.json()
    # Body must include the shape we expect (keys), values may be None
    for k in ("synced", "plain", "instrumental", "source"):
        assert k in body, f"Missing key {k} in lyrics response: {body}"


def test_lyrics_wrong_duration_all_five(api, hindi_tracks):
    """Repeat the wrong-duration probe across all 5 tracks — none should 500."""
    bad = []
    for t in hindi_tracks:
        params = {
            "title": t.get("title") or "",
            "artist": t.get("artist") or "",
            "album": t.get("album") or "",
            "duration": 999,
            "track_id": t.get("id") or "",
        }
        r = api.get(f"{API}/lyrics", params=params, timeout=60)
        if r.status_code != 200:
            bad.append(f"{t.get('title')}: {r.status_code}")
    assert not bad, f"Non-200 with bad duration: {bad}"
