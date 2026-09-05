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

import { addRecent, streamUrl, type Track } from "@/src/lib/api";
import { getDeviceId } from "@/src/lib/device";
import { haptic } from "@/src/lib/haptics";
import { queryClient } from "@/src/query-client";

export type RepeatMode = "off" | "all" | "one";

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
  playNow: (track: Track, list?: Track[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
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

  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [shuffle, setShuffle] = useState(false);

  const current = queue[index] ?? null;
  const loadedIdRef = useRef<string | null>(null);
  const repeatRef = useRef(repeat);
  const shuffleRef = useRef(shuffle);
  repeatRef.current = repeat;
  shuffleRef.current = shuffle;

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
    try {
      player.replace({ uri: current.previewUrl || streamUrl(current.id) });
      player.play();
    } catch {
      // ignore transient replace errors
    }
    getDeviceId()
      .then((id) => addRecent(id, current))
      .then(() => queryClient.invalidateQueries({ queryKey: ["library"] }))
      .catch(() => {});
  }, [current, player]);

  const advance = useCallback(
    (dir: 1 | -1, auto = false) => {
      setIndex((i) => {
        if (queue.length === 0) return i;
        if (shuffleRef.current && dir === 1) {
          if (queue.length === 1) return i;
          let r = i;
          while (r === i) r = Math.floor(Math.random() * queue.length);
          return r;
        }
        const nextIndex = i + dir;
        if (nextIndex < 0) return 0;
        if (nextIndex >= queue.length) {
          return repeatRef.current === "all" ? 0 : i;
        }
        return nextIndex;
      });
      if (!auto) haptic.light();
    },
    [queue.length],
  );

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
        setQueue(q);
        setIndex(idx);
        return;
      }
      setQueue(q);
      setIndex(idx);
    },
    [player],
  );

  const toggle = useCallback(() => {
    if (!current) return;
    haptic.medium();
    if (status.playing) player.pause();
    else player.play();
  }, [current, status.playing, player]);

  const next = useCallback(() => advance(1), [advance]);

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
      playNow,
      toggle,
      next,
      prev,
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
      playNow,
      toggle,
      next,
      prev,
      seek,
      cycleRepeat,
      toggleShuffle,
    ],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}
