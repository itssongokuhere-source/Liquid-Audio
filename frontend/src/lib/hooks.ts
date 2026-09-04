import { useQuery } from "@tanstack/react-query";

import { fetchLibrary, type Library } from "@/src/lib/api";
import { useDeviceId } from "@/src/lib/device";

export function useLibrary() {
  const deviceId = useDeviceId();
  const query = useQuery<Library>({
    queryKey: ["library", deviceId],
    queryFn: () => fetchLibrary(deviceId as string),
    enabled: !!deviceId,
  });
  return { ...query, deviceId };
}
