// API client for the LiquidAudio backend (Audius + LRCLIB proxy + library).

export const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL as string;
export const API = `${BACKEND}/api`;

export type Track = {
  id: string;
  title: string;
  artist: string;
  artistHandle?: string | null;
  artists?: { id: string | null; name: string; role: string }[];
  artwork?: string | null;
  duration: number;
  genre?: string | null;
  album?: string | null;
  previewUrl?: string | null;
  playCount?: number;
  favoriteCount?: number;
};

export type Playlist = { id: string; name: string; tracks: Track[] };
export type Library = { favorites: Track[]; recent: Track[]; playlists: Playlist[] };
export type Lyrics = { synced: string | null; plain: string | null; instrumental: boolean; source?: string | null };

export type JamMember = { device: string; name: string; host: boolean };
export type JamState = {
  track?: Track | null;
  position?: number;
  playing?: boolean;
  at?: number;
  upcoming?: Track[];
};
export type JamRoom = {
  code: string;
  host_device: string;
  host_name: string;
  members: JamMember[];
  state: JamState;
  server_time: number;
};

export async function createJam(deviceId: string, name: string) {
  return postJSON<JamRoom>(`/jam`, { device_id: deviceId, name });
}

export async function fetchJam(code: string) {
  return getJSON<JamRoom>(`/jam/${encodeURIComponent(code.toUpperCase())}`);
}

export async function endJam(code: string, deviceId: string) {
  const res = await fetch(`${API}/jam/${encodeURIComponent(code)}?device_id=${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
  });
  return res.ok;
}

export function jamSocketUrl(code: string, deviceId: string, name: string) {
  const ws = API.replace(/^http/, "ws");
  return `${ws}/jam/ws/${encodeURIComponent(code.toUpperCase())}?device_id=${encodeURIComponent(deviceId)}&name=${encodeURIComponent(name)}`;
}

export function jamShareUrl(code: string) {
  return `${BACKEND}/jam?code=${code}`;
}

export type Artist = {
  id: string;
  name: string;
  handle?: string | null;
  image?: string | null;
  cover?: string | null;
  bio?: string | null;
  isVerified: boolean;
  followerCount: number;
  trackCount: number;
};

export type StreamQuality = "low" | "high" | "max";
const QUALITY_BITRATE: Record<StreamQuality, string> = { low: "96", high: "160", max: "320" };

export function streamUrl(id: string, quality: StreamQuality = "max"): string {
  return `${API}/tracks/${id}/stream?q=${QUALITY_BITRATE[quality]}`;
}

/** Prefer the direct CDN URL (rewritten to the chosen bitrate); fall back to the proxy. */
export function playbackUrl(track: Track, quality: StreamQuality = "max"): string {
  if (track.previewUrl) return track.previewUrl.replace(/_\d+\.mp4/, `_${QUALITY_BITRATE[quality]}.mp4`);
  return streamUrl(track.id, quality);
}

export type AppRelease = {
  id: string;
  platform: string;
  version: string;
  apk_url: string;
  notes: string;
  mandatory: boolean;
  published_at: string;
};

export async function fetchAppVersion(current: string, platform = "android") {
  return getJSON<{ latest: AppRelease | null; update_available: boolean }>(
    `/app/version?platform=${platform}&current=${encodeURIComponent(current)}`,
  );
}

export async function fetchReleases(platform = "android") {
  const d = await getJSON<{ releases: AppRelease[] }>(`/app/releases?platform=${platform}`);
  return d.releases;
}

export async function publishRelease(body: {
  pin: string;
  version: string;
  apk_url: string;
  notes: string;
}) {
  return postJSON<{ release: AppRelease }>(`/app/version`, body);
}

export async function fetchPalette(url: string) {
  return getJSON<{ accent: string | null; dominant: string | null; background: string | null }>(
    `/artwork/palette?url=${encodeURIComponent(url)}`,
  );
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`Request failed ${res.status}`);
  return res.json();
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed ${res.status}`);
  return res.json();
}

export async function fetchTrending(genre?: string): Promise<Track[]> {
  const q = genre ? `?genre=${encodeURIComponent(genre)}` : "";
  const data = await getJSON<{ tracks: Track[] }>(`/tracks/trending${q}`);
  return data.tracks;
}

