from fastapi import FastAPI, APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone
import uuid
import base64
import html as html_lib
import httpx
from Crypto.Cipher import DES

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

APP_NAME = "LiquidAudio"
JIOSAAVN = "https://www.jiosaavn.com/api.php"
JS_COMMON = {"_format": "json", "_marker": "0", "api_version": "4", "ctx": "web6dot0"}
DES_KEY = b"38346591"
LRCLIB_BASE = "https://lrclib.net"

app = FastAPI(title="LiquidAudio API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("liquidaudio")

# Shared async HTTP client
_http: Optional[httpx.AsyncClient] = None


async def get_http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        )
    return _http


def _clean(s: Optional[str]) -> str:
    return html_lib.unescape(s or "").replace("&quot;", '"').strip()


def decrypt_url(enc: Optional[str], quality: str = "320") -> Optional[str]:
    if not enc:
        return None
    try:
        cipher = DES.new(DES_KEY, DES.MODE_ECB)
        dec = cipher.decrypt(base64.b64decode(enc))
        dec = dec[: -dec[-1]]  # PKCS5 unpad
        url = dec.decode("utf-8", "ignore")
        q = quality if quality in ("96", "160", "320") else "320"
        return url.replace("_96.mp4", f"_{q}.mp4")
    except Exception as e:
        logger.warning("decrypt failed: %s", e)
        return None


async def js_get(params: dict) -> Any:
    http = await get_http()
    q = dict(JS_COMMON)
    q.update(params)
    r = await http.get(JIOSAAVN, params=q)
    r.raise_for_status()
    try:
        return r.json()
    except Exception:
        import json as _json
        return _json.loads(r.text.strip())


def _img(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    return url.replace("50x50", "500x500").replace("150x150", "500x500")


def normalize_song(s: dict) -> Dict[str, Any]:
    mi = s.get("more_info") or {}
    amap = mi.get("artistMap") or {}
    primary = amap.get("primary_artists") or []
    all_artists = amap.get("artists") or []
    # Singers are what listeners think of as "the artist" — put them first (composers/lyricists after).
    ordered: List[dict] = []
    seen_ids = set()

    def push(a: dict, role: str):
        aid = str(a.get("id") or "")
        name = _clean(a.get("name"))
        if not name or aid in seen_ids or name.lower() in {x["name"].lower() for x in ordered}:
            return
        seen_ids.add(aid)
        ordered.append({"id": aid or None, "name": name, "role": role})

    non_singer_names = {_clean(a.get("name")).lower() for a in all_artists
                        if (a.get("role") or "").lower() in ("music", "lyricist", "starring", "director", "producer")}
    # Pure singers first (people credited as singer but NOT also composer/lyricist), then the rest.
    for a in all_artists:
        if (a.get("role") or "").lower() == "singer" and _clean(a.get("name")).lower() not in non_singer_names:
            push(a, "singer")
    for a in all_artists:
        if (a.get("role") or "").lower() == "singer":
            push(a, "singer")
    for a in primary:  # primary artists that are not composers/lyricists are (almost always) the singers
        if _clean(a.get("name")).lower() not in non_singer_names:
            push(a, "singer")
    for a in primary:
        push(a, "primary")
    for a in all_artists:
        if (a.get("role") or "").lower() == "music":
            push(a, "music")
    if ordered:
        artist = ", ".join(x["name"] for x in ordered[:2])
        artist_id = next((x["id"] for x in ordered if x["id"]), None)
    else:
        artist = _clean(mi.get("primary_artists") or mi.get("singers")) or \
            _clean((s.get("subtitle") or "").split(" - ")[-1]) or "Unknown Artist"
        artist_id = None
        if artist and artist != "Unknown Artist":
            ordered = [{"id": None, "name": n.strip(), "role": "singer"} for n in artist.split(",")[:3]]
    enc = mi.get("encrypted_media_url")
    return {
        "id": str(s.get("id", "")),
        "title": _clean(s.get("title") or s.get("song")),
        "artist": artist or "Unknown Artist",
        "artistHandle": artist_id,
        "artists": ordered[:4],
        "artwork": _img(s.get("image")),
        "duration": int(mi.get("duration") or s.get("duration") or 0),
        "genre": s.get("language"),
        "album": _clean(mi.get("album") or s.get("album")),
        "previewUrl": decrypt_url(enc),
        "playCount": int(s.get("play_count") or 0) if str(s.get("play_count") or "").isdigit() else 0,
        "favoriteCount": 0,
    }


def _songs_from(data: Any, pid: Optional[str] = None) -> List[dict]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        if "songs" in data and isinstance(data["songs"], list):
            return data["songs"]
        if pid and pid in data and isinstance(data[pid], dict):
            return [data[pid]]
        if "results" in data and isinstance(data["results"], list):
            return data["results"]
    return []


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "LiquidAudio API", "status": "ok"}


@api_router.get("/tracks/trending")
async def trending(genre: Optional[str] = None,
                   limit: int = Query(30, ge=1, le=50)):
    language = (genre or "hindi").strip().lower()
    if language in ("for you", "foryou", "all", ""):
        language = "hindi"
    try:
        data = await js_get({
            "__call": "content.getTrending",
            "entity_type": "song",
            "entity_language": language,
        })
        items = _songs_from(data)
    except Exception as e:
        logger.warning("trending failed: %s", e)
        items = []
    tracks = [normalize_song(s) for s in items if s.get("id") and s.get("type", "song") == "song"]
    return {"tracks": tracks[:limit]}


@api_router.get("/tracks/search")
async def search(q: str = Query(..., min_length=1),
                 limit: int = Query(25, ge=1, le=50)):
    data = await js_get({"__call": "search.getResults", "q": q, "n": limit, "p": "1"})
    items = data.get("results", []) if isinstance(data, dict) else []
    tracks = [normalize_song(s) for s in items if s.get("id")]
    return {"tracks": tracks[:limit]}


VARIANT_WORDS = ("slowed", "reverb", "lofi", "lo-fi", "remix", "mashup", "unplugged", "cover",
                 "instrumental", "karaoke", "8d", "sped up", "reprise", "acoustic", "version", "mix")


