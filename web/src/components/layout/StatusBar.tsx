import { useQuery } from "@tanstack/react-query";
import { Settings } from "iconoir-react";

import { getHealth } from "../../api/client";
import { useOfficeMembers } from "../../hooks/useMembers";
import { type I18nKey, useI18n } from "../../lib/i18n";
import { type ChannelMeta, isDMChannel, useAppStore } from "../../stores/app";
import { Kbd } from "../ui/Kbd";

interface HealthSnapshot {
  status: string;
  provider?: string;
  provider_model?: string;
  agents?: Record<string, unknown>;
}

const STATUS_APP_TITLE_KEYS: Record<string, I18nKey> = {
  growth: "app.growth",
  wiki: "app.wiki",
  requests: "app.requests",
  skills: "app.skills",
  activity: "app.activity",
  receipts: "app.receipts",
  settings: "app.settings",
  threads: "app.threads",
};

type TranslationFn = (key: I18nKey) => string;

function statusChannelLabel({
  channelMeta,
  currentApp,
  currentChannel,
  t,
}: {
  channelMeta: Record<string, ChannelMeta>;
  currentApp: string | null;
  currentChannel: string;
  t: TranslationFn;
}) {
  if (currentApp) {
    return STATUS_APP_TITLE_KEYS[currentApp]
      ? t(STATUS_APP_TITLE_KEYS[currentApp])
      : currentApp;
  }
  const dm = isDMChannel(currentChannel, channelMeta);
  return dm ? `@${dm.agentSlug}` : `# ${currentChannel}`;
}

function statusModeLabel({
  channelMeta,
  currentApp,
  currentChannel,
  t,
}: {
  channelMeta: Record<string, ChannelMeta>;
  currentApp: string | null;
  currentChannel: string;
  t: TranslationFn;
}) {
  if (currentApp) return t("status.office");
  return isDMChannel(currentChannel, channelMeta) ? "1:1" : t("status.office");
}

function AIProviderStatus({
  provider,
  providerModel,
  t,
}: {
  provider?: string;
  providerModel?: string;
  t: TranslationFn;
}) {
  if (!provider) return null;
  const title = providerModel
    ? `${t("status.aiProvider")}: ${provider} · ${providerModel}`
    : `${t("status.aiProvider")}: ${provider}`;

  return (
    <span className="status-bar-item" title={title}>
      <Settings
        aria-hidden={true}
        className="status-bar-icon"
        width={12}
        height={12}
        strokeWidth={1.85}
      />
      {provider}
      {providerModel ? (
        <>
          <span className="status-bar-sep"> · </span>
          <span className="status-bar-model">{providerModel}</span>
        </>
      ) : null}
    </span>
  );
}

/**
 * Bottom status bar showing the active channel/app, mode, agent count, and AI
 * provider.
 */
export function StatusBar() {
  const currentChannel = useAppStore((s) => s.currentChannel);
  const currentApp = useAppStore((s) => s.currentApp);
  const channelMeta = useAppStore((s) => s.channelMeta);
  const setComposerHelpOpen = useAppStore((s) => s.setComposerHelpOpen);
  const { t } = useI18n();
  const { data: members = [] } = useOfficeMembers();

  const { data: health } = useQuery<HealthSnapshot>({
    queryKey: ["health"],
    queryFn: () => getHealth() as Promise<HealthSnapshot>,
    refetchInterval: 15_000,
  });

  const agentCount = members.filter(
    (m) =>
      m.slug && m.slug !== "human" && m.slug !== "you" && m.slug !== "system",
  ).length;

  const labelContext = { channelMeta, currentApp, currentChannel, t };
  const channelLabel = statusChannelLabel(labelContext);
  const modeLabel = statusModeLabel(labelContext);
  const provider = health?.provider;
  const providerModel = health?.provider_model?.trim();

  return (
    <div className="status-bar">
      <span className="status-bar-item">{channelLabel}</span>
      <span className="status-bar-item">{modeLabel}</span>
      <span className="status-bar-spacer" />
      <button
        type="button"
        className="status-bar-shortcut"
        onClick={() => setComposerHelpOpen(true)}
        title={t("status.openShortcuts")}
        aria-label={t("status.openShortcuts")}
      >
        <Kbd size="sm">?</Kbd>
        <span>{t("status.shortcuts")}</span>
      </button>
      <span className="status-bar-item">
        {agentCount} {agentCount === 1 ? t("status.agent") : t("status.agents")}
      </span>
      <AIProviderStatus
        provider={provider}
        providerModel={providerModel}
        t={t}
      />
    </div>
  );
}