export async function searchTracks(q: string): Promise<Track[]> {
  const data = await getJSON<{ tracks: Track[] }>(`/tracks/search?q=${encodeURIComponent(q)}`);
  return data.tracks;
}

export async function fetchRecommendations(trackId: string, exclude: string[] = []): Promise<Track[]> {
  const ex = exclude.length ? `&exclude=${encodeURIComponent(exclude.slice(0, 60).join(","))}` : "";
  const data = await getJSON<{ tracks: Track[] }>(`/tracks/${trackId}/recommendations?limit=20${ex}`);
  return data.tracks;
}

export async function fetchRadio(trackId: string): Promise<Track[]> {
  const data = await getJSON<{ tracks: Track[] }>(`/tracks/${trackId}/radio?limit=40`);
  return data.tracks;
}

export type SearchResults = {
  query: string;
  top: SearchEntity | null;
  artists: SearchEntity[];
  artistSongs: Track[];
  songs: Track[];
};

export async function searchAll(q: string) {
  return getJSON<SearchResults>(`/search?q=${encodeURIComponent(q)}`);
}

export type SearchSuggestion = { text: string };
export type SearchEntity = {
  type: "song" | "artist" | "album";
  id: string;
  title: string;
  subtitle: string;
  image?: string | null;
  track?: Track;
};

export async function fetchSuggestions(q: string) {
  return getJSON<{ suggestions: SearchSuggestion[]; entities: SearchEntity[] }>(
    `/search/suggest?q=${encodeURIComponent(q)}`,
  );
}

export async function fetchLyrics(t: Track): Promise<Lyrics> {
  const params = new URLSearchParams({
    title: t.title,
    artist: t.artist,
    album: t.album ?? "",
    duration: String(Math.round(t.duration || 0)),
    track_id: t.id,
  });
  return getJSON<Lyrics>(`/lyrics?${params.toString()}`);
}

function slim(t: Track) {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    artistHandle: t.artistHandle ?? null,
    artists: t.artists ?? [],
    artwork: t.artwork ?? null,
    duration: t.duration ?? 0,
    genre: t.genre ?? null,
    album: t.album ?? null,
    previewUrl: t.previewUrl ?? null,
  };
}

export async function fetchArtist(handle: string): Promise<{ artist: Artist; tracks: Track[] }> {
  return getJSON(`/artists/${encodeURIComponent(handle)}`);
}

export async function fetchLibrary(deviceId: string): Promise<Library> {
  return getJSON<Library>(`/library?device_id=${encodeURIComponent(deviceId)}`);
}

export async function toggleFavorite(deviceId: string, track: Track) {
  return postJSON<{ favorited: boolean; favorites: Track[] }>(`/library/favorite`, {
    device_id: deviceId,
    track: slim(track),
  });
}

export async function addRecent(deviceId: string, track: Track) {
  return postJSON<{ recent: Track[] }>(`/library/recent`, {
    device_id: deviceId,
    track: slim(track),
  });
}

export async function createPlaylist(deviceId: string, name: string) {
  return postJSON<{ playlists: Playlist[] }>(`/library/playlist`, {
    device_id: deviceId,
    name,
  });
}

export async function addToPlaylist(deviceId: string, playlistId: string, track: Track) {
  return postJSON<{ playlists: Playlist[] }>(`/library/playlist/${playlistId}/track`, {
    device_id: deviceId,
    track: slim(track),
  });
}

export async function removeFromPlaylist(deviceId: string, playlistId: string, trackId: string) {
  const res = await fetch(
    `${API}/library/playlist/${playlistId}/track/${trackId}?device_id=${encodeURIComponent(deviceId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Request failed ${res.status}`);
  return res.json() as Promise<{ playlists: Playlist[] }>;
}

export async function reorderPlaylist(deviceId: string, playlistId: string, trackIds: string[]) {
  const res = await fetch(`${API}/library/playlist/${playlistId}/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, track_ids: trackIds }),
  });
  if (!res.ok) throw new Error(`Request failed ${res.status}`);
  return res.json() as Promise<{ playlists: Playlist[] }>;
}
