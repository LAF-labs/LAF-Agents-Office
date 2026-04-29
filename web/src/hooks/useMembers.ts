import { useQuery } from "@tanstack/react-query";

import type { OfficeMember } from "../api/client";
import { getMembers, getOfficeMembers } from "../api/client";

const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const MEMBER_REFETCH_MS = liveEventsSupported ? 15_000 : 5_000;

export function useOfficeMembers() {
  return useQuery({
    queryKey: ["office-members"],
    queryFn: () => getOfficeMembers(),
    refetchInterval: MEMBER_REFETCH_MS,
    select: (data) => data.members ?? [],
  });
}

export function useChannelMembers(channel: string) {
  return useQuery({
    queryKey: ["channel-members", channel],
    queryFn: () => getMembers(channel),
    refetchInterval: MEMBER_REFETCH_MS,
    select: (data) => data.members ?? [],
  });
}

export type { OfficeMember };
