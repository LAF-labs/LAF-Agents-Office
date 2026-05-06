import { useChannels } from "../../hooks/useChannels";
import { type I18nKey, useI18n } from "../../lib/i18n";
import { useAppStore } from "../../stores/app";

interface ChannelHeaderProps {
  onLogout?: () => void;
  userEmail?: string;
}

const APP_TITLE_KEYS: Record<string, I18nKey> = {
  wiki: "app.wiki",
  tasks: "app.tasks",
  requests: "app.requests",
  threads: "app.threads",
  skills: "app.skills",
  activity: "app.activity",
  receipts: "app.receipts",
  settings: "app.settings",
};

export function ChannelHeader({ onLogout, userEmail }: ChannelHeaderProps) {
  const currentChannel = useAppStore((s) => s.currentChannel);
  const currentApp = useAppStore((s) => s.currentApp);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const { data: channels = [] } = useChannels();
  const { language, t } = useI18n();

  const channel = channels.find((c) => c.slug === currentChannel);
  const title = currentApp
    ? APP_TITLE_KEYS[currentApp]
      ? t(APP_TITLE_KEYS[currentApp])
      : currentApp.charAt(0).toUpperCase() + currentApp.slice(1)
    : `# ${currentChannel}`;
  const desc = currentApp ? "" : channel?.description || "";
  const signOutLabel = t("auth.signOut");
  const signOutTitle = userEmail
    ? language === "ko"
      ? `${userEmail} ${signOutLabel}`
      : `${signOutLabel} ${userEmail}`
    : signOutLabel;
  const searchLabel = t("common.search");

  return (
    <div className="channel-header">
      <div style={{ display: "flex", alignItems: "center" }}>
        <span className="channel-title">{title}</span>
        {desc ? <span className="channel-desc">{desc}</span> : null}
      </div>
      <div className="channel-actions">
        {onLogout ? (
          <button
            className="sidebar-btn"
            title={signOutTitle}
            aria-label={signOutLabel}
            onClick={onLogout}
            type="button"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            >
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
              <path d="M21 3v18" />
            </svg>
          </button>
        ) : null}
        <button
          className="sidebar-btn"
          title={searchLabel}
          aria-label={searchLabel}
          onClick={() => setSearchOpen(true)}
          type="button"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
