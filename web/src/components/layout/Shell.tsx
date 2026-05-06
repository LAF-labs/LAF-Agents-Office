import { lazy, type ReactNode, Suspense } from "react";

import { isDMChannel, useAppStore } from "../../stores/app";
import { ChannelHeader } from "./ChannelHeader";
import { DisconnectBanner } from "./DisconnectBanner";
import { RuntimeStrip } from "./RuntimeStrip";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";

const AgentPanel = lazy(() =>
  import("../agents/AgentPanel").then((module) => ({
    default: module.AgentPanel,
  })),
);
const ThreadPanel = lazy(() =>
  import("../messages/ThreadPanel").then((module) => ({
    default: module.ThreadPanel,
  })),
);
const SearchModal = lazy(() =>
  import("../search/SearchModal").then((module) => ({
    default: module.SearchModal,
  })),
);
const HelpModalHost = lazy(() =>
  import("../ui/HelpModal").then((module) => ({
    default: module.HelpModalHost,
  })),
);

interface ShellProps {
  children: ReactNode;
  onLogout?: () => void;
  userEmail?: string;
}

export function Shell({ children, onLogout, userEmail }: ShellProps) {
  const currentChannel = useAppStore((s) => s.currentChannel);
  const currentApp = useAppStore((s) => s.currentApp);
  const channelMeta = useAppStore((s) => s.channelMeta);
  const activeAgentSlug = useAppStore((s) => s.activeAgentSlug);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const searchOpen = useAppStore((s) => s.searchOpen);
  const composerHelpOpen = useAppStore((s) => s.composerHelpOpen);
  const inDM = !currentApp && !!isDMChannel(currentChannel, channelMeta);

  const shellClassName = [
    "office",
    activeAgentSlug ? "agent-panel-open" : "",
    activeThreadId ? "thread-panel-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClassName}>
      <Sidebar />
      <main className="main">
        <DisconnectBanner />
        {!inDM && <ChannelHeader onLogout={onLogout} userEmail={userEmail} />}
        {!inDM && <RuntimeStrip />}
        {children}
        <StatusBar />
      </main>
      <Suspense fallback={null}>
        {activeThreadId ? <ThreadPanel /> : null}
        {activeAgentSlug ? <AgentPanel /> : null}
        {searchOpen ? <SearchModal /> : null}
        {composerHelpOpen ? <HelpModalHost /> : null}
      </Suspense>
    </div>
  );
}
