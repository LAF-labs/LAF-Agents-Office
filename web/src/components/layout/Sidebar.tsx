import { Settings as SettingsIcon, SidebarCollapse } from "iconoir-react";

import { useI18n } from "../../lib/i18n";
import { useAppStore } from "../../stores/app";
import { AppList } from "../sidebar/AppList";
import { UsagePanel } from "../sidebar/UsagePanel";
import { UserProfileFooter } from "../sidebar/UserProfileFooter";
import { CollapsedSidebar } from "./CollapsedSidebar";

export function Sidebar() {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useAppStore((s) => s.toggleSidebarCollapsed);
  const currentApp = useAppStore((s) => s.currentApp);
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const { t } = useI18n();

  return (
    <aside className={`sidebar${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      {sidebarCollapsed ? (
        <CollapsedSidebar />
      ) : (
        <>
          <div className="sidebar-header">
            <span className="sidebar-logo">LAF-Office</span>
            <div className="sidebar-header-actions">
              <button
                type="button"
                className="sidebar-icon-btn"
                aria-label={t("sidebar.collapse")}
                title={t("sidebar.collapse")}
                onClick={toggleSidebarCollapsed}
              >
                <SidebarCollapse />
              </button>
              <button
                type="button"
                className={`sidebar-icon-btn${currentApp === "settings" ? " active" : ""}`}
                aria-label={t("sidebar.openSettings")}
                title={t("sidebar.settings")}
                onClick={() => setCurrentApp("settings")}
              >
                <SettingsIcon />
              </button>
            </div>
          </div>

          <div className="sidebar-section">
            <p className="sidebar-section-title">{t("sidebar.workspace")}</p>
          </div>
          <AppList />
          <UsagePanel />
          <div className="sidebar-footer-divider" aria-hidden="true" />
          <UserProfileFooter />
        </>
      )}
    </aside>
  );
}
