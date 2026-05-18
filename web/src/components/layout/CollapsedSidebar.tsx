import {
  type ComponentType,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BookStack,
  CheckCircle,
  Flash,
  HomeSimple,
  Package,
  Page,
  Play,
  Settings as SettingsIcon,
  SidebarExpand,
} from "iconoir-react";

import { getAuthSession, getModelAvailability, getUsage } from "../../api/client";
import { SIDEBAR_APPS } from "../../lib/constants";
import { formatTokens } from "../../lib/format";
import { type I18nKey, useI18n } from "../../lib/i18n";
import { normalizeProfileAvatarId } from "../../lib/profileAvatar";
import { preloadWorkspaceSurface } from "../../lib/workspacePreload";
import { useAppStore } from "../../stores/app";
import { PixelAvatar } from "../ui/PixelAvatar";

const APP_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  home: HomeSimple,
  growth: Activity,
  studio: Play,
  wiki: BookStack,
  tasks: CheckCircle,
  skills: Flash,
  activity: Package,
  receipts: Page,
  settings: SettingsIcon,
};

type Popover = "usage" | null;
type HintState = { label: string; y: number } | null;

export function CollapsedSidebar() {
  const toggleCollapsed = useAppStore((s) => s.toggleSidebarCollapsed);
  const currentApp = useAppStore((s) => s.currentApp);
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const setSettingsSection = useAppStore((s) => s.setSettingsSection);
  const { t } = useI18n();
  const [popover, setPopover] = useState<Popover>(null);
  const [hint, setHint] = useState<HintState>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  function openPopover(p: Popover) {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setHint(null);
    setPopover(p);
  }
  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setPopover(null), 120);
  }
  function showHint(e: MouseEvent<HTMLElement>, label: string) {
    const r = e.currentTarget.getBoundingClientRect();
    setHint({ label, y: r.top + r.height / 2 });
  }
  function hideHint() {
    setHint(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPopover(null);
        setHint(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimer.current) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, []);

  return (
    <>
      <div className="sidebar-rail-top">
        <button
          type="button"
          className="sidebar-icon-btn"
          aria-label={t("sidebar.expand")}
          onClick={toggleCollapsed}
          onMouseEnter={(e) => showHint(e, t("sidebar.expand"))}
          onMouseLeave={hideHint}
        >
          <SidebarExpand />
        </button>
        <button
          type="button"
          className={`sidebar-icon-btn${currentApp === "settings" ? " active" : ""}`}
          aria-label={t("sidebar.settings")}
          onClick={() => setCurrentApp("settings")}
          onFocus={() => preloadWorkspaceSurface("settings")}
          onMouseEnter={(e) => {
            preloadWorkspaceSurface("settings");
            showHint(e, t("sidebar.settings"));
          }}
          onMouseLeave={hideHint}
        >
          <SettingsIcon />
        </button>
      </div>

      <div className="sidebar-rail-apps">
        {SIDEBAR_APPS.filter((a) => a.id !== "settings").map((app) => {
          const Icon = APP_ICONS[app.id];
          // Wiki entry lights up for the wiki, notebooks, and reviews surfaces
          // since those three share the Wiki app shell via tabs.
          const isActive =
            app.id === "wiki"
              ? currentApp === "wiki" ||
                currentApp === "notebooks" ||
                currentApp === "reviews"
              : currentApp === app.id;
          const appName = t(`app.${app.id}` as I18nKey);
          return (
            <button
              key={app.id}
              type="button"
              className={`sidebar-icon-btn${isActive ? " active" : ""}`}
              aria-label={appName}
              onClick={() => {
                setCurrentApp(app.id);
              }}
              onFocus={() => preloadWorkspaceSurface(app.id)}
              onMouseEnter={(e) => {
                preloadWorkspaceSurface(app.id);
                showHint(e, appName);
              }}
              onMouseLeave={hideHint}
            >
              {Icon ? (
                <Icon />
              ) : (
                <span className="sidebar-item-emoji">{app.icon}</span>
              )}
            </button>
          );
        })}
      </div>

      <UsageRail
        onEnter={() => openPopover("usage")}
        onLeave={scheduleClose}
        active={popover === "usage"}
      />
      <ProfileRail
        onOpen={() => {
          setSettingsSection("profile");
          setCurrentApp("settings");
        }}
      />

      {popover
        ? createPortal(
            <div
              ref={popoverRef}
              className={`sidebar-rail-popover sidebar-rail-popover-${popover}`}
              role="dialog"
              onMouseEnter={() => openPopover(popover)}
              onMouseLeave={scheduleClose}
            >
              <div className="sidebar-rail-popover-title">
                {t("sidebar.usage")}
              </div>
              <div className="sidebar-rail-popover-body">
                {popover === "usage" && <UsageBody />}
              </div>
            </div>,
            document.body,
          )
        : null}

      {hint
        ? createPortal(
            <div
              className="sidebar-rail-hint"
              style={{ top: hint.y }}
              role="tooltip"
            >
              {hint.label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function UsageRail({
  onEnter,
  onLeave,
  active,
}: {
  onEnter: () => void;
  onLeave: () => void;
  active: boolean;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={`sidebar-rail-bottom${active ? " is-open" : ""}`}
      aria-label={t("sidebar.usage")}
      aria-haspopup="dialog"
      aria-expanded={active}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      title={t("sidebar.usage")}
    >
      <Activity className="sidebar-rail-usage-icon" />
    </button>
  );
}

function ProfileRail({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const { data } = useQuery({
    queryKey: ["auth-session"],
    queryFn: () => getAuthSession(),
    staleTime: 30_000,
  });
  const user = data?.user;
  const name = (user?.name || user?.email || t("settings.section.profile")).trim();
  const avatarID = normalizeProfileAvatarId(user?.avatar_id);
  return (
    <button
      type="button"
      className="sidebar-rail-bottom sidebar-rail-profile"
      aria-label={name}
      title={name}
      onClick={onOpen}
    >
      <PixelAvatar slug={avatarID} size={24} />
    </button>
  );
}

function UsageBody() {
  const { t } = useI18n();
  const { data: usage } = useQuery({
    queryKey: ["usage"],
    queryFn: () => getUsage(),
    refetchInterval: 5000,
  });
  const { data: availability } = useQuery({
    queryKey: ["model-availability"],
    queryFn: () => getModelAvailability(),
    staleTime: 30_000,
  });
  const cliTokens =
    usage?.personal_cli?.total_tokens ?? usage?.session?.total_tokens ?? 0;
  const lafLocked = availability?.laf_model?.available === false;
  const lafPercent =
    usage?.laf_ai?.limit_percent ?? usage?.laf_ai?.percent ?? null;
  const lafLabel = !availability
    ? "-"
    : lafLocked
      ? t("sidebar.usageLocked")
      : typeof lafPercent === "number"
        ? `${Math.max(0, Math.min(100, lafPercent)).toFixed(0)}%`
        : t("sidebar.usageAvailable");
  return (
    <div className="sidebar-rail-usage-panel">
      <div className="usage-compact-line">
        <span>{t("sidebar.usagePersonalCli")}</span>
        <strong>{formatTokens(cliTokens)} tokens</strong>
      </div>
      <div className="usage-compact-line">
        <span>{t("sidebar.usageLafAi")}</span>
        <strong>{lafLabel}</strong>
      </div>
    </div>
  );
}
