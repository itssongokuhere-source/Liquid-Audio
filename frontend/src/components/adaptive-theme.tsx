import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { useAudio } from "@/src/components/audio-context";
import { fetchPalette } from "@/src/lib/api";
import { accentHex, useSettings } from "@/src/lib/settings-context";
import { setAccent } from "@/src/theme";

/**
 * Drives the global accent colour: either the user's chosen preset or, when
 * "Adaptive colours" is on, a vibrant tone pulled from the current artwork.
 */
export function AdaptiveTheme() {
  const { settings, ready } = useSettings();
  const { current } = useAudio();
  const artwork = settings.adaptiveColors ? current?.artwork ?? null : null;

  const { data } = useQuery({
    queryKey: ["palette", artwork],
    queryFn: () => fetchPalette(artwork as string),
    enabled: !!artwork,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!ready) return;
    if (settings.adaptiveColors && data?.accent) setAccent(data.accent);
    else setAccent(accentHex(settings.accent));
  }, [ready, settings.adaptiveColors, settings.accent, data?.accent]);

  return null;
}
