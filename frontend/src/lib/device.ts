import { useEffect, useState } from "react";

import { storage } from "@/src/utils/storage";

const KEY = "liquidaudio.device_id";
let cached: string | null = null;
let pending: Promise<string> | null = null;

/** One stable id per install — concurrent first calls share the same promise (no duplicate ids). */
export function getDeviceId(): Promise<string> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = (async () => {
    const existing = await storage.getItem<string>(KEY, "");
    if (existing) {
      cached = existing;
      return existing;
    }
    const id = `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    await storage.setItem(KEY, id);
    cached = id;
    return id;
  })();
  return pending;
}

export function useDeviceId(): string | null {
  const [id, setId] = useState<string | null>(cached);
  useEffect(() => {
    let mounted = true;
    getDeviceId().then((v) => {
      if (mounted) setId(v);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return id;
}
