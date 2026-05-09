import type {
  AuthUser,
  HumanIdentity,
  HumanTeamMember,
  OfficeMember,
} from "../api/client";

export type MentionTargetKind = "agent" | "person";

export interface MentionTarget {
  kind: MentionTargetKind;
  slug: string;
  name: string;
  email?: string;
  role?: string;
}

const MENTION_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;
const NON_MENTIONABLE_SLUGS = new Set(["human", "you", "system"]);

export function normalizeMentionSlug(raw: string | undefined): string {
  const slug = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!MENTION_SLUG_RE.test(slug)) return "";
  if (NON_MENTIONABLE_SLUGS.has(slug)) return "";
  return slug;
}

export function mentionSlugFromEmail(email: string | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  return normalizeMentionSlug(local);
}

export function agentMentionTargets(
  members: readonly Pick<OfficeMember, "slug" | "name" | "role">[],
): MentionTarget[] {
  const targets: MentionTarget[] = [];
  const seen = new Set<string>();
  for (const member of members) {
    const slug = normalizeMentionSlug(member.slug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    targets.push({
      kind: "agent",
      slug,
      name: member.name || member.slug,
      role: member.role,
    });
  }
  return targets;
}

interface PeopleSources {
  authUsers?: readonly AuthUser[];
  humanMembers?: readonly HumanTeamMember[];
  humanIdentities?: readonly HumanIdentity[];
  agentSlugs?: readonly string[];
}

export function personMentionTargets({
  authUsers = [],
  humanMembers = [],
  humanIdentities = [],
  agentSlugs = [],
}: PeopleSources): MentionTarget[] {
  const agentSlugSet = new Set(agentSlugs.map(normalizeMentionSlug));
  const people = new Map<string, MentionTarget>();

  const add = (
    slugish: string | undefined,
    name: string | undefined,
    email: string | undefined,
    role: string | undefined,
  ) => {
    const slug = normalizeMentionSlug(slugish) || mentionSlugFromEmail(email);
    if (!slug || agentSlugSet.has(slug)) return;
    const displayName = (name || email || slug).trim();
    const existing = people.get(slug);
    if (existing) {
      people.set(slug, {
        ...existing,
        name: existing.name || displayName,
        email: existing.email || email,
        role: existing.role || role,
      });
      return;
    }
    people.set(slug, {
      kind: "person",
      slug,
      name: displayName,
      email,
      role,
    });
  };

  for (const identity of humanIdentities) {
    add(identity.slug, identity.name, identity.email, undefined);
  }
  for (const user of authUsers) {
    if (user.status && user.status !== "active") continue;
    add(mentionSlugFromEmail(user.email), user.name, user.email, user.role);
  }
  for (const member of humanMembers) {
    if (member.status && member.status !== "active") continue;
    add(
      mentionSlugFromEmail(member.email),
      member.name,
      member.email,
      member.role,
    );
  }

  return [...people.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export function mentionTargetSlugs(
  agents: readonly MentionTarget[],
  people: readonly MentionTarget[],
): string[] {
  const seen = new Set<string>();
  const slugs: string[] = [];
  for (const target of [...agents, ...people]) {
    if (seen.has(target.slug)) continue;
    seen.add(target.slug);
    slugs.push(target.slug);
  }
  return slugs;
}
