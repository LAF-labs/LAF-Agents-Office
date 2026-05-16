import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ModelMode } from "../api/client";
import { ModelModeToggle } from "./ModelModeToggle";

const apiMocks = vi.hoisted(() => ({
  getModelAvailability: vi.fn(),
}));

vi.mock("../api/client", () => apiMocks);

function renderToggle(initialMode: ModelMode = "record_only") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  function Harness() {
    const [mode, setMode] = useState<ModelMode>(initialMode);
    return <ModelModeToggle value={mode} onChange={setMode} />;
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe("ModelModeToggle", () => {
  it("renders CLI and LAF only when a local CLI is detected", async () => {
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["record_only"],
      default_mode: "record_only",
      laf_model: { available: false, reason: "paid workspace required" },
      local_cli: { available: true, runtimes: ["codex"] },
      my_bridge: { available: false, reason: "bridge required" },
      record_only: { available: true },
      team_bridge: { available: false, reason: "runner required" },
    });

    renderToggle();

    expect(await screen.findByText("CLI")).toBeInTheDocument();
    expect(screen.getByText("LAF")).toBeInTheDocument();
    expect(screen.queryByText("Record")).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "LAF model mode" }),
    ).not.toBeDisabled();
    await waitFor(() =>
      expect(screen.getByText("Codex CLI를 사용합니다.")).toBeInTheDocument(),
    );
  });

  it("names Claude Code when that CLI is detected", async () => {
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["record_only"],
      default_mode: "record_only",
      laf_model: { available: false, reason: "paid workspace required" },
      local_cli: { available: true, runtimes: ["claude-code"] },
      my_bridge: { available: false, reason: "bridge required" },
      record_only: { available: true },
      team_bridge: { available: false, reason: "runner required" },
    });

    renderToggle();

    await waitFor(() =>
      expect(
        screen.getByText("Claude Code CLI를 사용합니다."),
      ).toBeInTheDocument(),
    );
  });

  it("uses the LAF hover title when LAF is active", async () => {
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["laf_model", "record_only"],
      default_mode: "laf_model",
      laf_model: { available: true },
      local_cli: { available: true, runtimes: ["codex"] },
      my_bridge: { available: false, reason: "bridge required" },
      record_only: { available: true },
      team_bridge: { available: false, reason: "runner required" },
    });

    renderToggle("laf_model");

    await screen.findByText("LAF");
    await waitFor(() =>
      expect(screen.getByText("LAF 모델을 사용합니다.")).toBeInTheDocument(),
    );
  });

  it("disables the switch with install guidance when neither mode is available", async () => {
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["record_only"],
      default_mode: "record_only",
      laf_model: { available: false, reason: "paid workspace required" },
      local_cli: { available: false, reason: "local CLI not detected" },
      my_bridge: { available: false, reason: "bridge required" },
      record_only: { available: true },
      team_bridge: { available: false, reason: "runner required" },
    });

    renderToggle();

    const input = await screen.findByRole("checkbox", {
      name: "LAF model mode",
    });
    await waitFor(() => expect(input).toBeDisabled());
    expect(
      screen.getByText(
        "CLI가 감지되지 않습니다. Codex/Claude Code CLI를 설치하거나 팀 플랜을 업그레이드해 LAF 모델을 활성화해주세요.",
      ),
    ).toBeInTheDocument();
  });
});
