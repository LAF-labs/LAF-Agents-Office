import { useQuery } from "@tanstack/react-query";

import type { Channel } from "../api/client";
import { getChannels } from "../api/client";

const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const CHANNEL_REFETCH_MS = liveEventsSupported ? 30_000 : 10_000;

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: () => getChannels(),
    refetchInterval: CHANNEL_REFETCH_MS,
    select: (data) => data.channels ?? [],
  });
}

export type { Channel };
