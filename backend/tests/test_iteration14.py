"""Iteration 14 backend tests — Musixmatch RichSync word-level lyrics.

Acceptance:
1) GET /api/lyrics?title=Blinding Lights&artist=The Weeknd&duration=200&track_id=test1
   → 200, source=='musixmatch', `rich` non-empty list; each item has numeric start<=end,
   text, and words[] with monotonically non-decreasing t within the line and t>=start-0.05.
   `synced` LRC string present too.

2) For 5 Hindi trending tracks: GET /api/lyrics returns 200 with keys synced/plain/
   instrumental/source/rich. If rich is non-null: validate structure + no Devanagari
   in rich word texts. Second call is fast (<0.5s) — Mongo cache.

3) Regression: /api/tracks/trending, /api/search?q=arijit, recommendations still 200.
"""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL must be set")
API = f"{BASE_URL}/api"

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _validate_rich(rich, label=""):
    """Return list of failures; empty means valid."""
    fails = []
    if not isinstance(rich, list) or len(rich) == 0:
        fails.append(f"{label}: rich empty or not a list")
        return fails
    for i, line in enumerate(rich):
        if not isinstance(line, dict):
            fails.append(f"{label}[{i}]: not a dict")
            continue
        start = line.get("start")
        end = line.get("end")
        text = line.get("text")
        words = line.get("words")
        if not isinstance(start, (int, float)):
            fails.append(f"{label}[{i}].start not numeric: {start}")
            continue
        if not isinstance(end, (int, float)):
            fails.append(f"{label}[{i}].end not numeric: {end}")
            continue
        if start > end:
            fails.append(f"{label}[{i}] start>{end}: {start}>{end}")
        if not isinstance(text, str) or not text.strip():
            fails.append(f"{label}[{i}].text empty")
        if not isinstance(words, list) or len(words) == 0:
            fails.append(f"{label}[{i}].words empty")
            continue
        # monotonically non-decreasing t within line, t >= start-0.05
        prev_t = -float("inf")
        for j, w in enumerate(words):
            wt = w.get("t")
            if not isinstance(wt, (int, float)):
                fails.append(f"{label}[{i}].words[{j}].t not numeric: {wt}")
                continue
            if wt < start - 0.05:
                fails.append(f"{label}[{i}].words[{j}].t={wt} < start-0.05={start-0.05}")
            if wt < prev_t:
                fails.append(f"{label}[{i}].words[{j}].t={wt} < prev_t={prev_t}")
            prev_t = wt
            if not isinstance(w.get("text"), str):
                fails.append(f"{label}[{i}].words[{j}].text not string")
    return fails


# -- 1) Blinding Lights cached rich lyrics ------------------------------------
class TestBlindingLightsRich:
    def test_blinding_lights_rich(self, api):
        params = {
            "title": "Blinding Lights",
            "artist": "The Weeknd",
            "duration": 200,
            "track_id": "test1",
        }
        r = api.get(f"{API}/lyrics", params=params, timeout=60)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:200]}"
        body = r.json()
        assert body.get("source") == "musixmatch", f"source={body.get('source')}"
        rich = body.get("rich")
        assert isinstance(rich, list) and len(rich) > 0, f"rich empty: {rich}"

        fails = _validate_rich(rich, label="blinding_lights")
        assert not fails, "rich structure failures:\n  - " + "\n  - ".join(fails)

        synced = body.get("synced")
        assert isinstance(synced, str) and len(synced) > 0, "synced LRC missing"
        assert "[" in synced and "]" in synced, "synced not LRC format"

    def test_blinding_lights_second_call_is_fast(self, api):
        """Second call should be served from Mongo cache — <0.5s."""
        params = {
            "title": "Blinding Lights",
            "artist": "The Weeknd",
            "duration": 200,
            "track_id": "test1",
        }
        # warm-up
        api.get(f"{API}/lyrics", params=params, timeout=30)
        t0 = time.time()
        r = api.get(f"{API}/lyrics", params=params, timeout=10)
        dt = time.time() - t0
        assert r.status_code == 200
        assert dt < 0.5, f"cached call too slow: {dt:.3f}s"


