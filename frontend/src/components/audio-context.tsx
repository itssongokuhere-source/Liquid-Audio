import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useQuery } from "@tanstack/react-query";

import * as Network from "expo-network";
import { Platform } from "react-native";

import {
  addRecent,
  fetchRadio,
  fetchRecommendations,
  playbackUrl,
  type Track,
} from "@/src/lib/api";
import { useDownloads } from "@/src/components/downloads-context";
import { useToast } from "@/src/components/toast";
import { getDeviceId } from "@/src/lib/device";
import { haptic } from "@/src/lib/haptics";
import { useSettings } from "@/src/lib/settings-context";
import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";

export type RepeatMode = "off" | "all" | "one";

const AUTOPLAY_KEY = "liquidaudio.autoplay";

type AudioContextValue = {
  current: Track | null;
  queue: Track[];
  index: number;
  hasTrack: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  position: number;
  duration: number;
  repeat: RepeatMode;
  shuffle: boolean;
  autoplay: boolean;
  suggestions: Track[];
  suggestionsLoading: boolean;
  radioLoading: boolean;
  playNow: (track: Track, list?: Track[]) => void;
  playNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearUpcoming: () => void;
  playSuggestion: (track: Track) => void;
  startRadio: (track: Track) => Promise<void>;
  toggleAutoplay: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  jumpTo: (index: number) => void;
  seek: (seconds: number) => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
};

