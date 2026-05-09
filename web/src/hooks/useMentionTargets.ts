import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getAuthUsers,
  getHumans,
  getInvites,
  type AuthUser,
  type HumanIdentity,
  type HumanTeamMember,
} from "../api/client";
import {
  agentMentionTargets,
  mentionTargetSlugs,
  personMentionTargets,
} from "../lib/mentionTargets";
import { useOfficeMembers } from "./useMembers";

const liveEventsSupported =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined";
const MENTION_PEOPLE_REFETCH_MS = liveEventsSupported ? 30_000 : 10_000;

interface PeopleMentionSources {
  authUsers: AuthUser[];
  humanMembers: HumanTeamMember[];
  humanIdentities: HumanIdentity[];
}

async function optionalList<T>(
  promise: Promise<T[]>,
  fallback: T[] = [],
): Promise<T[]> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

async function fetchPeopleMentionSources(): Promise<PeopleMentionSources> {
  const [authUsers, inviteData, humanIdentities] = await Promise.all([
    optionalList(getAuthUsers().then((res) => res.users ?? [])),
    getInvites().catch(() => ({ human_members: [] })),
    optionalList(getHumans().then((res) => res.humans ?? [])),
  ]);

  return {
    authUsers,
    humanMembers: inviteData.human_members ?? [],
    humanIdentities,
  };
}

export function useMentionTargets() {
  const { data: members = [] } = useOfficeMembers();
  const { data: peopleSources = defaultPeopleMentionSources } = useQuery({
    queryKey: ["mention-people"],
    queryFn: fetchPeopleMentionSources,
    refetchInterval: MENTION_PEOPLE_REFETCH_MS,
    staleTime: 30_000,
  });

  return useMemo(() => {
    const agents = agentMentionTargets(members);
    const agentSlugs = agents.map((target) => target.slug);
    const people = personMentionTargets({
      ...peopleSources,
      agentSlugs,
    });
    return {
      agentMembers: members,
      agents,
      people,
      agentSlugs,
      mentionSlugs: mentionTargetSlugs(agents, people),
    };
  }, [members, peopleSources]);
}

const defaultPeopleMentionSources: PeopleMentionSources = {
  authUsers: [],
  humanMembers: [],
  humanIdentities: [],
};
