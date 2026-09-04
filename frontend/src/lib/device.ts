import { useEffect, useState } from "react";

import { storage } from "@/src/utils/storage";

const KEY = "liquidaudio.device_id";
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const existing = await storage.getItem(KEY, "");
  if (existing) {
    cached = existing;
    return existing;
  }
  const id = `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  await storage.setItem(KEY, id);
  cached = id;
  return id;
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
