import { useQuery } from "@tanstack/react-query";

import { getAuthSession } from "../../api/client";
import { normalizeProfileAvatarId } from "../../lib/profileAvatar";
import { useAppStore } from "../../stores/app";
import { PixelAvatar } from "../ui/PixelAvatar";

export function UserProfileFooter() {
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const setSettingsSection = useAppStore((s) => s.setSettingsSection);
  const { data } = useQuery({
    queryKey: ["auth-session"],
    queryFn: () => getAuthSession(),
    staleTime: 30_000,
  });
  const user = data?.user;
  const name = (user?.name || user?.email || "User").trim();
  const avatarID = normalizeProfileAvatarId(user?.avatar_id);

  return (
    <button
      type="button"
      className="sidebar-profile-button"
      onClick={() => {
        setSettingsSection("profile");
        setCurrentApp("settings");
      }}
    >
      <span className="sidebar-profile-avatar" aria-hidden="true">
        <PixelAvatar slug={avatarID} size={28} />
      </span>
      <span className="sidebar-profile-copy">
        <span className="sidebar-profile-name">{name}</span>
      </span>
    </button>
  );
}
