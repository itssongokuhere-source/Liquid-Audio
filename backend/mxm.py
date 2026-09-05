"""Musixmatch RichSync client — word-level synced lyrics (the data behind karaoke-style players).

Uses the Android app's signed API. One request per new song; results are cached by the caller.
The service captcha-blocks noisy clients, so calls are throttled and a block pauses lookups.
"""
import asyncio
import base64
import datetime
import hashlib
import hmac
import json
import logging
import re
import time
import urllib.parse
import uuid
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("liquidaudio.mxm")

API = "https://apic.musixmatch.com/ws/1.1/"
APP_ID = "android-player-v1.0"
SECRET = b"IEJ5E8XFaHQvIQNfs7IC"
MIN_INTERVAL = 4.0          # seconds between upstream calls (bursts trigger a captcha block)
BLOCK_SECONDS = 10 * 60     # pause after a captcha response


class MxmBlocked(Exception):
    pass


def _norm(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[\(\[].*?[\)\]]", " ", s)
    s = re.sub(r"\s*[-–|].*$", "", s)
    s = re.sub(r"[^a-z0-9\u0900-\u097f ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


VARIANTS = ("remix", "slowed", "reverb", "lofi", "lo-fi", "mashup", "unplugged", "cover",
            "instrumental", "karaoke", "8d", "sped up", "reprise", "acoustic", "live", "version")


def _is_variant(title: str) -> bool:
    t = (title or "").lower()
    return any(v in t for v in VARIANTS)


def _fmt_lrc(t: float) -> str:
    m = int(t // 60)
    return f"[{m:02d}:{t - m * 60:05.2f}]"


class Musixmatch:
    def __init__(self, kv_collection):
        self.kv = kv_collection
        self.token: Optional[str] = None
        self.guid: Optional[str] = None
        self.blocked_until = 0.0
        self.last_call = 0.0
        self.lock = asyncio.Lock()

    # -- plumbing -----------------------------------------------------------
    @staticmethod
    def _sign(url: str) -> str:
        day = datetime.datetime.utcnow().strftime("%Y%m%d")
        sig = base64.b64encode(hmac.new(SECRET, (url + day).encode(), hashlib.sha256).digest()).decode()
        return f"{url}&signature={urllib.parse.quote(sig, safe='')}&signature_protocol=sha256"

    async def _raw(self, http: httpx.AsyncClient, action: str, params: Dict[str, Any]) -> dict:
        if time.time() < self.blocked_until:
            raise MxmBlocked()
        wait = MIN_INTERVAL - (time.time() - self.last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        self.last_call = time.time()
        q = dict(params)
        q.update({"app_id": APP_ID, "format": "json"})
        url = self._sign(API + action + "?" + urllib.parse.urlencode(q))
        r = await http.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
        data = r.json()
        header = data.get("message", {}).get("header", {})
        if header.get("status_code") == 401:
            if header.get("hint") == "captcha":
                self.blocked_until = time.time() + BLOCK_SECONDS
                await self.kv.update_one({"_id": "mxm_token"}, {"$set": {"blocked_until": self.blocked_until}}, upsert=True)
                logger.warning("musixmatch captcha — pausing lookups for %ss", BLOCK_SECONDS)
                raise MxmBlocked()
            self.token = None  # renew
        return data

    async def _ensure_token(self, http: httpx.AsyncClient) -> str:
        if self.token:
            return self.token
        doc = await self.kv.find_one({"_id": "mxm_token"})
        if doc and doc.get("token"):
            self.token, self.guid = doc["token"], doc.get("guid")
            self.blocked_until = max(self.blocked_until, float(doc.get("blocked_until") or 0))
            if time.time() < self.blocked_until:
                raise MxmBlocked()
            return self.token
        self.guid = self.guid or str(uuid.uuid4())
        data = await self._raw(http, "token.get", {"guid": self.guid})
        tok = (data.get("message", {}).get("body") or {}).get("user_token")
        if not tok or set(tok) == {"0"}:
            raise MxmBlocked()
        self.token = tok
        await self.kv.update_one({"_id": "mxm_token"}, {"$set": {"token": tok, "guid": self.guid, "at": time.time()}}, upsert=True)
        return tok

    async def _call(self, http: httpx.AsyncClient, action: str, params: Dict[str, Any]) -> dict:
        tok = await self._ensure_token(http)
        data = await self._raw(http, action, {**params, "usertoken": tok})
        if data.get("message", {}).get("header", {}).get("status_code") == 401 and not self.token:
            await self.kv.delete_one({"_id": "mxm_token"})
            tok = await self._ensure_token(http)
            data = await self._raw(http, action, {**params, "usertoken": tok})
        return data

    # -- lyrics -------------------------------------------------------------
    async def lookup(self, http: httpx.AsyncClient, title: str, artist: str, duration: float) -> Optional[dict]:
        """Returns {"rich": [...], "synced": lrc|None, "plain": str|None, "track": {...}} or None."""
        async with self.lock:
            params = {
                "namespace": "lyrics_richsynched",
                "subtitle_format": "mxm",
                "q_track": title,
                "q_artist": artist,
                "optional_calls": "track.richsync",
            }
            if duration:
                params["q_duration"] = int(round(duration))
            data = await self._call(http, "macro.subtitles.get", params)
        calls = ((data.get("message") or {}).get("body") or {}).get("macro_calls") or {}
        track = (((calls.get("matcher.track.get") or {}).get("message") or {}).get("body") or {}).get("track") or {}
        if not track:
            return None
        # Reject look-alikes: other song, remix/cover of it, or a different edit (duration).
        want, got = _norm(title), _norm(track.get("track_name") or "")
        if not (want and got) or not (want == got or want in got or got in want):
            return None
        if _is_variant(track.get("track_name") or "") != _is_variant(title):
            return None
        tl = float(track.get("track_length") or 0)
        if duration and tl and abs(tl - duration) > 4:
            return None

        out: Dict[str, Any] = {"rich": None, "synced": None, "plain": None,
                               "track": {"id": track.get("track_id"), "name": track.get("track_name"),
                                         "artist": track.get("artist_name"), "length": tl}}
        rs = (((calls.get("track.richsync.get") or {}).get("message") or {}).get("body") or {})
        body = (rs.get("richsync") or {}).get("richsync_body") if isinstance(rs, dict) else None
        if body:
            try:
                out["rich"] = _parse_richsync(json.loads(body), duration)
            except Exception as e:
                logger.warning("richsync parse failed: %s", e)
        if out["rich"]:
            out["synced"] = "\n".join(f"{_fmt_lrc(l['start'])}{l['text']}" for l in out["rich"])
            out["plain"] = "\n".join(l["text"] for l in out["rich"])
            return out
        subs = (((calls.get("track.subtitles.get") or {}).get("message") or {}).get("body") or {})
        sub_list = subs.get("subtitle_list") if isinstance(subs, dict) else None
        if sub_list:
            try:
                rows = json.loads(sub_list[0]["subtitle"]["subtitle_body"])
                out["synced"] = "\n".join(f"{_fmt_lrc(float(r['time']['total']))}{r.get('text', '')}" for r in rows)
                out["plain"] = "\n".join(r.get("text", "") for r in rows)
            except Exception as e:
                logger.warning("subtitle parse failed: %s", e)
        return out if out["synced"] else None


def _parse_richsync(raw: List[dict], duration: float) -> Optional[List[dict]]:
    lines: List[dict] = []
    for row in raw:
        ts = float(row.get("ts") or 0)
        te = float(row.get("te") or ts)
        words: List[dict] = []
        cur: Optional[dict] = None
        for tok in row.get("l") or []:
            c = tok.get("c") or ""
            if not c.strip():
                cur = None
                continue
            if cur is None:
                cur = {"t": round(ts + float(tok.get("o") or 0), 3), "text": c}
                words.append(cur)
            else:
                cur["text"] += c
        text = (row.get("x") or " ".join(w["text"] for w in words)).strip()
        if not text:
            continue
        lines.append({"start": round(ts, 3), "end": round(te, 3), "text": text, "words": words})
    if len(lines) < 4:
        return None
    if duration and lines[-1]["start"] > duration + 3:
        return None  # timed against a longer edit of the song
    return lines
