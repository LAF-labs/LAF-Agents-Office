import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { __test__, SettingsApp } from "./SettingsApp";

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

function renderSettingsApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsApp />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getConfig.mockResolvedValue({
    max_concurrent_agents: 4,
    team_lead_slug: "pm",
  });
  apiMocks.updateConfig.mockResolvedValue({ status: "ok" });
  useAppStore.setState({
    language: "en",
    settingsSection: null,
  });
});

describe("SettingsApp cloud office settings", () => {
  it("does not expose obsolete execution setup sections", () => {
    const sections = __test__
      .visibleSectionGroups()
      .flatMap((group) => group.items.map((item) => item.id));

    expect(sections).toContain("keys");
    expect(sections).toContain("danger");
  });

  it("hides obsolete execution defaults in general settings", async () => {
    renderSettingsApp();

    await screen.findByRole("button", { name: "Save general settings" });

    expect(screen.queryByText("Runtime")).not.toBeInTheDocument();
    expect(screen.queryByText("LLM Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Defaults")).not.toBeInTheDocument();
    expect(screen.queryByText("Output Format")).not.toBeInTheDocument();
    expect(screen.queryByText("Timeout (ms)")).not.toBeInTheDocument();
    expect(screen.queryByText("laf-office shred")).not.toBeInTheDocument();
  });

  it("saves general settings without obsolete execution defaults", async () => {
    const user = userEvent.setup();

    renderSettingsApp();

    await user.click(
      await screen.findByRole("button", { name: "Save general settings" }),
    );

    await waitFor(() => expect(apiMocks.updateConfig).toHaveBeenCalled());
    const { calls } = apiMocks.updateConfig.mock;
    const patch = calls[calls.length - 1]?.[0];
    expect(patch).toEqual({
      max_concurrent_agents: 4,
      team_lead_slug: "pm",
    });
    expect(patch).not.toHaveProperty("default_format");
    expect(patch).not.toHaveProperty("default_timeout");
    expect(patch).not.toHaveProperty("dev_url");
    expect(patch).not.toHaveProperty("llm_provider");
    expect(patch).not.toHaveProperty("memory_backend");
  });
});
