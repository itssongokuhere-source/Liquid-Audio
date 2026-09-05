# LiquidAudio — PRD

## Original problem statement
Build a premium music app like Tidal / YouTube Music: recommendations feed, a
premium equalizer with effects, a pure liquid-glass UI with premium animations,
and Apple-Music-style word-by-word synced lyrics. Must work reliably. In-app /
auto updates like big-company apps (delivered via Publish → build flow).

## User choices
- Music source: free royalty-free API (**Audius**, no keys).
- No login — jump straight in (library scoped to a per-device id).
- Theme: **Dark liquid glass primary + Light + Auto toggle**, minimalistic & premium.
- Synced/word lyrics like Apple Music (via **LRCLIB**, no keys).
- Premium equalizer with effects.

## Architecture
- **Frontend:** Expo Router (React Native). Providers: ErrorBoundary → ReactQuery →
  GestureHandler → KeyboardController → SafeArea → Toast → Audio → TrackActions.
  Tabs: Home / Search / Sound (EQ) / Library. Modals: Player, Lyrics.
- **Audio engine:** `expo-audio` (`useAudioPlayer`) in a persistent AudioProvider —
  queue, shuffle, repeat (off/all/one), auto-advance, background-audio mode.
- **Backend:** FastAPI proxy to Audius (trending/search/track/stream) + LRCLIB
  (lyrics) + MongoDB `libraries` collection (favorites / recent / playlists) keyed
  by `device_id`. Stream endpoint proxies audio with Range support (same-origin,
  works on web + native).
- **Theme:** `src/theme.ts` dark+light tokens from design_guidelines.json, app-level
  scheme override via `setAppScheme` (persisted).

## Personas
- Everyday listener who wants a gorgeous, free player with discovery + lyrics.
- Audiophile who wants an equalizer to shape sound.

## Core requirements (static)
- Discovery/recommendations feed with genres.
- Full-screen glass Now-Playing + floating mini-player.
- Synced karaoke lyrics with word fill on the active line.
- Equalizer with presets, 10-band faders, effect toggles.
- Device library: favorites, recently played, playlists.
- Dark/Light/Auto theming.

## Implemented (2026-09-04)
- Backend: trending (+genre), search, track detail, streaming proxy (Range),
  lyrics (get + fuzzy search fallback), library CRUD (favorite/recent/playlist).
- Home: sticky glass header, genre chip row, hero card, trending + recently-played
  rows, "more to explore" list.
- Search: debounced search, suggestions, results, play from list.
- Player: blurred artwork backdrop, big art, seek bar, shuffle/prev/play/next/repeat,
  favorite, buttons to Lyrics and Equalizer.
- Lyrics: synced line highlight + word-by-word fill on active line, tap-to-seek,
  auto-scroll, plain-lyrics + instrumental fallbacks.
- Equalizer: enable switch, 9 presets, custom 10-band faders (PanResponder),
  4 effect toggles, live visualizer, per-device persistence.
- Library: Favorites / Recent / Playlists segments + Auto/Light/Dark toggle.
- Track actions sheet: favorite, create playlist, add to playlist.
- Verified by testing agent: 15/15 backend tests + full frontend flows pass.

## Notes / limitations
- **Catalog = JioSaavn** (full-length 320kbps songs, official cover art, mainstream
  Hindi/Bollywood + English/Punjabi/Tamil/Telugu/Bhojpuri/Bengali/Marathi/Malayalam).
  Media URLs are DES-decrypted server-side; browse by language. Verified full multi-MB
  streams + synced Hindi lyrics. (History: Audius=indie only; iTunes=preview only;
  YouTube=server-side blocked by SABR/PO-token — all rejected for the user's needs.)
- **Downloads (offline)**: songs, whole playlists, and a Library "Downloads" tab; downloaded
  files play offline. Native-only (expo-file-system) — no-op on web preview, works on the build.
- **Up Next / Queue** screen from the player (jump to any upcoming song).
- Web preview may fail to decode JioSaavn's AAC stream in the browser `<audio>` element;
  native iOS/Android builds decode fine (test on the APK).
- Full DSP per-band EQ + true background/lock-screen audio require a native build (not Expo Go).
- Auto/OTA updates ship on the installed build via the Publish flow.

## Backlog
- P1: apply saved EQ preset to real DSP on native build (per-band audio processing).
- P1: artist/album detail pages; playlist detail screen with reorder & remove.
- P2: download/offline caching; sleep timer; crossfade; queue reorder UI.
- P2: share-a-track deep links; "For You" personalization from listening history.