def _variant_key(title: str) -> str:
    t = title.lower()
    t = _re.sub(r"[\(\[].*?[\)\]]", " ", t)          # drop bracketed qualifiers
    t = _re.sub(r"\s*[-–|].*$", "", t)                # drop " - From X" tails
    t = _re.sub(r"[^a-z0-9\u0900-\u097f ]+", " ", t)
    return _re.sub(r"\s+", " ", t).strip()


def _is_variant(title: str) -> bool:
    t = title.lower()
    return any(w in t for w in VARIANT_WORDS)


@api_router.get("/search")
async def search_structured(q: str = Query(..., min_length=1), limit: int = Query(30, ge=1, le=50)):
    """Professional search: top result (artist), the artist's real top songs, then deduplicated songs."""
    q_clean = q.strip()
    wants_variant = _is_variant(q_clean)
    ac_task = js_get({"__call": "autocomplete.get", "query": q_clean, "cc": "in", "includeMetaTags": "1"})
    res_task = js_get({"__call": "search.getResults", "q": q_clean, "n": 40, "p": "1"})
    ac, res = await _asyncio.gather(ac_task, res_task, return_exceptions=True)

    top: Optional[dict] = None
    artists: List[dict] = []
    if isinstance(ac, dict):
        tq = ((ac.get("topquery") or {}).get("data") or [])
        arts = ((ac.get("artists") or {}).get("data") or [])
        for a in (tq + arts):
            if a.get("type") == "artist" and a.get("id"):
                ent = {"type": "artist", "id": str(a["id"]), "title": _clean(a.get("title")),
                       "subtitle": "Artist", "image": _img(a.get("image"))}
                if not any(x["id"] == ent["id"] for x in artists):
                    artists.append(ent)
        if tq and tq[0].get("type") == "artist" and tq[0].get("id"):
            top = {"type": "artist", "id": str(tq[0]["id"]), "title": _clean(tq[0].get("title")),
                   "subtitle": "Artist", "image": _img(tq[0].get("image"))}

    raw_songs = res.get("results", []) if isinstance(res, dict) else []
    songs = [normalize_song(s) for s in raw_songs if s.get("id")]

    # Artist's genuine top songs when the query is that artist
    artist_songs: List[dict] = []
    if top and top["title"].lower() in q_clean.lower() or (top and q_clean.lower() in top["title"].lower()):
        try:
            data = await js_get({"__call": "artist.getArtistPageDetails", "artistId": top["id"]})
            ts = data.get("topSongs") if isinstance(data, dict) else None
            arr = (ts.get("songs") or ts.get("data") or []) if isinstance(ts, dict) else (ts or [])
            artist_songs = [normalize_song(s) for s in arr if s.get("id")][:15]
            top["subtitle"] = "Artist" + (f" · {int(data.get('follower_count') or 0):,} followers" if isinstance(data, dict) and data.get("follower_count") else "")
        except Exception as e:
            logger.warning("artist top songs failed: %s", e)

    # De-duplicate near-identical titles (keep the most played original; hide remixes unless asked)
    best: Dict[str, dict] = {}
    for t in songs:
        if not wants_variant and _is_variant(t["title"]):
            continue
        key = _variant_key(t["title"]) + "|" + str(round((t["duration"] or 0) / 3))
        cur = best.get(key)
        if not cur or t["playCount"] > cur["playCount"]:
            best[key] = t
    exact = _variant_key(q_clean)
    ranked = sorted(best.values(), key=lambda t: (_variant_key(t["title"]) != exact, -t["playCount"]))
    seen_ids = {t["id"] for t in artist_songs}
    ranked = [t for t in ranked if t["id"] not in seen_ids]
    return {"query": q_clean, "top": top, "artists": artists[:5], "artistSongs": artist_songs, "songs": ranked[:limit]}


@api_router.get("/search/suggest")
async def search_suggest(q: str = Query(..., min_length=1)):
    """YouTube-Music style autocomplete: text suggestions + top entities (songs/artists/albums)."""
    try:
        data = await js_get({"__call": "autocomplete.get", "query": q, "cc": "in", "includeMetaTags": "1"})
    except Exception as e:
        logger.warning("suggest failed: %s", e)
        return {"suggestions": [], "entities": []}
    if not isinstance(data, dict):
        return {"suggestions": [], "entities": []}

    def items(key: str) -> List[dict]:
        v = data.get(key) or {}
        arr = v.get("data") if isinstance(v, dict) else v
        return [x for x in (arr or []) if isinstance(x, dict) and x.get("id")]

    entities: List[dict] = []
    texts: List[str] = []
    seen_text = set()

    def add_text(t: Optional[str]):
        t = _clean(t)
        key = t.lower()
        if t and key not in seen_text and key != q.strip().lower():
            seen_text.add(key)
            texts.append(t)

    for x in items("topquery"):
        add_text(x.get("title"))
    for s in items("songs")[:4]:
        mi = s.get("more_info") or {}
        add_text(s.get("title"))
        entities.append({
            "type": "song",
            "id": str(s["id"]),
            "title": _clean(s.get("title")),
            "subtitle": _clean(mi.get("primary_artists") or mi.get("singers") or s.get("subtitle")),
            "image": _img(s.get("image")),
            "track": normalize_song(s),
        })
    for a in items("artists")[:3]:
        add_text(a.get("title"))
        entities.append({
            "type": "artist",
            "id": str(a["id"]),
            "title": _clean(a.get("title")),
            "subtitle": "Artist",
            "image": _img(a.get("image")),
        })
    for al in items("albums")[:3]:
        add_text(al.get("title"))
        entities.append({
            "type": "album",
            "id": str(al["id"]),
            "title": _clean(al.get("title")),
            "subtitle": "Album · " + _clean((al.get("more_info") or {}).get("music") or al.get("subtitle") or ""),
            "image": _img(al.get("image")),
        })
    for x in items("topquery"):
        t = x.get("type")
        if t in ("artist", "song", "album") and not any(e["id"] == str(x["id"]) for e in entities):
            ent = {
                "type": t,
                "id": str(x["id"]),
                "title": _clean(x.get("title")),
                "subtitle": _clean(x.get("subtitle")) or t.capitalize(),
                "image": _img(x.get("image")),
            }
            if t == "song":
                ent["track"] = normalize_song(x)
            entities.insert(0, ent)
    return {"suggestions": [{"text": t} for t in texts[:8]], "entities": entities[:8]}


