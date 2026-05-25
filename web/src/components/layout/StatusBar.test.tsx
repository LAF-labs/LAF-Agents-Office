import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { StatusBar } from "./StatusBar";

vi.mock("../../hooks/useMembers", () => ({
  useOfficeMembers: () => ({ data: [] }),
}));

vi.mock("../../api/client", () => ({
  getHealth: vi.fn().mockResolvedValue({ status: "ok" }),
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
      currentApp: "growth",
      currentChannel: "general",
      language: "ko",
    });
  });

  it("shows the localized app name instead of the internal route id", () => {
    renderStatusBar();

    expect(screen.getByText("스타트업 오피스")).toBeInTheDocument();
    expect(screen.queryByText("tasks")).not.toBeInTheDocument();
  });

  it("does not show connection state in the hosted status bar", () => {
    renderStatusBar();

    expect(screen.queryByText("연결 끊김")).not.toBeInTheDocument();
  });
});
