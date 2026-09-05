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


def decrypt_url(enc: Optional[str]) -> Optional[str]:
    if not enc:
        return None
    try:
        cipher = DES.new(DES_KEY, DES.MODE_ECB)
        dec = cipher.decrypt(base64.b64decode(enc))
        dec = dec[: -dec[-1]]  # PKCS5 unpad
        url = dec.decode("utf-8", "ignore")
        return url.replace("_96.mp4", "_320.mp4")
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
    artists = amap.get("primary_artists") or amap.get("artists") or []
    if artists:
        artist = ", ".join(_clean(a.get("name")) for a in artists[:2])
        artist_id = str(artists[0].get("id")) if artists[0].get("id") else None
    else:
        artist = _clean((s.get("subtitle") or "").split(" - ")[0]) or "Unknown Artist"
        artist_id = None
    enc = mi.get("encrypted_media_url")
    return {
        "id": str(s.get("id", "")),
        "title": _clean(s.get("title") or s.get("song")),
        "artist": artist or "Unknown Artist",
        "artistHandle": artist_id,
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


@api_router.get("/tracks/{track_id}/stream")
async def stream_proxy(track_id: str, request: Request):
    http = await get_http()
    data = await js_get({"__call": "song.getDetails", "pids": track_id})
    songs = _songs_from(data, track_id)
    if not songs:
        raise HTTPException(status_code=404, detail="Track not found")
    url = decrypt_url((songs[0].get("more_info") or {}).get("encrypted_media_url"))
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


@api_router.get("/lyrics")
async def lyrics(title: str, artist: str,
                 album: str = "", duration: float = 0,
                 track_id: Optional[str] = None):
    http = await get_http()
    headers = {"User-Agent": f"{APP_NAME}/1.0 (https://liquidaudio.app)"}
    params = {
        "track_name": title,
        "artist_name": artist,
        "album_name": album or title,
        "duration": round(duration),
    }
    try:
        r = await http.get(f"{LRCLIB_BASE}/api/get", params=params, headers=headers)
        if r.status_code == 200:
            j = r.json()
            if j.get("syncedLyrics") or j.get("plainLyrics"):
                return {
                    "synced": j.get("syncedLyrics"),
                    "plain": j.get("plainLyrics"),
                    "instrumental": bool(j.get("instrumental")),
                }
        r2 = await http.get(f"{LRCLIB_BASE}/api/search",
                            params={"track_name": title, "artist_name": artist},
                            headers=headers)
        if r2.status_code == 200:
            arr = r2.json()
            if arr and (arr[0].get("syncedLyrics") or arr[0].get("plainLyrics")):
                best = arr[0]
                return {
                    "synced": best.get("syncedLyrics"),
                    "plain": best.get("plainLyrics"),
                    "instrumental": bool(best.get("instrumental")),
                }
    except Exception as e:
        logger.warning("lyrics error: %s", e)

    # JioSaavn plain-lyrics fallback (great for Hindi / Bollywood)
    if track_id:
        try:
            data = await js_get({"__call": "lyrics.getLyrics", "lyrics_id": track_id})
            raw = (data or {}).get("lyrics")
            if raw:
                plain = html_lib.unescape(raw.replace("<br>", "\n").replace("<br/>", "\n"))
                return {"synced": None, "plain": plain, "instrumental": False}
        except Exception as e:
            logger.warning("saavn lyrics error: %s", e)

    return {"synced": None, "plain": None, "instrumental": False}


# ---------------------------------------------------------------------------
# Library (device-scoped, no auth)
# ---------------------------------------------------------------------------
class TrackPayload(BaseModel):
    id: str
    title: str
    artist: str
    artistHandle: Optional[str] = None
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
        {"$set": {"recent": recent, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"recent": recent}


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
