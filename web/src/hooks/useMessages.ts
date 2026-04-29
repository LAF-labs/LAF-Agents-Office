import { useQuery } from "@tanstack/react-query";

import type { Message } from "../api/client";
import { getMessages, getThreadMessages } from "../api/client";

const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const MESSAGE_REFETCH_MS = liveEventsSupported ? 10_000 : 2_000;
const THREAD_REFETCH_MS = liveEventsSupported ? 10_000 : 3_000;

export function useMessages(channel: string, sinceId?: string | null) {
  return useQuery({
    queryKey: ["messages", channel, sinceId],
    queryFn: () => getMessages(channel, sinceId),
    refetchInterval: MESSAGE_REFETCH_MS,
    select: (data) => data.messages ?? [],
  });
}

export function useThreadMessages(channel: string, threadId: string | null) {
  return useQuery({
    queryKey: ["thread-messages", channel, threadId],
    queryFn: () =>
      threadId
        ? getThreadMessages(channel, threadId)
        : Promise.resolve({ messages: [] }),
    enabled: !!threadId,
    refetchInterval: THREAD_REFETCH_MS,
    select: (data) => data.messages ?? [],
  });
}

export type { Message };
