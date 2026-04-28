import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { Sidebar } from "./Sidebar";

vi.mock("../sidebar/AppList", () => ({
  AppList: () => <div data-testid="workspace-nav" />,
}));

vi.mock("../sidebar/AgentList", () => ({
  AgentList: () => <div data-testid="team-nav" />,
}));

vi.mock("../sidebar/ChannelList", () => ({
  ChannelList: () => <div data-testid="channel-nav" />,
}));

vi.mock("../sidebar/UsagePanel", () => ({
  UsagePanel: () => <div data-testid="usage-panel" />,
}));

vi.mock("../sidebar/WorkspaceSummary", () => ({
  WorkspaceSummary: () => <div data-testid="workspace-summary" />,
}));

describe("Sidebar navigation hierarchy", () => {
  beforeEach(() => {
    useAppStore.setState({
      currentApp: null,
      language: "ko",
      sidebarAgentsOpen: true,
      sidebarCollapsed: false,
    });
  });

  it("puts the project workspace navigation before team and channel context", () => {
    const { container } = render(<Sidebar />);

    expect(screen.getByText("워크스페이스")).toBeInTheDocument();
    expect(screen.queryByText("앱")).not.toBeInTheDocument();

    const text = container.textContent ?? "";
    expect(text.indexOf("워크스페이스")).toBeLessThan(text.indexOf("팀"));
    expect(text.indexOf("팀")).toBeLessThan(text.indexOf("채널"));
    expect(screen.getByTestId("workspace-nav")).toBeInTheDocument();
  });
});