# -- 2) Hindi tracks: shape + optional rich validation ------------------------
class TestHindiTracksLyrics:
    @pytest.fixture(scope="class")
    def hindi_tracks(self, api):
        r = api.get(f"{API}/tracks/trending", params={"genre": "hindi", "limit": 5}, timeout=45)
        assert r.status_code == 200, f"trending {r.status_code}"
        body = r.json()
        tracks = body.get("tracks") if isinstance(body, dict) else body
        assert isinstance(tracks, list) and len(tracks) >= 5
        return tracks[:5]

    def test_five_hindi_tracks_lyrics_shape_and_rich(self, api, hindi_tracks):
        failures = []
        rich_seen = 0
        second_call_times = []
        for t in hindi_tracks:
            params = {
                "title": t.get("title") or "",
                "artist": t.get("artist") or "",
                "album": t.get("album") or "",
                "duration": t.get("duration") or 0,
                "track_id": t.get("id") or "",
            }
            # sequential (Musixmatch is throttled to 1/4s and captcha-blocks bursts)
            r = api.get(f"{API}/lyrics", params=params, timeout=60)
            if r.status_code != 200:
                failures.append(f"{t.get('title')}: status {r.status_code}")
                continue
            body = r.json()
            # required keys
            for k in ("synced", "plain", "instrumental", "source", "rich"):
                if k not in body:
                    failures.append(f"{t.get('title')}: missing key {k}")
            rich = body.get("rich")
            if rich:
                rich_seen += 1
                fails = _validate_rich(rich, label=t.get("title") or "")
                if fails:
                    failures.extend(fails)
                # No Devanagari in rich word texts (musixmatch returns romanised)
                for i, line in enumerate(rich):
                    for j, w in enumerate(line.get("words") or []):
                        if DEVANAGARI_RE.search(w.get("text") or ""):
                            failures.append(
                                f"{t.get('title')}: Devanagari in rich[{i}].words[{j}].text='{w.get('text')}'"
                            )

            # Second-call cache probe
            t0 = time.time()
            r2 = api.get(f"{API}/lyrics", params=params, timeout=10)
            dt = time.time() - t0
            if r2.status_code == 200:
                second_call_times.append((t.get("title"), dt))

        # every cached second-call must be <0.5s
        slow = [f"{name}: {dt:.3f}s" for name, dt in second_call_times if dt >= 0.5]
        assert not slow, f"Cached second calls too slow: {slow}"
        assert not failures, "Hindi lyrics failures:\n  - " + "\n  - ".join(failures)
        print(f"rich_seen={rich_seen}/{len(hindi_tracks)}")


# -- 3) Regression ------------------------------------------------------------
class TestRegression:
    def test_trending(self, api):
        r = api.get(f"{API}/tracks/trending", timeout=30)
        assert r.status_code == 200

    def test_trending_hindi(self, api):
        r = api.get(f"{API}/tracks/trending", params={"genre": "hindi", "limit": 5}, timeout=30)
        assert r.status_code == 200

    def test_search_arijit(self, api):
        r = api.get(f"{API}/search", params={"q": "arijit"}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        # body should either be a list or contain tracks/suggestions
        assert isinstance(body, (list, dict))

    def test_recommendations(self, api):
        # First pull one trending track id, then check recommendations
        r = api.get(f"{API}/tracks/trending", params={"limit": 1}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        tracks = body.get("tracks") if isinstance(body, dict) else body
        assert tracks and len(tracks) >= 1
        tid = tracks[0].get("id")
        assert tid
        rr = api.get(f"{API}/tracks/{tid}/recommendations", timeout=30)
        assert rr.status_code == 200, f"recommendations status={rr.status_code} body={rr.text[:200]}"
