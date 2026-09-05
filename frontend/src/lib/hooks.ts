import { useQuery } from "@tanstack/react-query";

import { fetchLibrary, type Library } from "@/src/lib/api";
import { useDeviceId } from "@/src/lib/device";
import { fetchMixes, type Mix } from "@/src/lib/api";

export function useLibrary() {
  const deviceId = useDeviceId();
  const query = useQuery<Library>({
    queryKey: ["library", deviceId],
    queryFn: () => fetchLibrary(deviceId as string),
    enabled: !!deviceId,
  });
  return { ...query, deviceId };
}

export function useMixes() {
  const deviceId = useDeviceId();
  const query = useQuery<Mix[]>({
    queryKey: ["mixes", deviceId],
    queryFn: () => fetchMixes(deviceId as string),
    enabled: !!deviceId,
    staleTime: 60 * 60 * 1000,
  });
  return { ...query, deviceId };
}
