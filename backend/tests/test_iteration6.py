"""
Iteration 6 backend tests for LiquidAudio.

Covers:
  * /api/search/suggest (YouTube-Music-style autocomplete)
  * /api/lyrics (Hindi tracks / synced + plain fallback)
  * /api/jam REST (create / get / delete + auth)
  * /api/jam/ws/{code} WebSocket sync (host/guest hello, members, state,
    control, add_track, ping/pong, ended-on-host-disconnect)
"""

import asyncio
import json
import os
import re
import time
from typing import Any, Dict, List, Optional

import pytest
import requests
import websockets

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as _f:
        for _line in _f:
            if _line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = _line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

API = f"{BASE_URL}/api"
LOCAL_API = "http://localhost:8001/api"
LOCAL_WS = "ws://localhost:8001/api"


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def s() -> requests.Session:
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------------------------------------------------------------------------
# /api/search/suggest
# ---------------------------------------------------------------------------
class TestSearchSuggest:
    def test_suggest_arij(self, s):
        r = s.get(f"{API}/search/suggest", params={"q": "arij"}, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("suggestions"), list)
        assert isinstance(j.get("entities"), list)
        assert len(j["suggestions"]) > 0
        texts = [x.get("text", "") for x in j["suggestions"]]
        assert all(isinstance(t, str) and t.strip() for t in texts)
        # 'Arijit Singh' should be present
        assert any("arijit" in t.lower() for t in texts), f"'Arijit Singh' missing: {texts}"
        # entities: check types present
        types = {e.get("type") for e in j["entities"]}
        assert types & {"song", "artist", "album"}, f"no entity types: {types}"
        # song entities must have a 'track' with id/title/artist/artwork
        songs = [e for e in j["entities"] if e.get("type") == "song"]
        assert songs, "no song entities"
        tr = songs[0].get("track")
        assert isinstance(tr, dict), "song.track missing"
        for k in ("id", "title", "artist", "artwork"):
            assert k in tr, f"song.track missing key '{k}' (got {list(tr.keys())})"

    def test_suggest_kesar(self, s):
        r = s.get(f"{API}/search/suggest", params={"q": "kesar"}, timeout=20)
        assert r.status_code == 200
        j = r.json()
        texts = " | ".join(x.get("text", "") for x in j["suggestions"])
        # Kesariya should appear in either suggestion texts or entity titles
        entity_titles = " | ".join(e.get("title", "") for e in j["entities"])
        combined = f"{texts} | {entity_titles}".lower()
        assert "kesariya" in combined, f"Kesariya not found in suggest results: {combined}"

    def test_suggest_short_query(self, s):
        r = s.get(f"{API}/search/suggest", params={"q": "a"}, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "suggestions" in j and "entities" in j

    def test_suggest_missing_q(self, s):
        r = s.get(f"{API}/search/suggest", timeout=10)
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# /api/lyrics
# ---------------------------------------------------------------------------
class TestLyrics:
    def test_hindi_trending_lyrics_mostly_synced(self, s):
        r = s.get(f"{API}/tracks/trending", params={"genre": "hindi", "limit": 6}, timeout=25)
        assert r.status_code == 200, r.text
        payload = r.json()
        tracks = payload.get("tracks", payload) if isinstance(payload, dict) else payload
        assert isinstance(tracks, list) and len(tracks) >= 3, f"got {len(tracks) if isinstance(tracks, list) else 'x'} tracks"

        synced_count = 0
        source_lrclib_count = 0
        checked = 0
        for t in tracks[:6]:
            params = {
                "title": t.get("title", ""),
                "artist": t.get("artist", ""),
                "album": t.get("album", "") or "",
                "duration": t.get("duration", 0) or 0,
                "track_id": t.get("id", ""),
            }
            rr = s.get(f"{API}/lyrics", params=params, timeout=25)
            assert rr.status_code == 200, f"lyrics failed for {t.get('title')}: {rr.status_code} {rr.text}"
            body = rr.json()
            # required keys
            for k in ("synced", "plain", "instrumental", "source"):
                assert k in body, f"lyrics response missing '{k}': {body.keys()}"
            checked += 1
            if body.get("synced"):
                synced_count += 1
                if body.get("source") == "lrclib":
                    source_lrclib_count += 1
        print(f"Hindi trending lyrics: {synced_count}/{checked} synced ({source_lrclib_count} via lrclib)")
        # Spec: at least 3 of 6 should have synced (non-null) with source 'lrclib'
        assert synced_count >= 3, f"only {synced_count}/{checked} tracks had synced lyrics (want >=3)"
        assert source_lrclib_count >= 3, f"only {source_lrclib_count}/{checked} from lrclib (want >=3)"

    def test_lyrics_with_from_movie_suffix(self, s):
        # search 'Kesariya' via /api/tracks/search, pick top hit, get lyrics
        r = s.get(f"{API}/tracks/search", params={"q": "Kesariya"}, timeout=20)
        assert r.status_code == 200
        payload = r.json()
        arr = payload.get("tracks", payload) if isinstance(payload, dict) else payload
        assert isinstance(arr, list) and arr, "no search results for Kesariya"
        top = arr[0]
        assert "kesariya" in top.get("title", "").lower()
        params = {
            "title": top.get("title", ""),
            "artist": top.get("artist", ""),
            "album": top.get("album", "") or "",
            "duration": top.get("duration", 0) or 0,
            "track_id": top.get("id", ""),
        }
        rr = s.get(f"{API}/lyrics", params=params, timeout=25)
        assert rr.status_code == 200
        body = rr.json()
        # either synced or plain must be present (Kesariya has widely-available lyrics)
        assert body.get("synced") or body.get("plain"), f"no lyrics for Kesariya: {body}"


# ---------------------------------------------------------------------------
# /api/jam REST
# ---------------------------------------------------------------------------
class TestJamRest:
    def test_jam_create_get_delete_flow(self, s):
        # create
        r = s.post(f"{API}/jam", json={"device_id": "hostdev", "name": "Host"}, timeout=10)
        assert r.status_code == 200, r.text
        j = r.json()
        code = j.get("code")
        assert isinstance(code, str) and len(code) == 6, f"bad code: {code!r}"
        assert re.fullmatch(r"[A-Z0-9]{6}", code), f"code has invalid chars: {code}"
        assert j.get("host_device") == "hostdev"
        assert isinstance(j.get("members"), list)
        assert isinstance(j.get("server_time"), (int, float))

        # GET back
        r2 = s.get(f"{API}/jam/{code}", timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("code") == code

        # nonexistent
        r3 = s.get(f"{API}/jam/NOPE00", timeout=10)
        assert r3.status_code == 404

        # server_time endpoint
        r4 = s.get(f"{API}/jam/time", timeout=10)
        assert r4.status_code == 200
        assert isinstance(r4.json().get("server_time"), (int, float))

        # DELETE with wrong device -> 403
        r5 = s.delete(f"{API}/jam/{code}", params={"device_id": "other"}, timeout=10)
        assert r5.status_code == 403

        # DELETE with host -> {ended:true}
        r6 = s.delete(f"{API}/jam/{code}", params={"device_id": "hostdev"}, timeout=10)
        assert r6.status_code == 200
        assert r6.json().get("ended") is True

        # gone
        r7 = s.get(f"{API}/jam/{code}", timeout=10)
        assert r7.status_code == 404


# ---------------------------------------------------------------------------
# /api/jam/ws/{code} WebSocket
# ---------------------------------------------------------------------------
async def _recv_with_timeout(ws, timeout=5.0) -> Dict[str, Any]:
    raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
    return json.loads(raw)


async def _drain_until(ws, wanted_type: str, timeout=5.0) -> Dict[str, Any]:
    end = time.time() + timeout
    while time.time() < end:
        remaining = max(0.1, end - time.time())
        msg = await _recv_with_timeout(ws, timeout=remaining)
        if msg.get("type") == wanted_type:
            return msg
    raise AssertionError(f"did not receive '{wanted_type}' within {timeout}s")


@pytest.mark.asyncio
async def test_jam_websocket_flow():
    # create a jam room via REST (local)
    r = requests.post(f"{LOCAL_API}/jam", json={"device_id": "hostdev-ws", "name": "Host"}, timeout=10)
    assert r.status_code == 200
    code = r.json()["code"]

    host_url = f"{LOCAL_WS}/jam/ws/{code}?device_id=hostdev-ws&name=Host"
    guest_url = f"{LOCAL_WS}/jam/ws/{code}?device_id=guestdev-ws&name=Guest"

    try:
        async with websockets.connect(host_url) as host_ws:
            hello_h = await _recv_with_timeout(host_ws)
            assert hello_h.get("type") == "hello"
            assert isinstance(hello_h.get("server_time"), (int, float))
            assert isinstance(hello_h.get("room"), dict)

            async with websockets.connect(guest_url) as guest_ws:
                hello_g = await _recv_with_timeout(guest_ws)
                assert hello_g.get("type") == "hello"

                # host should get 'members' with 2 entries
                members_msg = await _drain_until(host_ws, "members")
                members = members_msg.get("members") or []
                assert len(members) == 2
                assert {m["device"] for m in members} == {"hostdev-ws", "guestdev-ws"}
                assert any(m["host"] for m in members)

                # host sends state -> guest receives type 'state' with at + server_time
                await host_ws.send(json.dumps({
                    "type": "state",
                    "state": {
                        "track": {"id": "t1", "title": "T", "artist": "A", "duration": 200},
                        "position": 10,
                        "playing": True,
                    },
                }))
                st = await _drain_until(guest_ws, "state")
                assert isinstance(st.get("state"), dict)
                assert "at" in st["state"]
                assert isinstance(st.get("server_time"), (int, float))
                assert st["state"]["track"]["id"] == "t1"

                # guest -> control 'toggle' -> host receives control
                await guest_ws.send(json.dumps({"type": "control", "action": "toggle"}))
                ctl = await _drain_until(host_ws, "control")
                assert ctl.get("action") == "toggle"
                assert ctl.get("from_name") == "Guest"

                # guest -> add_track -> host receives add_track
                await guest_ws.send(json.dumps({
                    "type": "add_track",
                    "track": {"id": "t2", "title": "X", "artist": "Y", "duration": 100},
                }))
                at = await _drain_until(host_ws, "add_track")
                assert at.get("track", {}).get("id") == "t2"
                assert at.get("from_name") == "Guest"

                # ping/pong
                await host_ws.send(json.dumps({"type": "ping", "client_time": 123}))
                pong = await _drain_until(host_ws, "pong")
                assert pong.get("client_time") == 123
                assert isinstance(pong.get("server_time"), (int, float))

            # guest_ws closes here — host may receive members update; drain briefly
            try:
                await asyncio.wait_for(host_ws.recv(), timeout=1.0)
            except Exception:
                pass

        # host disconnected — jam should be gone
        await asyncio.sleep(0.3)
        r2 = requests.get(f"{LOCAL_API}/jam/{code}", timeout=10)
        assert r2.status_code == 404, f"jam should be gone after host disconnect, got {r2.status_code}"
    finally:
        # cleanup best-effort
        requests.delete(f"{LOCAL_API}/jam/{code}", params={"device_id": "hostdev-ws"}, timeout=5)


@pytest.mark.asyncio
async def test_jam_ws_host_disconnect_sends_ended_to_guest():
    r = requests.post(f"{LOCAL_API}/jam", json={"device_id": "hostdev-ws2", "name": "Host"}, timeout=10)
    code = r.json()["code"]
    host_url = f"{LOCAL_WS}/jam/ws/{code}?device_id=hostdev-ws2&name=Host"
    guest_url = f"{LOCAL_WS}/jam/ws/{code}?device_id=guestdev-ws2&name=Guest"

    try:
        host_ws = await websockets.connect(host_url)
        await _recv_with_timeout(host_ws)  # hello
        guest_ws = await websockets.connect(guest_url)
        await _recv_with_timeout(guest_ws)  # hello (guest)
        # drain host 'members'
        await _drain_until(host_ws, "members")

        # host disconnects
        await host_ws.close()

        ended = await _drain_until(guest_ws, "ended", timeout=5.0)
        assert ended.get("type") == "ended"

        await guest_ws.close()
        await asyncio.sleep(0.2)
        r2 = requests.get(f"{LOCAL_API}/jam/{code}", timeout=10)
        assert r2.status_code == 404
    finally:
        requests.delete(f"{LOCAL_API}/jam/{code}", params={"device_id": "hostdev-ws2"}, timeout=5)


# ---------------------------------------------------------------------------
# Also try WSS via public URL if it uses https (best-effort informational)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_jam_ws_public_wss_best_effort():
    if not BASE_URL.startswith("https://"):
        pytest.skip("public URL is not https")
    r = requests.post(f"{API}/jam", json={"device_id": "hostdev-wss", "name": "Host"}, timeout=15)
    assert r.status_code == 200
    code = r.json()["code"]
    wss_base = "wss://" + BASE_URL.split("://", 1)[1] + "/api"
    host_url = f"{wss_base}/jam/ws/{code}?device_id=hostdev-wss&name=Host"
    try:
        async with websockets.connect(host_url, open_timeout=10) as ws:
            hello = await _recv_with_timeout(ws, timeout=8)
            assert hello.get("type") == "hello"
    except Exception as e:
        # ingress may not proxy WS; report but don't fail the whole run
        pytest.skip(f"public WSS not reachable via ingress: {e}")
    finally:
        requests.delete(f"{API}/jam/{code}", params={"device_id": "hostdev-wss"}, timeout=10)
