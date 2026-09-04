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
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

APP_NAME = "LiquidAudio"
AUDIUS_DISCOVERY = "https://api.audius.co"
LRCLIB_BASE = "https://lrclib.net"

app = FastAPI(title="LiquidAudio API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("liquidaudio")

# Shared async HTTP client + resolved Audius host
_http: Optional[httpx.AsyncClient] = None
_audius_hosts: List[str] = []


async def get_http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=20, follow_redirects=True)
    return _http


async def resolve_hosts() -> List[str]:
    global _audius_hosts
    if _audius_hosts:
        return _audius_hosts
    http = await get_http()
    try:
        r = await http.get(AUDIUS_DISCOVERY)
        data = r.json().get("data", [])
        _audius_hosts = [h for h in data if isinstance(h, str)]
    except Exception as e:
        logger.warning("Failed to resolve Audius hosts: %s", e)
    if not _audius_hosts:
        _audius_hosts = ["https://discoveryprovider.audius.co"]
    return _audius_hosts


async def audius_get(path: str, params: Optional[dict] = None) -> Any:
    http = await get_http()
    params = dict(params or {})
    params["app_name"] = APP_NAME
    last_err = None
    for host in await resolve_hosts():
        try:
            r = await http.get(f"{host}/v1{path}", params=params)
            if r.status_code == 200:
                return r.json().get("data", [])
            last_err = f"{r.status_code}"
        except Exception as e:
            last_err = str(e)
            continue
    raise HTTPException(status_code=502, detail=f"Audius unavailable: {last_err}")


def normalize_track(t: dict) -> Dict[str, Any]:
    user = t.get("user") or {}
    art = t.get("artwork") or {}
    artwork = art.get("480x480") or art.get("1000x1000") or art.get("150x150")
    return {
        "id": str(t.get("id", "")),
        "title": t.get("title") or "Untitled",
        "artist": user.get("name") or user.get("handle") or "Unknown Artist",
        "artistHandle": user.get("handle"),
        "artwork": artwork,
        "duration": int(t.get("duration") or 0),
        "genre": t.get("genre"),
        "mood": t.get("mood"),
        "playCount": int(t.get("play_count") or 0),
        "favoriteCount": int(t.get("favorite_count") or 0),
    }


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "LiquidAudio API", "status": "ok"}


@api_router.get("/tracks/trending")
async def trending(genre: Optional[str] = None,
                   time: str = "week",
                   limit: int = Query(25, ge=1, le=50)):
    params = {"time": time, "limit": limit}
    if genre and genre.lower() not in ("for you", "foryou", "all"):
        params["genre"] = genre
    data = await audius_get("/tracks/trending", params)
    tracks = [normalize_track(t) for t in data if t.get("id")]
    return {"tracks": tracks[:limit]}


@api_router.get("/tracks/search")
async def search(q: str = Query(..., min_length=1),
                 limit: int = Query(25, ge=1, le=50)):
    data = await audius_get("/tracks/search", {"query": q, "limit": limit})
    tracks = [normalize_track(t) for t in data if t.get("id") and not t.get("is_delete")]
    return {"tracks": tracks[:limit]}


@api_router.get("/tracks/{track_id}")
async def track_detail(track_id: str):
    data = await audius_get(f"/tracks/{track_id}", {})
    if not data:
        raise HTTPException(status_code=404, detail="Track not found")
    return {"track": normalize_track(data)}


@api_router.get("/tracks/{track_id}/stream")
async def stream_proxy(track_id: str, request: Request):
    http = await get_http()
    hosts = await resolve_hosts()
    range_header = request.headers.get("range")
    upstream_headers = {}
    if range_header:
        upstream_headers["Range"] = range_header

    for host in hosts:
        url = f"{host}/v1/tracks/{track_id}/stream?app_name={APP_NAME}"
        try:
            req = http.build_request("GET", url, headers=upstream_headers)
            upstream = await http.send(req, stream=True)
            if upstream.status_code >= 400:
                await upstream.aclose()
                continue

            resp_headers = {
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            }
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
                media_type=upstream.headers.get("content-type", "audio/mpeg"),
                headers=resp_headers,
            )
        except Exception as e:
            logger.warning("stream host %s failed: %s", host, e)
            continue
    raise HTTPException(status_code=502, detail="Audio unavailable")


@api_router.get("/lyrics")
async def lyrics(title: str, artist: str,
                 album: str = "", duration: float = 0):
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
            return {
                "synced": j.get("syncedLyrics"),
                "plain": j.get("plainLyrics"),
                "instrumental": bool(j.get("instrumental")),
            }
        # fallback fuzzy search
        r2 = await http.get(f"{LRCLIB_BASE}/api/search",
                            params={"track_name": title, "artist_name": artist},
                            headers=headers)
        if r2.status_code == 200:
            arr = r2.json()
            if arr:
                best = arr[0]
                return {
                    "synced": best.get("syncedLyrics"),
                    "plain": best.get("plainLyrics"),
                    "instrumental": bool(best.get("instrumental")),
                }
    except Exception as e:
        logger.warning("lyrics error: %s", e)
    return {"synced": None, "plain": None, "instrumental": False}


# ---------------------------------------------------------------------------
# Library (device-scoped, no auth)
# ---------------------------------------------------------------------------
class TrackPayload(BaseModel):
    id: str
    title: str
    artist: str
    artwork: Optional[str] = None
    duration: int = 0
    genre: Optional[str] = None


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
