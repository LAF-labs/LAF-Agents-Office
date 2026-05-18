export const DEFAULT_PROFILE_AVATAR_ID = "human";

export const PROFILE_AVATAR_IDS = [
  "human",
  "ceo",
  "pm",
  "fe",
  "be",
  "designer",
  "cmo",
  "cro",
  "qa",
  "content",
] as const;

export type ProfileAvatarId = (typeof PROFILE_AVATAR_IDS)[number];

export function normalizeProfileAvatarId(value?: string | null): ProfileAvatarId {
  const candidate = String(value || "").trim().toLowerCase();
  return PROFILE_AVATAR_IDS.includes(candidate as ProfileAvatarId)
    ? (candidate as ProfileAvatarId)
    : DEFAULT_PROFILE_AVATAR_ID;
}