@api_router.get("/artists/{artist_id}")
async def artist(artist_id: str):
    data = await js_get({"__call": "artist.getArtistPageDetails", "artistId": artist_id})
    if not isinstance(data, dict) or not data.get("name"):
        raise HTTPException(status_code=404, detail="Artist not found")
    top = data.get("topSongs")
    if isinstance(top, dict):
        songs = top.get("songs") or top.get("data") or []
    elif isinstance(top, list):
        songs = top
    else:
        songs = []
    tracks = [normalize_song(s) for s in songs if s.get("id")]
    artist_obj = {
        "id": artist_id,
        "name": _clean(data.get("name")),
        "handle": artist_id,
        "image": _img(data.get("image")),
        "cover": _img(data.get("image")),
        "bio": None,
        "isVerified": bool(data.get("isVerified")),
        "followerCount": int(data.get("follower_count") or 0),
        "trackCount": len(tracks),
        "genre": data.get("dominantLanguage"),
    }
    return {"artist": artist_obj, "tracks": tracks}


@api_router.get("/tracks/{track_id}")
async def track_detail(track_id: str):
    data = await js_get({"__call": "song.getDetails", "pids": track_id})
    songs = _songs_from(data, track_id)
    if not songs:
        raise HTTPException(status_code=404, detail="Track not found")
    return {"track": normalize_song(songs[0])}


# ---------------------------------------------------------------------------
# Recommendations / Autoplay / Radio
# ---------------------------------------------------------------------------
async def _reco_songs(pid: str) -> List[dict]:
    """JioSaavn 'similar songs' for a track (requires android ctx)."""
    try:
        data = await js_get({"__call": "reco.getreco", "pid": pid, "ctx": "android"})
    except Exception as e:
        logger.warning("reco failed for %s: %s", pid, e)
        return []
    items: List[Any] = []
    if isinstance(data, dict):
        items = data.get(pid) or next((v for v in data.values() if isinstance(v, list)), [])
    elif isinstance(data, list):
        items = data
    return [s for s in items if isinstance(s, dict) and s.get("id")]


async def _artist_top_songs(artist_id: Optional[str]) -> List[dict]:
    if not artist_id:
        return []
    try:
        data = await js_get({"__call": "artist.getArtistPageDetails", "artistId": artist_id})
    except Exception:
        return []
    top = data.get("topSongs") if isinstance(data, dict) else None
    if isinstance(top, dict):
        return top.get("songs") or top.get("data") or []
    return top if isinstance(top, list) else []


def _dedupe(songs: List[dict], exclude: set) -> List[dict]:
    out, seen = [], set(exclude)
    for s in songs:
        sid = str(s.get("id", ""))
        if not sid or sid in seen:
            continue
        seen.add(sid)
        out.append(s)
    return out


@api_router.get("/tracks/{track_id}/recommendations")
async def recommendations(track_id: str,
                          exclude: Optional[str] = None,
                          limit: int = Query(20, ge=1, le=50)):
    """Related songs for the player (YouTube-Music style): similar tracks + the artist's other
    hits + second-level recommendations, without duplicates, remixes or the song itself."""
    excluded = {track_id} | {e for e in (exclude or "").split(",") if e}
    seed_title = None
    artist_ids: List[str] = []
    try:
        detail = await js_get({"__call": "song.getDetails", "pids": track_id})
        seed = _songs_from(detail, track_id)
        if seed:
            norm = normalize_song(seed[0])
            seed_title = norm["title"]
            artist_ids = [a["id"] for a in norm["artists"] if a.get("id")][:2]
    except Exception as e:
        logger.warning("reco seed failed: %s", e)

    first = await _reco_songs(track_id)
    second_groups, artist_groups = await _asyncio.gather(
        _asyncio.gather(*[_reco_songs(str(s["id"])) for s in first[:2]]),
        _asyncio.gather(*[_artist_top_songs(a) for a in artist_ids]),
    )
    allow_variants = _is_variant(seed_title or "")
    seed_key = _variant_key(seed_title or "")

    def clean(raw: List[dict]) -> List[dict]:
        out = []
        for s in raw:
            t = normalize_song(s)
            if t["id"] in excluded:
                continue
            if not allow_variants and _is_variant(t["title"]):
                continue
            if _variant_key(t["title"]) == seed_key:  # same song, other release
                continue
            out.append(t)
        return out

    primary = clean(first)
    artist_hits = clean([s for g in artist_groups for s in g])
    deeper = clean([s for g in second_groups for s in g])
    _random.shuffle(artist_hits)
    _random.shuffle(deeper)

    blended: List[dict] = primary[:4]
    pools = [primary[4:], artist_hits, deeper]
    while any(pools) and len(blended) < limit * 2:
        for p in pools:
            if p:
                blended.append(p.pop(0))

    # de-duplicate by normalised title + duration (same track on several albums)
    seen_keys, result = set(), []
    for t in _dedupe(blended, excluded):
        k = _variant_key(t["title"])
        if k in seen_keys:
            continue
        seen_keys.add(k)
        result.append(t)
    return {"tracks": result[:limit]}