const AudioContext = createContext<AudioContextValue | null>(null);

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const { getLocalUri } = useDownloads();
  const { settings } = useSettings();
  const toast = useToast();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [shuffle, setShuffle] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [radioLoading, setRadioLoading] = useState(false);

  const current = queue[index] ?? null;
  const loadedIdRef = useRef<string | null>(null);
  const repeatRef = useRef(repeat);
  const shuffleRef = useRef(shuffle);
  const autoplayRef = useRef(autoplay);
  const queueRef = useRef(queue);
  const indexRef = useRef(index);
  repeatRef.current = repeat;
  shuffleRef.current = shuffle;
  autoplayRef.current = autoplay;
  queueRef.current = queue;
  indexRef.current = index;

  useEffect(() => {
    storage.getItem<boolean>(AUTOPLAY_KEY, true).then((v) => setAutoplay(v !== false));
  }, []);

  // Autoplay suggestions are seeded from the tail of the queue (like YouTube Music).
  const tail = queue[queue.length - 1] ?? null;
  const queueIds = useMemo(() => queue.map((t) => t.id), [queue]);
  const recQuery = useQuery({
    queryKey: ["recommendations", tail?.id],
    queryFn: () => fetchRecommendations(tail!.id, queueIds),
    enabled: !!tail && autoplay,
    staleTime: 10 * 60 * 1000,
  });
  const suggestions = useMemo(() => {
    const ids = new Set(queueIds);
    return (recQuery.data ?? []).filter((t) => !ids.has(t.id));
  }, [recQuery.data, queueIds]);
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    }).catch(() => {});
  }, []);

  // Load audio whenever the current track changes.
  useEffect(() => {
    if (!current) return;
    if (loadedIdRef.current === current.id) return;
    loadedIdRef.current = current.id;
    let cancelled = false;
    const load = async () => {
      const local = getLocalUri(current.id);
      const { wifiOnly, quality, crossfade } = settingsRef.current;
      if (!local && wifiOnly && Platform.OS !== "web") {
        try {
          const state = await Network.getNetworkStateAsync();
          if (state.type === Network.NetworkStateType.CELLULAR) {
            toast("Streaming on mobile data is off — connect to Wi‑Fi or play downloads", "info");
            return;
          }
        } catch {
          // ignore network probe failures
        }
      }
      if (cancelled) return;
      try {
        player.volume = crossfade > 0 ? 0 : 1;
        player.replace({ uri: local || playbackUrl(current, quality) });
        player.play();
        if (crossfade > 0) {
          // Fade-in over ~700ms
          const steps = 14;
          for (let i = 1; i <= steps; i++) {
            setTimeout(() => {
              if (loadedIdRef.current === current.id) player.volume = Math.min(1, i / steps);
            }, i * 50);
          }
        }
      } catch {
        // ignore transient replace errors
      }
    };
    load();
    getDeviceId()
      .then((id) => addRecent(id, current))
      .then(() => queryClient.invalidateQueries({ queryKey: ["library"] }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current, player, getLocalUri, toast]);

  // Crossfade-out near the end of a track + gapless prefetch of the next stream.
  const prefetchedRef = useRef<string | null>(null);
  useEffect(() => {
    const dur = status.duration || 0;
    const pos = status.currentTime || 0;
    if (!current || dur <= 0) return;
    const remaining = dur - pos;
    const { crossfade, gapless, quality } = settingsRef.current;
    if (crossfade > 0 && remaining <= crossfade) {
      player.volume = Math.max(0.03, remaining / crossfade);
    }
    if (gapless && remaining <= 12) {
      const nextTrack = queueRef.current[indexRef.current + 1];
      if (nextTrack && prefetchedRef.current !== nextTrack.id && !getLocalUri(nextTrack.id)) {
        prefetchedRef.current = nextTrack.id;
        fetch(playbackUrl(nextTrack, quality), { headers: { Range: "bytes=0-65535" } }).catch(() => {});
      }
    }
  }, [status.currentTime, status.duration, current, player, getLocalUri]);

  const advance = useCallback((dir: 1 | -1, auto = false) => {
    const q = queueRef.current;
    const i = indexRef.current;
    if (q.length === 0) return;
    let target = i;
    if (shuffleRef.current && dir === 1) {
      if (q.length > 1) {
        while (target === i) target = Math.floor(Math.random() * q.length);
      }
    } else {
      const n = i + dir;
      if (n < 0) target = 0;
      else if (n >= q.length) {
        if (repeatRef.current === "all") target = 0;
        else if (autoplayRef.current && suggestionsRef.current.length) {
          // Queue exhausted → seamlessly continue with similar songs (autoplay).
          const more = suggestionsRef.current.slice(0, 12);
          setQueue([...q, ...more]);
          setIndex(q.length);
          if (!auto) haptic.light();
          return;
        } else target = i;
      } else target = n;
    }
    setIndex(target);
    if (!auto) haptic.light();
  }, []);

  // Auto-advance on track completion.
  const finishedRef = useRef(false);
  useEffect(() => {
    if (status.didJustFinish && !finishedRef.current) {
      finishedRef.current = true;
      if (repeatRef.current === "one") {
        player.seekTo(0);
        player.play();
      } else {
        advance(1, true);
      }
    }
    if (!status.didJustFinish) finishedRef.current = false;
  }, [status.didJustFinish, advance, player]);

  const playNow = useCallback(
    (track: Track, list?: Track[]) => {
      const q = list && list.length ? list : [track];
      const idx = Math.max(0, q.findIndex((t) => t.id === track.id));
      haptic.medium();
      if (loadedIdRef.current === track.id) {
        player.seekTo(0);
        player.play();
      }
      setQueue(q);
      setIndex(idx);
    },
    [player],
  );

  const playNext = useCallback(
    (track: Track) => {
      const q = queueRef.current;
      if (q.length === 0) {
        playNow(track);
        return;
      }
      haptic.success();
      const i = indexRef.current;
      const rest = q.filter((t, k) => k <= i || t.id !== track.id);
      rest.splice(i + 1, 0, track);
      setQueue(rest);
    },
    [playNow],
  );

  const addToQueue = useCallback(
    (track: Track) => {
      const q = queueRef.current;
      if (q.length === 0) {
        playNow(track);
        return;
      }
      haptic.success();
      if (q.some((t, k) => k > indexRef.current && t.id === track.id)) return;
      setQueue([...q, track]);
    },
    [playNow],
  );

  const removeFromQueue = useCallback((i: number) => {
    const q = queueRef.current;
    if (i < 0 || i >= q.length || i === indexRef.current) return;
    haptic.light();
    setQueue(q.filter((_, k) => k !== i));
    if (i < indexRef.current) setIndex(indexRef.current - 1);
  }, []);

  const moveInQueue = useCallback((from: number, to: number) => {
    const q = queueRef.current;
    const cur = indexRef.current;
    if (from === to || from <= cur || to <= cur || from >= q.length || to >= q.length) return;
    const copy = [...q];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    setQueue(copy);
  }, []);

  const clearUpcoming = useCallback(() => {
    haptic.light();
    setQueue(queueRef.current.slice(0, indexRef.current + 1));
  }, []);

  const playSuggestion = useCallback((track: Track) => {
    const q = queueRef.current;
    haptic.medium();
    setQueue([...q, track]);
    setIndex(q.length);
  }, []);

  const startRadio = useCallback(
    async (track: Track) => {
      setRadioLoading(true);
      try {
        const list = await fetchRadio(track.id);
        playNow(track, [track, ...list.filter((t) => t.id !== track.id)]);
      } finally {
        setRadioLoading(false);
      }
    },
    [playNow],
  );

  const toggleAutoplay = useCallback(() => {
    haptic.selection();
    setAutoplay((a) => {
      storage.setItem(AUTOPLAY_KEY, !a).catch(() => {});
      return !a;
    });
  }, []);

  const toggle = useCallback(() => {
    if (!current) return;
    haptic.medium();
    if (status.playing) player.pause();
    else player.play();
  }, [current, status.playing, player]);

  const next = useCallback(() => advance(1), [advance]);

  const jumpTo = useCallback((i: number) => {
    if (i >= 0 && i < queueRef.current.length) {
      haptic.light();
      setIndex(i);
    }
  }, []);

  const prev = useCallback(() => {
    if ((status.currentTime ?? 0) > 3) {
      player.seekTo(0);
      return;
    }
    advance(-1);
  }, [advance, status.currentTime, player]);

  const seek = useCallback(
    (seconds: number) => {
      player.seekTo(seconds);
    },
    [player],
  );

  const cycleRepeat = useCallback(() => {
    haptic.selection();
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }, []);

  const toggleShuffle = useCallback(() => {
    haptic.selection();
    setShuffle((s) => !s);
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({
      current,
      queue,
      index,
      hasTrack: !!current,
      isPlaying: !!status.playing,
      isBuffering: !!status.isBuffering,
      position: status.currentTime ?? 0,
      duration: status.duration || current?.duration || 0,
      repeat,
      shuffle,
      autoplay,
      suggestions,
      suggestionsLoading: recQuery.isLoading,
      radioLoading,
      playNow,
      playNext,
      addToQueue,
      removeFromQueue,
      moveInQueue,
      clearUpcoming,
      playSuggestion,
      startRadio,
      toggleAutoplay,
      toggle,
      next,
      prev,
      jumpTo,
      seek,
      cycleRepeat,
      toggleShuffle,
    }),
    [
      current,
      queue,
      index,
      status.playing,
      status.isBuffering,
      status.currentTime,
      status.duration,
      repeat,
      shuffle,
      autoplay,
      suggestions,
      recQuery.isLoading,
      radioLoading,
      playNow,
      playNext,
      addToQueue,
      removeFromQueue,
      moveInQueue,
      clearUpcoming,
      playSuggestion,
      startRadio,
      toggleAutoplay,
      toggle,
      next,
      prev,
      jumpTo,
      seek,
      cycleRepeat,
      toggleShuffle,
    ],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}
