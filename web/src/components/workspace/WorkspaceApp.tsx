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
import {
  loadArtifactsApp,
  loadCitedAnswer,
  loadGrowthCenterApp,
  loadHomeApp,
  loadNotebook,
  loadReceiptsApp,
  loadRequestsApp,
  loadReviewQueueKanban,
  loadSettingsApp,
  loadSkillsApp,
  loadTasksApp,
  loadThreadsApp,
  loadWiki,
} from "../../lib/workspacePreload";
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
import "../../styles/home.css";
import "../../styles/layout.css";
import "../../styles/messages.css";
import "../../styles/search.css";
import "../../styles/wiki-shell.css";
import "../../styles/kbd.css";

type PanelComponent =
  | ComponentType<Record<string, never>>
  | LazyExoticComponent<ComponentType<Record<string, never>>>;

const ArtifactsApp = lazy(loadArtifactsApp);
const ReceiptsApp = lazy(loadReceiptsApp);
const RequestsApp = lazy(loadRequestsApp);
const SettingsApp = lazy(loadSettingsApp);
const SkillsApp = lazy(loadSkillsApp);
const GrowthCenterApp = lazy(loadGrowthCenterApp);
const TasksApp = lazy(loadTasksApp);
const ThreadsApp = lazy(loadThreadsApp);
const CitedAnswer = lazy(loadCitedAnswer);
const HomeApp = lazy(loadHomeApp);
const Notebook = lazy(loadNotebook);
const ReviewQueueKanban = lazy(loadReviewQueueKanban);
const Wiki = lazy(loadWiki);

interface WorkspaceAppProps {
  userEmail?: string;
  onLoggedOut: () => void;
}

function WorkspaceLoadingFallback() {
  return (
    <div
      className="workspace-route-skeleton"
      role="status"
      aria-label="Loading workspace view"
      aria-busy="true"
    >
      <div className="workspace-route-skeleton-header">
        <span />
        <span />
      </div>
      <div className="workspace-route-skeleton-row">
        <span />
        <span />
        <span />
      </div>
      <div className="workspace-route-skeleton-board">
        <span />
        <span />
        <span />
      </div>
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
      home: HomeApp,
      tasks: TasksApp,
      growth: GrowthCenterApp,
      requests: RequestsApp,
      skills: SkillsApp,
      activity: ArtifactsApp,
      receipts: ReceiptsApp,
      settings: SettingsApp,
      threads: ThreadsApp,
    };
    const Panel = panels[currentApp];
    return (
      <div
        className={`app-panel active${currentApp === "home" ? " home-panel" : ""}`}
      >
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