@api_router.get("/tracks/{track_id}/radio")
async def radio(track_id: str, limit: int = Query(40, ge=5, le=60)):
    """Endless-mix seed: similar songs, their similar songs and the artist's top songs."""
    import asyncio
    import random

    first = await _reco_songs(track_id)
    fan_out = await asyncio.gather(*[_reco_songs(str(s["id"])) for s in first[:3]])
    artist_songs: List[dict] = []
    try:
        detail = await js_get({"__call": "song.getDetails", "pids": track_id})
        seed = _songs_from(detail, track_id)
        if seed:
            amap = (seed[0].get("more_info") or {}).get("artistMap") or {}
            primary = amap.get("primary_artists") or amap.get("artists") or []
            if primary:
                artist_songs = await _artist_top_songs(str(primary[0].get("id")))
    except Exception as e:
        logger.warning("radio seed failed: %s", e)

    second = [s for group in fan_out for s in group]
    random.shuffle(second)
    random.shuffle(artist_songs)
    # Interleave: keep the closest matches first, then blend deeper recs + artist songs
    blended: List[dict] = list(first[:8])
    pools = [first[8:], second, artist_songs]
    while any(pools) and len(blended) < limit * 2:
        for p in pools:
            if p:
                blended.append(p.pop(0))
    tracks = [normalize_song(s) for s in _dedupe(blended, {track_id})]
    return {"tracks": tracks[:limit]}


@api_router.get("/tracks/{track_id}/stream")
async def stream_proxy(track_id: str, request: Request, q: str = "320"):
    http = await get_http()
    data = await js_get({"__call": "song.getDetails", "pids": track_id})
    songs = _songs_from(data, track_id)
    if not songs:
        raise HTTPException(status_code=404, detail="Track not found")
    url = decrypt_url((songs[0].get("more_info") or {}).get("encrypted_media_url"), q)
    if not url:
        raise HTTPException(status_code=502, detail="Audio unavailable")

    upstream_headers = {}
    if request.headers.get("range"):
        upstream_headers["Range"] = request.headers["range"]
    req = http.build_request("GET", url, headers=upstream_headers)
    upstream = await http.send(req, stream=True)
    if upstream.status_code >= 400:
        await upstream.aclose()
        raise HTTPException(status_code=502, detail="Audio unavailable")

    resp_headers = {"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600"}
    for h in ("content-length", "content-range"):
        if h in upstream.headers:
            resp_headers[h.title()] = upstream.headers[h]

    async def body():
        try:
            async for chunk in upstream.aiter_bytes(65536):
                yield chunk
        finally:
            await upstream.aclose()

    return StreamingResponse(
        body(),
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "audio/mp4"),
        headers=resp_headers,
    )


import re as _re

DEVANAGARI_RE = _re.compile(r"[\u0900-\u097F]")
_IAST_MAP = [("ā", "aa"), ("ī", "ee"), ("ū", "oo"), ("ṝ", "ri"), ("ṛ", "ri"), ("ṅ", "n"), ("ñ", "n"),
             ("ṭ", "t"), ("ḍ", "d"), ("ṇ", "n"), ("ś", "sh"), ("ṣ", "sh"), ("ṃ", "n"), ("ḥ", "h"),
             ("ḷ", "l"), ("ē", "e"), ("ō", "o"), ("ai", "ai"), ("au", "au")]


def _hinglish_word(w: str) -> str:
    """IAST → casual Hinglish spelling (drop diacritics, final schwa, common clusters)."""
    core = _re.match(r"^([^\wāīūṝṛṅñṭḍṇśṣṃḥḷēō]*)(.*?)([^\wāīūṝṛṅñṭḍṇśṣṃḥḷēō]*)$", w, _re.U)
    pre, body, post = core.groups() if core else ("", w, "")
    if not body:
        return w
    b = body
    # final schwa deletion: "tuma" -> "tum", "barasāta" -> "barasaat" (keep single-letter / vowel-final words)
    if len(b) > 2 and b.endswith("a") and not b.endswith(("aa", "ā", "ya")) and b[-2] not in "aeiouāīū":
        b = b[:-1]
    # medial schwa deletion after the first syllable: "barasāta" -> "barsāta" (never touch the first vowel)
    if len(b) > 5:
        fv = _re.search(r"[aeiouāīū]", b)
        if fv:
            cut = fv.end()
            b = b[:cut] + _re.sub(r"(?<=[^aeiouāīū])a(?=[rlnmsk][aeiouāīū])", "", b[cut:])
    # long ī / ū at the end read naturally as "i" / "u" in Hinglish ("hi", "zindagi", "tu")
    b = _re.sub(r"ī$", "i", b)
    b = _re.sub(r"ū$", "u", b)
    for src, dst in _IAST_MAP:
        b = b.replace(src, dst)
    b = b.replace("ch", "ch").replace("ph", "ph")
    return pre + b + post


def romanize(text: str) -> str:
    """Devanagari → Hinglish (Latin) while preserving LRC timestamps and punctuation."""
    if not text or not DEVANAGARI_RE.search(text):
        return text
    try:
        from indic_transliteration import sanscript
        out_lines = []
        for line in text.split("\n"):
            m = _re.match(r"^(\[[^\]]*\]\s*)?(.*)$", line)
            stamp, body = (m.group(1) or ""), m.group(2)
            if DEVANAGARI_RE.search(body):
                iast = sanscript.transliterate(body, sanscript.DEVANAGARI, sanscript.IAST)
                body = " ".join(_hinglish_word(w) for w in iast.split(" "))
            out_lines.append(stamp + body)
        return "\n".join(out_lines)
    except Exception as e:
        logger.warning("romanize failed: %s", e)
        return text


def _is_latin(text: Optional[str]) -> bool:
    return bool(text) and not DEVANAGARI_RE.search(text or "")


def _simplify_title(t: str) -> str:
    t = _re.sub(r"\((from|feat\.?|ft\.?|with)[^)]*\)", "", t, flags=_re.I)
    t = _re.sub(r"\[[^\]]*\]", "", t)
    t = _re.sub(r"\s*-\s*(from|feat|ft)\b.*$", "", t, flags=_re.I)
    return _re.sub(r"\s+", " ", t).strip()


