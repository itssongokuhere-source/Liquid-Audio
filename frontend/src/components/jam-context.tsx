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

import { useAudio, useAudioProgress } from "@/src/components/audio-context";
import { useToast } from "@/src/components/toast";
import {
  createJam,
  endJam,
  fetchJam,
  jamSocketUrl,
  type JamMember,
  type JamRoom,
  type JamState,
  type Track,
} from "@/src/lib/api";
import { getDeviceId } from "@/src/lib/device";
import { haptic } from "@/src/lib/haptics";

type JamContextValue = {
  room: JamRoom | null;
  isHost: boolean;
  members: JamMember[];
  connected: boolean;
  latencyMs: number;
  busy: boolean;
  start: (name: string) => Promise<string>;
  join: (code: string, name: string) => Promise<void>;
  leave: () => Promise<void>;
  sendControl: (action: "toggle" | "next" | "prev") => void;
  sendAddTrack: (track: Track) => void;
};

const JamContext = createContext<JamContextValue | null>(null);

export function useJam(): JamContextValue {
  const ctx = useContext(JamContext);
  if (!ctx) throw new Error("useJam must be used within JamProvider");
  return ctx;
}

const DRIFT_TOLERANCE = 0.35; // seconds
const HOST_INTERVAL = 1500; // ms

export function JamProvider({ children }: { children: ReactNode }) {
  const audio = useAudio();
  const { position } = useAudioProgress();
  const toast = useToast();

  const [room, setRoom] = useState<JamRoom | null>(null);
  const [members, setMembers] = useState<JamMember[]>([]);
  const [connected, setConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState(0);
  const [busy, setBusy] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<string>("");
  const offsetRef = useRef(0); // serverTime - clientTime (seconds)
  const positionRef = useRef(0);
  positionRef.current = position;
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const lastSyncedTrackRef = useRef<string | null>(null);

  useEffect(() => {
    getDeviceId().then((id) => {
      deviceRef.current = id;
    });
  }, []);

  const isHost = !!room && room.host_device === deviceRef.current;

  const serverNow = () => Date.now() / 1000 + offsetRef.current;

  const applyGuestState = useCallback((state: JamState) => {
    const a = audioRef.current;
    if (!state.track) return;
    const expected =
      (state.position ?? 0) + (state.playing && state.at ? Math.max(0, serverNow() - state.at) : 0);
    if (a.current?.id !== state.track.id || lastSyncedTrackRef.current !== state.track.id) {
      lastSyncedTrackRef.current = state.track.id;
      a.playNow(state.track, [state.track, ...(state.upcoming ?? [])]);
      setTimeout(() => a.seek(expected + 0.8), 900);
      return;
    }
    const drift = expected - positionRef.current;
    if (Math.abs(drift) > DRIFT_TOLERANCE) a.seek(expected);
    if (state.playing !== undefined && state.playing !== a.isPlaying) a.toggle();
  }, []);

  const closeSocket = useCallback(() => {
    try {
      wsRef.current?.close();
    } catch {
      // ignore
    }
    wsRef.current = null;
    setConnected(false);
  }, []);

  const connect = useCallback(
    (code: string, name: string, host: boolean) => {
      closeSocket();
      const ws = new WebSocket(jamSocketUrl(code, deviceRef.current, name));
      wsRef.current = ws;
      let pingTimer: ReturnType<typeof setInterval> | null = null;

      ws.onopen = () => {
        setConnected(true);
        const ping = () => {
          try {
            ws.send(JSON.stringify({ type: "ping", client_time: Date.now() / 1000 }));
          } catch {
            // ignore
          }
        };
        ping();
        pingTimer = setInterval(ping, 5000);
      };
      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const recv = Date.now() / 1000;
        switch (msg.type) {
          case "hello":
            offsetRef.current = msg.server_time - recv;
            setRoom(msg.room);
            setMembers(msg.room.members);
            if (!host && msg.room.state?.track) applyGuestState(msg.room.state);
            break;
          case "pong": {
            const rtt = recv - msg.client_time;
            offsetRef.current = msg.server_time - (recv - rtt / 2);
            setLatencyMs(Math.round((rtt * 1000) / 2));
            break;
          }
          case "members":
            setMembers(msg.members);
            break;
          case "state":
            if (!host) applyGuestState(msg.state);
            break;
          case "control":
            if (host) {
              const a = audioRef.current;
              if (msg.action === "toggle") a.toggle();
              else if (msg.action === "next") a.next();
              else if (msg.action === "prev") a.prev();
              toast(`${msg.from_name} ${msg.action === "toggle" ? "toggled playback" : "skipped"}`, "info");
            }
            break;
          case "add_track":
            if (host && msg.track) {
              audioRef.current.addToQueue(msg.track);
              toast(`${msg.from_name} added ${msg.track.title}`, "success");
            }
            break;
          case "ended":
            toast("The jam has ended", "info");
            setRoom(null);
            setMembers([]);
            closeSocket();
            break;
        }
      };
      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        setConnected(false);
      };
      ws.onerror = () => {
        setConnected(false);
      };
    },
    [applyGuestState, closeSocket, toast],
  );

  const start = useCallback(
    async (name: string) => {
      setBusy(true);
      try {
        const r = await createJam(deviceRef.current, name);
        setRoom(r);
        setMembers(r.members);
        connect(r.code, name, true);
        haptic.success();
        return r.code;
      } finally {
        setBusy(false);
      }
    },
    [connect],
  );

  const join = useCallback(
    async (code: string, name: string) => {
      setBusy(true);
      try {
        const r = await fetchJam(code);
        setRoom(r);
        setMembers(r.members);
        lastSyncedTrackRef.current = null;
        connect(r.code, name, false);
        haptic.success();
      } finally {
        setBusy(false);
      }
    },
    [connect],
  );

  const leave = useCallback(async () => {
    if (room && room.host_device === deviceRef.current) {
      await endJam(room.code, deviceRef.current).catch(() => {});
    }
    closeSocket();
    setRoom(null);
    setMembers([]);
    haptic.light();
  }, [room, closeSocket]);

  // Host: broadcast playback state periodically and on track/play changes.
  const currentId = audio.current?.id ?? null;
  const playing = audio.isPlaying;
  useEffect(() => {
    if (!room || !isHost) return;
    const send = () => {
      const a = audioRef.current;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !a.current) return;
      const upcoming = a.queue.slice(a.index + 1, a.index + 6);
      ws.send(
        JSON.stringify({
          type: "state",
          state: { track: a.current, position: positionRef.current, playing: a.isPlaying, upcoming },
        }),
      );
    };
    send();
    const t = setInterval(send, HOST_INTERVAL);
    return () => clearInterval(t);
  }, [room, isHost, currentId, playing, connected]);

  const sendControl = useCallback((action: "toggle" | "next" | "prev") => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      haptic.light();
      ws.send(JSON.stringify({ type: "control", action }));
    }
  }, []);

  const sendAddTrack = useCallback(
    (track: Track) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "add_track", track }));
        toast("Suggested to the jam", "success");
      }
    },
    [toast],
  );

  useEffect(() => () => closeSocket(), [closeSocket]);

  const value = useMemo<JamContextValue>(
    () => ({ room, isHost, members, connected, latencyMs, busy, start, join, leave, sendControl, sendAddTrack }),
    [room, isHost, members, connected, latencyMs, busy, start, join, leave, sendControl, sendAddTrack],
  );

  return <JamContext.Provider value={value}>{children}</JamContext.Provider>;
}
