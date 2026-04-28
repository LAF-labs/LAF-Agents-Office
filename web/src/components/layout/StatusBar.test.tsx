import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { StatusBar } from "./StatusBar";

vi.mock("../../hooks/useMembers", () => ({
  useOfficeMembers: () => ({ data: [] }),
}));

vi.mock("../../api/client", () => ({
  getHealth: vi.fn(),
}));

function renderStatusBar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StatusBar />
    </QueryClientProvider>,
  );
}

describe("StatusBar", () => {
  beforeEach(() => {
    useAppStore.setState({
      brokerConnected: false,
      channelMeta: {},
      currentApp: "tasks",
      currentChannel: "general",
      language: "ko",
    });
  });

  it("shows the localized app name instead of the internal route id", () => {
    renderStatusBar();

    expect(screen.getByText("프로젝트")).toBeInTheDocument();
    expect(screen.queryByText("tasks")).not.toBeInTheDocument();
  });
});