def _pick_lrc(candidates: List[dict], duration: float, want_synced: bool) -> Optional[dict]:
    best, best_score = None, -1e9
    for c in candidates:
        if want_synced and not c.get("syncedLyrics"):
            continue
        if not (c.get("syncedLyrics") or c.get("plainLyrics")):
            continue
        d = float(c.get("duration") or 0)
        diff = abs(d - duration) if duration and d else 6
        if duration and d and diff > 12:
            continue
        score = -diff + (5 if c.get("syncedLyrics") else 0) + (3 if _is_latin(c.get("syncedLyrics") or c.get("plainLyrics")) else 0)
        if score > best_score:
            best, best_score = c, score
    return best


@api_router.get("/lyrics")
async def lyrics(title: str, artist: str,
                 album: str = "", duration: float = 0,
                 track_id: Optional[str] = None, script: str = "latin"):
    res = await _lyrics_lookup(title, artist, album, duration, track_id)
    if script == "latin":
        res["synced"] = romanize(res.get("synced")) if res.get("synced") else res.get("synced")
        res["plain"] = romanize(res.get("plain")) if res.get("plain") else res.get("plain")
    return res


async def _lyrics_lookup(title: str, artist: str, album: str, duration: float, track_id: Optional[str]) -> dict:
    http = await get_http()
    headers = {"User-Agent": f"{APP_NAME}/1.0 (https://liquidaudio.app)"}
    simple = _simplify_title(title)
    first_artist = (artist or "").split(",")[0].strip()
    plain_fallback: Optional[dict] = None

    async def lrc_get(params: dict) -> Optional[dict]:
        try:
            r = await http.get(f"{LRCLIB_BASE}/api/get", params=params, headers=headers)
            if r.status_code == 200:
                j = r.json()
                if j.get("syncedLyrics") or j.get("plainLyrics"):
                    return j
        except Exception as e:
            logger.warning("lrclib get error: %s", e)
        return None

    async def lrc_search(params: dict) -> List[dict]:
        try:
            r = await http.get(f"{LRCLIB_BASE}/api/search", params=params, headers=headers)
            if r.status_code == 200:
                arr = r.json()
                return arr if isinstance(arr, list) else []
        except Exception as e:
            logger.warning("lrclib search error: %s", e)
        return []

    # 1) exact match
    exact = await lrc_get({"track_name": title, "artist_name": artist,
                           "album_name": album or title, "duration": round(duration)})
    if exact and exact.get("syncedLyrics"):
        return {"synced": exact["syncedLyrics"], "plain": exact.get("plainLyrics"),
                "instrumental": bool(exact.get("instrumental")), "source": "lrclib"}
    if exact:
        plain_fallback = exact

    # 2) progressively looser searches, prefer synced + closest duration (Hinglish tracks are
    #    often filed under slightly different titles / single artist names)
    queries = [
        {"track_name": simple, "artist_name": first_artist},
        {"q": f"{simple} {first_artist}".strip()},
        {"track_name": simple},
        {"q": simple},
    ]
    seen = set()
    for qp in queries:
        key = tuple(sorted(qp.items()))
        if key in seen or not any(qp.values()):
            continue
        seen.add(key)
        arr = await lrc_search(qp)
        best = _pick_lrc(arr, duration, want_synced=True)
        if best:
            return {"synced": best["syncedLyrics"], "plain": best.get("plainLyrics"),
                    "instrumental": bool(best.get("instrumental")), "source": "lrclib"}
        if not plain_fallback:
            plain_fallback = _pick_lrc(arr, duration, want_synced=False)

    # 3) JioSaavn plain lyrics (romanised Hinglish for Bollywood) — frontend auto-times them
    if track_id:
        try:
            data = await js_get({"__call": "lyrics.getLyrics", "lyrics_id": track_id})
            raw = (data or {}).get("lyrics")
            if raw:
                plain = html_lib.unescape(raw.replace("<br>", "\n").replace("<br/>", "\n"))
                return {"synced": None, "plain": plain, "instrumental": False, "source": "jiosaavn"}
        except Exception as e:
            logger.warning("saavn lyrics error: %s", e)

    if plain_fallback:
        return {"synced": None, "plain": plain_fallback.get("plainLyrics"),
                "instrumental": bool(plain_fallback.get("instrumental")), "source": "lrclib"}
    return {"synced": None, "plain": None, "instrumental": False, "source": None}


# ---------------------------------------------------------------------------
# Library (device-scoped, no auth)
# ---------------------------------------------------------------------------
class TrackPayload(BaseModel):
    id: str
    title: str
    artist: str
    artistHandle: Optional[str] = None
    artists: Optional[List[Dict[str, Any]]] = None
    artwork: Optional[str] = None
    duration: int = 0
    genre: Optional[str] = None
    album: Optional[str] = None
    previewUrl: Optional[str] = None


class ReorderBody(BaseModel):
    device_id: str
    track_ids: List[str]


class FavoriteBody(BaseModel):
    device_id: str
    track: TrackPayload


class RecentBody(BaseModel):
    device_id: str
    track: TrackPayload


class PlaylistCreateBody(BaseModel):
    device_id: str
    name: str


class PlaylistTrackBody(BaseModel):
    device_id: str
    track: TrackPayload


async def get_library(device_id: str) -> dict:
    doc = await db.libraries.find_one({"device_id": device_id}, {"_id": 0})
    if not doc:
        doc = {"device_id": device_id, "favorites": [], "recent": [], "playlists": []}
        await db.libraries.insert_one(dict(doc))
        doc = await db.libraries.find_one({"device_id": device_id}, {"_id": 0})
    doc.setdefault("favorites", [])
    doc.setdefault("recent", [])
    doc.setdefault("playlists", [])
    return doc


@api_router.get("/library")
async def library(device_id: str):
    return await get_library(device_id)


