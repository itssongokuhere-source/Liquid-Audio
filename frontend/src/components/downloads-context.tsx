import * as FileSystem from "expo-file-system/legacy";
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
import { Platform } from "react-native";

import { useToast } from "@/src/components/toast";
import { streamUrl, type Track } from "@/src/lib/api";
import { haptic } from "@/src/lib/haptics";
import { storage } from "@/src/utils/storage";

const KEY = "liquidaudio.downloads";
const DIR = (FileSystem.documentDirectory ?? "") + "downloads/";

type DownloadEntry = { track: Track; localUri: string; at: number };
type DownloadsMap = Record<string, DownloadEntry>;

type DownloadsValue = {
  downloads: Track[];
  isDownloaded: (id: string) => boolean;
  isDownloading: (id: string) => boolean;
  getLocalUri: (id: string) => string | null;
  downloadTrack: (track: Track) => Promise<void>;
  downloadMany: (tracks: Track[]) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
};

const DownloadsContext = createContext<DownloadsValue | null>(null);

export function useDownloads(): DownloadsValue {
  const ctx = useContext(DownloadsContext);
  if (!ctx) throw new Error("useDownloads must be used within DownloadsProvider");
  return ctx;
}

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [map, setMap] = useState<DownloadsMap>({});
  const [downloading, setDownloading] = useState<string[]>([]);
  const mapRef = useRef<DownloadsMap>({});
  mapRef.current = map;

  useEffect(() => {
    storage.getItem<DownloadsMap>(KEY, {} as DownloadsMap).then((saved) => {
      if (saved) setMap(saved);
    });
  }, []);

  const persist = useCallback((next: DownloadsMap) => {
    setMap(next);
    storage.setItem(KEY, next);
  }, []);

  const getLocalUri = useCallback((id: string) => mapRef.current[id]?.localUri ?? null, []);
  const isDownloaded = useCallback((id: string) => !!map[id], [map]);
  const isDownloading = useCallback((id: string) => downloading.includes(id), [downloading]);

  const downloadTrack = useCallback(
    async (track: Track) => {
      if (Platform.OS === "web") {
        toast("Downloads work in the installed app", "info");
        return;
      }
      if (mapRef.current[track.id] || !track.id) return;
      const source = track.previewUrl || streamUrl(track.id);
      setDownloading((d) => [...d, track.id]);
      try {
        try {
          await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
        } catch {
          // dir exists
        }
        const fileUri = `${DIR}${track.id}.mp4`;
        const res = await FileSystem.downloadAsync(source, fileUri);
        const next = {
          ...mapRef.current,
          [track.id]: { track, localUri: res.uri, at: Date.now() },
        };
        persist(next);
        haptic.success();
        toast("Downloaded for offline", "success");
      } catch {
        toast("Download failed", "error");
      } finally {
        setDownloading((d) => d.filter((x) => x !== track.id));
      }
    },
    [toast, persist],
  );

  const downloadMany = useCallback(
    async (tracks: Track[]) => {
      if (Platform.OS === "web") {
        toast("Downloads work in the installed app", "info");
        return;
      }
      toast(`Downloading ${tracks.length} songs…`, "info");
      for (const t of tracks) {
        // eslint-disable-next-line no-await-in-loop
        await downloadTrack(t);
      }
    },
    [downloadTrack, toast],
  );

  const removeDownload = useCallback(
    async (id: string) => {
      const entry = mapRef.current[id];
      if (!entry) return;
      try {
        await FileSystem.deleteAsync(entry.localUri, { idempotent: true });
      } catch {
        // ignore
      }
      const next = { ...mapRef.current };
      delete next[id];
      persist(next);
      toast("Removed download", "success");
    },
    [persist, toast],
  );

  const downloads = useMemo(
    () => Object.values(map).sort((a, b) => b.at - a.at).map((e) => e.track),
    [map],
  );

  const value = useMemo<DownloadsValue>(
    () => ({
      downloads,
      isDownloaded,
      isDownloading,
      getLocalUri,
      downloadTrack,
      downloadMany,
      removeDownload,
    }),
    [downloads, isDownloaded, isDownloading, getLocalUri, downloadTrack, downloadMany, removeDownload],
  );

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
}
