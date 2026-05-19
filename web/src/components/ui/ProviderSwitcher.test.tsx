import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { openProviderSwitcher, ProviderSwitcherHost } from "./ProviderSwitcher";

const apiMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}));

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return {
    ...actual,
    getConfig: apiMocks.getConfig,
    updateConfig: apiMocks.updateConfig,
  };
});

function renderProviderSwitcher() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProviderSwitcherHost />
    </QueryClientProvider>,
  );
}

describe("ProviderSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getConfig.mockResolvedValue({ llm_provider: "claude-code" });
    apiMocks.updateConfig.mockResolvedValue({ status: "ok" });
  });

  it("presents provider choice as hosted Bridge execution configuration", async () => {
    renderProviderSwitcher();

    act(() => openProviderSwitcher());

    expect(
      await screen.findByRole("heading", { name: "Default Bridge provider" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Claude Code CLI through LAF Bridge"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Codex CLI through LAF Bridge"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Runtime provider")).not.toBeInTheDocument();
    expect(screen.queryByText("런타임 제공자 전환")).not.toBeInTheDocument();
  });
});