@api_router.post("/library/favorite")
async def toggle_favorite(body: FavoriteBody):
    lib = await get_library(body.device_id)
    favs = [f for f in lib["favorites"] if f.get("id") != body.track.id]
    added = len(favs) == len(lib["favorites"])
    if added:
        favs.insert(0, body.track.dict())
    await db.libraries.update_one(
        {"device_id": body.device_id},
        {"$set": {"favorites": favs, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"favorited": added, "favorites": favs}


@api_router.post("/library/recent")
async def add_recent(body: RecentBody):
    lib = await get_library(body.device_id)
    recent = [r for r in lib["recent"] if r.get("id") != body.track.id]
    recent.insert(0, body.track.dict())
    recent = recent[:30]
    await db.libraries.update_one(
        {"device_id": body.device_id},
        {"$set": {"recent": recent, "updated_at": datetime.now(timezone.utc).isoformat()},
         "$inc": {f"plays.{body.track.id}": 1}},
    )
    return {"recent": recent}


# ---------------------------------------------------------------------------
# "Made for you" mixes — built from listening history, rotated daily
# ---------------------------------------------------------------------------
import hashlib as _hashlib

MIX_COLORS = ["#F43F5E", "#38BDF8", "#34D399", "#FBBF24", "#A78BFA", "#FB923C", "#22D3EE", "#F472B6"]
LANG_LABEL = {"hindi": "Hindi", "english": "English", "punjabi": "Punjabi", "tamil": "Tamil",
              "telugu": "Telugu", "marathi": "Marathi", "bengali": "Bengali", "gujarati": "Gujarati",
              "kannada": "Kannada", "malayalam": "Malayalam", "bhojpuri": "Bhojpuri", "haryanvi": "Haryanvi"}


def _seeded_shuffle(items: List[Any], seed: str) -> List[Any]:
    rnd = _random.Random(int(_hashlib.md5(seed.encode()).hexdigest()[:8], 16))
    out = list(items)
    rnd.shuffle(out)
    return out


def _mix(mid: str, title: str, subtitle: str, tracks: List[dict], color: str) -> dict:
    uniq = _dedupe(tracks, set())
    covers = [t["artwork"] for t in uniq[:4] if t.get("artwork")]
    return {"id": mid, "title": title, "subtitle": subtitle, "color": color,
            "covers": covers, "tracks": uniq[:25]}


async def _trending_lang(lang: str) -> List[dict]:
    try:
        data = await js_get({"__call": "content.getTrending", "entity_type": "song", "entity_language": lang})
        return [normalize_song(s) for s in (data or []) if isinstance(s, dict) and s.get("id")]
    except Exception:
        return []


async def _build_mixes(device_id: str, day: str) -> List[dict]:
    lib = await get_library(device_id)
    recent: List[dict] = lib.get("recent", [])
    favs: List[dict] = lib.get("favorites", [])
    plays: Dict[str, int] = lib.get("plays", {}) or {}
    history = recent + favs
    known_ids = {t["id"] for t in history}
    seed_base = f"{device_id}:{day}"

    # --- interest model -----------------------------------------------------
    artist_score: Dict[str, dict] = {}
    lang_score: Dict[str, float] = {}
    for i, t in enumerate(history):
        w = (1.5 if t in favs else 1.0) * (1.0 - min(i, 29) / 60) * (1 + min(plays.get(t["id"], 0), 5) * 0.3)
        credited = [a for a in (t.get("artists") or []) if a.get("id")] or (
            [{"id": t["artistHandle"], "name": t["artist"].split(",")[0].strip()}] if t.get("artistHandle") else [])
        for k, a in enumerate(credited[:2]):
            entry = artist_score.setdefault(str(a["id"]), {"id": str(a["id"]), "name": a["name"], "score": 0.0, "seed": t})
            entry["score"] += w * (1.0 if k == 0 else 0.5)
        if t.get("genre"):
            lang_score[t["genre"].lower()] = lang_score.get(t["genre"].lower(), 0) + w

    top_artists = sorted(artist_score.values(), key=lambda a: -a["score"])[:6]
    top_artists = _seeded_shuffle(top_artists[:4], seed_base + ":artists")[:3] if len(top_artists) > 3 else top_artists
    top_langs = [l for l, _ in sorted(lang_score.items(), key=lambda kv: -kv[1])][:2] or ["hindi", "english"]

    mixes: List[dict] = []
    color_i = 0

    # --- Your Mix 1..3 (artist-centred) -------------------------------------
    async def artist_mix(n: int, a: dict) -> Optional[dict]:
        top = await _artist_top_songs(a["id"])
        recos = await _reco_songs(a["seed"]["id"]) if a.get("seed") else []
        pool = [normalize_song(s) for s in top[:14]] + [normalize_song(s) for s in recos[:10]]
        pool = _seeded_shuffle(pool, f"{seed_base}:mix{n}")
        if len(pool) < 6:
            return None
        return _mix(f"your-mix-{n}", f"Your Mix {n}", f"{a['name']} and more", pool, MIX_COLORS[n % len(MIX_COLORS)])

    artist_mixes = await _asyncio.gather(*[artist_mix(i + 1, a) for i, a in enumerate(top_artists)])
    mixes += [m for m in artist_mixes if m]
    color_i = len(mixes)

    # --- Discover Mix (things like what you play, that you haven't played) ---
    seeds = _seeded_shuffle(history[:12], seed_base + ":discover")[:3]
    if not seeds:
        seeds = (await _trending_lang("hindi"))[:2]
    reco_groups = await _asyncio.gather(*[_reco_songs(t["id"]) for t in seeds])
    discover = [normalize_song(s) for g in reco_groups for s in g]
    discover = [t for t in discover if t["id"] not in known_ids]
    if len(discover) >= 6:
        mixes.append(_mix("discover-mix", "Discover Mix", "New songs picked for you",
                          _seeded_shuffle(discover, seed_base + ":d"), MIX_COLORS[color_i % 8]))
        color_i += 1

    # --- On Repeat ----------------------------------------------------------
    repeat = sorted([t for t in recent if plays.get(t["id"], 0) >= 2], key=lambda t: -plays.get(t["id"], 0))
    if len(repeat) >= 4:
        mixes.append(_mix("on-repeat", "On Repeat", "Songs you can't stop playing", repeat, MIX_COLORS[color_i % 8]))
        color_i += 1

    # --- Favourites Mix -----------------------------------------------------
    if len(favs) >= 3:
        fav_recos = await _reco_songs(_seeded_shuffle(favs, seed_base + ":f")[0]["id"])
        pool = _seeded_shuffle(favs + [normalize_song(s) for s in fav_recos[:8]], seed_base + ":fm")
        mixes.append(_mix("favourites-mix", "Favourites Mix", "Your liked songs, remixed daily", pool, MIX_COLORS[color_i % 8]))
        color_i += 1

    # --- Language mixes -------------------------------------------------------
    lang_lists = await _asyncio.gather(*[_trending_lang(l) for l in top_langs])
    for lang, lst in zip(top_langs, lang_lists):
        pool = _seeded_shuffle(lst, f"{seed_base}:{lang}")
        if len(pool) >= 6:
            label = LANG_LABEL.get(lang, lang.title())
            mixes.append(_mix(f"lang-{lang}", f"{label} Mix", f"Fresh {label} hits for today", pool, MIX_COLORS[color_i % 8]))
            color_i += 1

    return mixes[:7]


@api_router.get("/home/mixes")
async def home_mixes(device_id: str, refresh: bool = False):
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    key = {"device_id": device_id, "day": day}
    if not refresh:
        cached = await db.mixes_cache.find_one(key, {"_id": 0})
        if cached:
            return {"day": day, "mixes": cached["mixes"]}
    mixes = await _build_mixes(device_id, day)
    await db.mixes_cache.update_one(key, {"$set": {"mixes": mixes, "built_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"day": day, "mixes": mixes}


@api_router.post("/library/playlist")
async def create_playlist(body: PlaylistCreateBody):
    lib = await get_library(body.device_id)
    playlist = {"id": str(uuid.uuid4()), "name": body.name.strip() or "New Playlist", "tracks": []}
    playlists = lib["playlists"] + [playlist]
    await db.libraries.update_one(
        {"device_id": body.device_id},
        {"$set": {"playlists": playlists}},
    )
    return {"playlists": playlists}


@api_router.post("/library/playlist/{playlist_id}/track")
async def add_playlist_track(playlist_id: str, body: PlaylistTrackBody):
    lib = await get_library(body.device_id)
    found = False
    for p in lib["playlists"]:
        if p["id"] == playlist_id:
            found = True
            if not any(t.get("id") == body.track.id for t in p["tracks"]):
                p["tracks"].insert(0, body.track.dict())
    if not found:
        raise HTTPException(status_code=404, detail="Playlist not found")
    await db.libraries.update_one(
        {"device_id": body.device_id},
        {"$set": {"playlists": lib["playlists"]}},
    )
    return {"playlists": lib["playlists"]}


@api_router.delete("/library/playlist/{playlist_id}/track/{track_id}")
async def remove_playlist_track(playlist_id: str, track_id: str, device_id: str):
    lib = await get_library(device_id)
    for p in lib["playlists"]:
        if p["id"] == playlist_id:
            p["tracks"] = [t for t in p["tracks"] if t.get("id") != track_id]
    await db.libraries.update_one(
        {"device_id": device_id},
        {"$set": {"playlists": lib["playlists"]}},
    )
    return {"playlists": lib["playlists"]}


@api_router.put("/library/playlist/{playlist_id}/reorder")
async def reorder_playlist(playlist_id: str, body: ReorderBody):
    lib = await get_library(body.device_id)
    order = {tid: i for i, tid in enumerate(body.track_ids)}
    found = False
    for p in lib["playlists"]:
        if p["id"] == playlist_id:
            found = True
            p["tracks"].sort(key=lambda t: order.get(t.get("id"), 9999))
    if not found:
        raise HTTPException(status_code=404, detail="Playlist not found")
    await db.libraries.update_one(
        {"device_id": body.device_id},
        {"$set": {"playlists": lib["playlists"]}},
    )
    return {"playlists": lib["playlists"]}


# ---------------------------------------------------------------------------
# App releases (in-app updater) + artwork palette (adaptive UI colours)
# ---------------------------------------------------------------------------
ADMIN_PIN = os.environ.get("ADMIN_PIN", "2468")
APP_VERSION_FALLBACK = os.environ.get("APP_VERSION", "1.1.0")


class ReleaseBody(BaseModel):
    pin: str
    version: str
    apk_url: str
    notes: str = ""
    platform: str = "android"
    mandatory: bool = False


def _ver_tuple(v: str):
    parts = []
    for p in (v or "0").split("."):
        num = "".join(ch for ch in p if ch.isdigit())
        parts.append(int(num) if num else 0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:3])


@api_router.get("/app/version")
async def app_version(platform: str = "android", current: Optional[str] = None):
    doc = await db.app_releases.find_one(
        {"platform": platform}, {"_id": 0}, sort=[("published_at", -1)]
    )
    if not doc:
        return {"latest": None, "update_available": False, "current": current}
    available = bool(current) and _ver_tuple(doc["version"]) > _ver_tuple(current)
    return {"latest": doc, "update_available": available, "current": current}


@api_router.get("/app/releases")
async def app_releases(platform: str = "android", limit: int = Query(10, ge=1, le=50)):
    cur = db.app_releases.find({"platform": platform}, {"_id": 0}).sort("published_at", -1).limit(limit)
    return {"releases": [r async for r in cur]}


@api_router.post("/app/version")
async def publish_release(body: ReleaseBody):
    if body.pin != ADMIN_PIN:
        raise HTTPException(status_code=403, detail="Invalid PIN")
    if not body.apk_url.startswith("http"):
        raise HTTPException(status_code=400, detail="apk_url must be a direct http(s) link")
    rel = {
        "id": str(uuid.uuid4()),
        "platform": body.platform,
        "version": body.version.strip().lstrip("v"),
        "apk_url": body.apk_url.strip(),
        "notes": body.notes.strip(),
        "mandatory": body.mandatory,
        "published_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.app_releases.insert_one(dict(rel))
    return {"release": rel}


_palette_cache: Dict[str, dict] = {}


def _extract_palette(raw: bytes) -> dict:
    from PIL import Image
    import io
    import colorsys

    im = Image.open(io.BytesIO(raw)).convert("RGB").resize((48, 48))
    counts: Dict[tuple, int] = {}
    for px in im.getdata():
        key = (px[0] // 24 * 24, px[1] // 24 * 24, px[2] // 24 * 24)
        counts[key] = counts.get(key, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    dominant = ranked[0][0]

    def score(c):
        h, l, s = colorsys.rgb_to_hls(c[0] / 255, c[1] / 255, c[2] / 255)
        return s * (1 - abs(l - 0.5) * 1.6)

    vibrant = max((c for c, n in ranked[:24]), key=score, default=dominant)
    h, l, s = colorsys.rgb_to_hls(vibrant[0] / 255, vibrant[1] / 255, vibrant[2] / 255)
    # keep accent readable on dark UI: lift lightness/saturation a bit
    l = min(0.62, max(0.45, l))
    s = min(1.0, max(0.55, s))
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    accent = "#%02X%02X%02X" % (int(r * 255), int(g * 255), int(b * 255))
    dark = "#%02X%02X%02X" % tuple(int(v * 0.35) for v in dominant)
    return {
        "accent": accent,
        "dominant": "#%02X%02X%02X" % dominant,
        "background": dark,
    }


@api_router.get("/artwork/palette")
async def artwork_palette(url: str):
    if url in _palette_cache:
        return _palette_cache[url]
    http = await get_http()
    try:
        r = await http.get(url)
        r.raise_for_status()
        pal = _extract_palette(r.content)
    except Exception as e:
        logger.warning("palette failed: %s", e)
        pal = {"accent": None, "dominant": None, "background": None}
    if len(_palette_cache) > 500:
        _palette_cache.clear()
    _palette_cache[url] = pal
    return pal


# ---------------------------------------------------------------------------
# Jam — listen together (host broadcasts playback state, guests follow)
# ---------------------------------------------------------------------------
import asyncio as _asyncio
import random as _random
import time as _time
from fastapi import WebSocket, WebSocketDisconnect

JAM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class JamRoom:
    def __init__(self, code: str, host_device: str, host_name: str):
        self.code = code
        self.host_device = host_device
        self.host_name = host_name
        self.created_at = _time.time()
        self.state: Dict[str, Any] = {}
        self.members: Dict[str, dict] = {}  # device -> {name, ws}

    def member_list(self) -> List[dict]:
        return [{"device": d, "name": m["name"], "host": d == self.host_device}
                for d, m in self.members.items()]

    async def broadcast(self, msg: dict, exclude: Optional[str] = None):
        dead = []
        for d, m in list(self.members.items()):
            if d == exclude:
                continue
            try:
                await m["ws"].send_json(msg)
            except Exception:
                dead.append(d)
        for d in dead:
            self.members.pop(d, None)


jam_rooms: Dict[str, JamRoom] = {}


def _new_jam_code() -> str:
    while True:
        code = "".join(_random.choice(JAM_CODE_ALPHABET) for _ in range(6))
        if code not in jam_rooms:
            return code


class JamCreateBody(BaseModel):
    device_id: str
    name: str = "Host"


def _jam_public(room: JamRoom) -> dict:
    return {
        "code": room.code,
        "host_device": room.host_device,
        "host_name": room.host_name,
        "members": room.member_list(),
        "state": room.state,
        "server_time": _time.time(),
    }


@api_router.post("/jam")
async def jam_create(body: JamCreateBody):
    # one live room per host device
    for r in list(jam_rooms.values()):
        if r.host_device == body.device_id:
            jam_rooms.pop(r.code, None)
    room = JamRoom(_new_jam_code(), body.device_id, body.name.strip() or "Host")
    jam_rooms[room.code] = room
    return _jam_public(room)


@api_router.get("/jam/time")
async def jam_time():
    return {"server_time": _time.time()}


@api_router.get("/jam/{code}")
async def jam_get(code: str):
    room = jam_rooms.get(code.upper())
    if not room:
        raise HTTPException(status_code=404, detail="Jam not found or ended")
    return _jam_public(room)


@api_router.delete("/jam/{code}")
async def jam_end(code: str, device_id: str):
    room = jam_rooms.get(code.upper())
    if not room:
        return {"ended": True}
    if room.host_device != device_id:
        raise HTTPException(status_code=403, detail="Only the host can end the jam")
    await room.broadcast({"type": "ended"})
    jam_rooms.pop(room.code, None)
    return {"ended": True}


@api_router.websocket("/jam/ws/{code}")
async def jam_ws(ws: WebSocket, code: str, device_id: str, name: str = "Guest"):
    room = jam_rooms.get(code.upper())
    if not room:
        await ws.close(code=4404)
        return
    await ws.accept()
    room.members[device_id] = {"name": name[:32] or "Guest", "ws": ws}
    await ws.send_json({"type": "hello", "server_time": _time.time(), "room": _jam_public(room)})
    await room.broadcast({"type": "members", "members": room.member_list()}, exclude=device_id)
    try:
        while True:
            msg = await ws.receive_json()
            t = msg.get("type")
            now = _time.time()
            if t == "ping":
                await ws.send_json({"type": "pong", "client_time": msg.get("client_time"), "server_time": now})
            elif t == "state" and device_id == room.host_device:
                state = dict(msg.get("state") or {})
                state["at"] = now
                room.state = state
                await room.broadcast({"type": "state", "state": state, "server_time": now}, exclude=device_id)
            elif t in ("control", "add_track", "chat"):
                # guests → host (control/add) or everyone (chat)
                payload = {**msg, "from": device_id, "from_name": room.members.get(device_id, {}).get("name", "Guest"), "server_time": now}
                if t == "chat":
                    await room.broadcast(payload)
                else:
                    host = room.members.get(room.host_device)
                    if host:
                        await host["ws"].send_json(payload)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("jam ws error: %s", e)
    finally:
        room.members.pop(device_id, None)
        if device_id == room.host_device:
            await room.broadcast({"type": "ended"})
            jam_rooms.pop(room.code, None)
        else:
            await room.broadcast({"type": "members", "members": room.member_list()})


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    if _http:
        await _http.aclose()
    client.close()
