import {
  type ComponentType,
  type LazyExoticComponent,
  lazy,
  Suspense,
  useState,
} from "react";

import { logout } from "../../api/client";
import { useBrokerEvents } from "../../hooks/useBrokerEvents";
import { useHashRouter } from "../../hooks/useHashRouter";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { isDMChannel, useAppStore } from "../../stores/app";
import { Shell } from "../layout/Shell";
import { Composer } from "../messages/Composer";
import { DMView } from "../messages/DMView";
import { InterviewBar } from "../messages/InterviewBar";
import { MessageFeed } from "../messages/MessageFeed";
import { TypingIndicator } from "../messages/TypingIndicator";
import { ConfirmHost } from "../ui/ConfirmDialog";
import { ProviderSwitcherHost } from "../ui/ProviderSwitcher";
import { ToastContainer } from "../ui/Toast";
import type { WikiTab } from "../wiki/WikiTabs";
import WikiTabs from "../wiki/WikiTabs";
import "../../styles/agents.css";
import "../../styles/layout.css";
import "../../styles/messages.css";
import "../../styles/search.css";
import "../../styles/wiki-shell.css";
import "../../styles/kbd.css";

type PanelComponent =
  | ComponentType<Record<string, never>>
  | LazyExoticComponent<ComponentType<Record<string, never>>>;

const ArtifactsApp = lazy(() =>
  import("../apps/ArtifactsApp").then((module) => ({
    default: module.ArtifactsApp,
  })),
);
const ReceiptsApp = lazy(() =>
  import("../apps/ReceiptsApp").then((module) => ({
    default: module.ReceiptsApp,
  })),
);
const RequestsApp = lazy(() =>
  import("../apps/RequestsApp").then((module) => ({
    default: module.RequestsApp,
  })),
);
const SettingsApp = lazy(() =>
  import("../apps/SettingsApp").then((module) => ({
    default: module.SettingsApp,
  })),
);
const SkillsApp = lazy(() =>
  import("../apps/SkillsApp").then((module) => ({
    default: module.SkillsApp,
  })),
);
const TasksApp = lazy(() =>
  import("../apps/TasksApp").then((module) => ({
    default: module.TasksApp,
  })),
);
const ThreadsApp = lazy(() =>
  import("../apps/ThreadsApp").then((module) => ({
    default: module.ThreadsApp,
  })),
);
const CitedAnswer = lazy(() => import("../wiki/CitedAnswer"));
const Notebook = lazy(() => import("../notebook/Notebook"));
const ReviewQueueKanban = lazy(() => import("../review/ReviewQueueKanban"));
const Wiki = lazy(() => import("../wiki/Wiki"));

interface WorkspaceAppProps {
  userEmail?: string;
  onLoggedOut: () => void;
}

function WorkspaceLoadingFallback() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-tertiary)",
        fontSize: 14,
      }}
    >
      Loading...
    </div>
  );
}

function MainContent() {
  const currentApp = useAppStore((s) => s.currentApp);
  const currentChannel = useAppStore((s) => s.currentChannel);
  const channelMeta = useAppStore((s) => s.channelMeta);
  const wikiPath = useAppStore((s) => s.wikiPath);
  const setWikiPath = useAppStore((s) => s.setWikiPath);
  const wikiLookupQuery = useAppStore((s) => s.wikiLookupQuery);
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const notebookAgentSlug = useAppStore((s) => s.notebookAgentSlug);
  const notebookEntrySlug = useAppStore((s) => s.notebookEntrySlug);
  const setNotebookRoute = useAppStore((s) => s.setNotebookRoute);
  const [articleRefreshNonce, setArticleRefreshNonce] = useState(0);

  if (!currentApp && isDMChannel(currentChannel, channelMeta)) {
    return <DMView />;
  }

  if (currentApp === "wiki-lookup") {
    return (
      <div className="wiki-shell">
        <WikiTabs
          current="wiki"
          onSelect={(tab) => {
            if (tab === "wiki") setCurrentApp("wiki");
            else if (tab === "notebooks") {
              setNotebookRoute(null, null);
              setCurrentApp("notebooks");
            } else setCurrentApp("reviews");
          }}
        />
        <div className="wiki-shell-body">
          <CitedAnswer query={wikiLookupQuery || ""} />
        </div>
      </div>
    );
  }

  if (
    currentApp === "wiki" ||
    currentApp === "notebooks" ||
    currentApp === "reviews"
  ) {
    const handleTabChange = (tab: WikiTab) => {
      if (tab === "wiki") {
        setCurrentApp("wiki");
      } else if (tab === "notebooks") {
        setNotebookRoute(null, null);
        setCurrentApp("notebooks");
      } else {
        setCurrentApp("reviews");
      }
    };
    const pamArticlePath = currentApp === "wiki" ? (wikiPath ?? null) : null;

    return (
      <div className="wiki-shell">
        <WikiTabs
          current={currentApp}
          onSelect={handleTabChange}
          pamArticlePath={pamArticlePath}
          onPamActionDone={() => setArticleRefreshNonce((n) => n + 1)}
        />
        <div className="wiki-shell-body">
          {currentApp === "wiki" && (
            <Wiki
              articlePath={wikiPath}
              externalRefreshNonce={articleRefreshNonce}
              onNavigate={(path) => {
                if (path === null) {
                  setWikiPath(null);
                } else {
                  setWikiPath(path || null);
                }
              }}
            />
          )}
          {currentApp === "notebooks" && (
            <Notebook
              agentSlug={notebookAgentSlug}
              entrySlug={notebookEntrySlug}
              onOpenCatalog={() => setNotebookRoute(null, null)}
              onOpenAgent={(slug) => setNotebookRoute(slug, null)}
              onOpenEntry={(slug, entry) => setNotebookRoute(slug, entry)}
              onNavigateWiki={(path) => {
                setCurrentApp("wiki");
                setWikiPath(path || null);
              }}
            />
          )}
          {currentApp === "reviews" && <ReviewQueueKanban />}
        </div>
      </div>
    );
  }

  if (currentApp) {
    const panels: Record<string, PanelComponent> = {
      tasks: TasksApp,
      requests: RequestsApp,
      skills: SkillsApp,
      activity: ArtifactsApp,
      receipts: ReceiptsApp,
      settings: SettingsApp,
      threads: ThreadsApp,
    };
    const Panel = panels[currentApp];
    return (
      <div className="app-panel active">
        {Panel ? (
          <Panel />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "var(--text-tertiary)",
              fontSize: 14,
            }}
          >
            Unknown app: {currentApp}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <MessageFeed />
      <TypingIndicator />
      <InterviewBar />
      <Composer />
    </>
  );
}

export default function WorkspaceApp({
  userEmail,
  onLoggedOut,
}: WorkspaceAppProps) {
  const resetForOnboarding = useAppStore((s) => s.resetForOnboarding);
  useKeyboardShortcuts();
  useHashRouter();
  useBrokerEvents(true);

  return (
    <>
      <Shell
        userEmail={userEmail}
        onLogout={async () => {
          await logout().catch(() => undefined);
          resetForOnboarding();
          onLoggedOut();
        }}
      >
        <Suspense fallback={<WorkspaceLoadingFallback />}>
          <MainContent />
        </Suspense>
      </Shell>
      <ToastContainer />
      <ConfirmHost />
      <ProviderSwitcherHost />
    </>
  );
}
