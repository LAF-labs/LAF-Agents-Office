import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { Sidebar } from "./Sidebar";

vi.mock("../sidebar/AppList", () => ({
  AppList: () => <div data-testid="workspace-nav" />,
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
      sidebarCollapsed: false,
    });
  });

  it("keeps project navigation as the only primary navigation surface", () => {
    const { container } = render(<Sidebar />);

    expect(screen.getByText("워크스페이스")).toBeInTheDocument();
    expect(screen.queryByText("앱")).not.toBeInTheDocument();
    expect(screen.getByTestId("workspace-nav")).toBeInTheDocument();
    expect(screen.queryByText("팀")).not.toBeInTheDocument();
    expect(screen.queryByText("채널")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("새 에이전트");
    expect(container.textContent).not.toContain("새 채널");
  });
});
