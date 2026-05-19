import type { Project } from "../../../api/client";
import type { I18nKey } from "../../../lib/i18n";
import { cn } from "../../../lib/utils";

type TranslationFn = (key: I18nKey) => string;
type BridgeSignal = {
  labelKey: I18nKey;
  state: string;
};

export function ProjectBridgeWorkspacePanel({
  bridgeSignal,
  project,
  t,
}: {
  bridgeSignal: BridgeSignal;
  project: Project;
  t: TranslationFn;
}) {
  const bridgeConnected = bridgeSignal.state === "connected";
  const workspaceStatusLabel =
    bridgeSignal.state === "loading"
      ? t("tasks.bridgeWorkspaceChecking")
      : bridgeConnected
        ? t("tasks.bridgeWorkspaceBridgeReady")
        : t("tasks.bridgeWorkspaceBridgeWaiting");
  const checkoutLabel = project.github_repo_url?.trim()
    ? t("tasks.bridgeWorkspaceAutoTitle")
    : t("tasks.bridgeWorkspaceRepoNeeded");

  return (
    <div className="project-bridge-inline">
      <div className="project-bridge-inline-main">
        <div className="project-bridge-inline-label">
          <strong>{t("tasks.bridgeWorkspaceTitle")}</strong>
          <small>{t("tasks.bridgeWorkspaceDesc")}</small>
        </div>
        <div className="project-bridge-inline-controls">
          <span className="project-workspace-badge">{checkoutLabel}</span>
          <span
            className={cn(
              "project-workspace-status",
              bridgeConnected ? "is-ready" : "is-waiting",
            )}
          >
            {workspaceStatusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
