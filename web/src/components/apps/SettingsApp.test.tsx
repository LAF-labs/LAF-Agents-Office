import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { __test__, SettingsApp } from "./SettingsApp";

const apiMocks = vi.hoisted(() => ({
  getBridgeAvailability: vi.fn(),
  getConfig: vi.fn(),
  isLocalhostRuntime: vi.fn(),
  startBridgePairing: vi.fn(),
  updateConfig: vi.fn(),
}));
const MALICIOUS_PAIR_API_FLAG = "--api-url";
const MALICIOUS_PAIR_CODE_FLAG = "--code";
const MALICIOUS_RAW_CODE = ["RAW", "CODE"].join("-");
const MALICIOUS_START_COMMAND = ["laf-bridge", "start"].join(" ");
const MALICIOUS_STATUS_COMMAND = ["laf-bridge", "status"].join(" ");
const PUBLIC_PAIR_COMMAND = "npx laf-bridge pair";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return {
    ...actual,
    getBridgeAvailability: apiMocks.getBridgeAvailability,
    getConfig: apiMocks.getConfig,
    isLocalhostRuntime: apiMocks.isLocalhostRuntime,
    startBridgePairing: apiMocks.startBridgePairing,
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

function resetSettingsAppBridgeMocks() {
  vi.clearAllMocks();
  apiMocks.isLocalhostRuntime.mockReturnValue(false);
  apiMocks.getConfig.mockResolvedValue({
    default_format: "text",
    llm_provider: "codex",
    max_concurrent_agents: 4,
    team_lead_slug: "pm",
  });
  apiMocks.updateConfig.mockResolvedValue({ status: "ok" });
  apiMocks.getBridgeAvailability.mockResolvedValue({
    devices: [
      {
        capabilities: {
          cli_details: {
            "claude-code": { detected: true },
            opencode: { detected: true },
          },
          provider_runtimes: ["codex", "opencode"],
        },
        device_kind: "desktop",
        device_label: "MacBook",
        id: "device-1",
        last_seen_at: "2030-01-01T00:00:00Z",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    my_bridge: {
      available: true,
      default_device_id: "device-1",
      device_count: 1,
      online_device_count: 1,
      runtimes: ["codex", "claude-code"],
    },
  });
  apiMocks.startBridgePairing.mockResolvedValue({
    api_url: "https://office.example/api",
    commands: {
      pair: [
        PUBLIC_PAIR_COMMAND,
        MALICIOUS_PAIR_API_FLAG,
        "https://office.example/api",
        MALICIOUS_PAIR_CODE_FLAG,
        "SECRET",
      ].join(" "),
      setup: [
        PUBLIC_PAIR_COMMAND,
        MALICIOUS_PAIR_CODE_FLAG,
        MALICIOUS_RAW_CODE,
      ].join(" "),
      start: MALICIOUS_START_COMMAND,
      status: MALICIOUS_STATUS_COMMAND,
    },
    pairing: {
      code: MALICIOUS_RAW_CODE,
      expires_at: "2030-01-01T00:00:00Z",
      setup_code: "SETUP-CODE",
      team_id: "team-1",
    },
  });
  vi.stubGlobal("location", {
    hostname: "office.example",
    origin: "https://office.example",
  });
  useAppStore.setState({
    language: "en",
    settingsSection: null,
  });
}

beforeEach(resetSettingsAppBridgeMocks);

describe("SettingsApp Bridge pair command", () => {
  it("uses npx as the LAF Bridge pairing entrypoint", () => {
    expect(__test__.BRIDGE_PAIR_COMMAND_PREFIX).toBe("npx laf-bridge pair");
    expect(__test__.BRIDGE_PAIR_COMMAND_PREFIX).toContain("laf-bridge");
    expect(__test__.BRIDGE_PAIR_COMMAND_PREFIX).not.toMatch(
      new RegExp(`${["laf", "runner"].join("-")}|\\.pkg|\\.msi|\\.exe`, "i"),
    );
  });

  it("never displays server-provided pairing flags in the Bridge pair command", () => {
    expect(
      __test__.visibleBridgePairCommand({
        api_url: "https://office.example/api",
        commands: {
          pair: [
            PUBLIC_PAIR_COMMAND,
            MALICIOUS_PAIR_API_FLAG,
            "https://office.example/api",
            MALICIOUS_PAIR_CODE_FLAG,
            "SECRET",
          ].join(" "),
        },
        pairing: {
          expires_at: "2030-01-01T00:00:00Z",
          setup_code: "SETUP",
          team_id: "team-1",
        },
      }),
    ).toBe("npx laf-bridge pair");
  });

  it("keeps local runtime reset and key settings out of hosted settings", () => {
    const hostedSections = __test__
      .visibleSectionGroupsForRuntime(false)
      .flatMap((group) => group.items.map((item) => item.id));

    expect(hostedSections).toContain("bridge");
    expect(hostedSections).not.toContain("danger");
    expect(hostedSections).not.toContain("keys");
  });

  it("keeps local runtime tooling available on localhost", () => {
    const localSections = __test__
      .visibleSectionGroupsForRuntime(true)
      .flatMap((group) => group.items.map((item) => item.id));

    expect(localSections).toContain("bridge");
    expect(localSections).toContain("danger");
    expect(localSections).toContain("keys");
  });

  it("hides local runtime defaults in hosted general settings", async () => {
    renderSettingsApp();

    await screen.findByRole("button", { name: "Save general settings" });

    expect(screen.queryByText("Runtime")).not.toBeInTheDocument();
    expect(screen.queryByText("LLM Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Defaults")).not.toBeInTheDocument();
    expect(screen.queryByText("Output Format")).not.toBeInTheDocument();
    expect(screen.queryByText("Timeout (ms)")).not.toBeInTheDocument();
    expect(screen.queryByText("laf-office shred")).not.toBeInTheDocument();
  });

  it("saves hosted general settings without local runtime defaults", async () => {
    const user = userEvent.setup();

    renderSettingsApp();

    await user.click(
      await screen.findByRole("button", { name: "Save general settings" }),
    );

    await waitFor(() => expect(apiMocks.updateConfig).toHaveBeenCalled());
    const {
      mock: { calls },
    } = apiMocks.updateConfig;
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

describe("SettingsApp bridge status and pairing UI", () => {
  it("renders detected Codex and Claude CLI checks in the Bridge section", async () => {
    const user = userEvent.setup();

    renderSettingsApp();

    await user.click(await screen.findByRole("button", { name: "LAF Bridge" }));

    expect(
      await screen.findByText("Provider runtime found:"),
    ).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.queryByText("OpenCode")).not.toBeInTheDocument();
  });

  it("renders hosted Bridge setup steps as direct ordered-list items before pairing", async () => {
    const user = userEvent.setup();
    apiMocks.getBridgeAvailability.mockResolvedValue({
      devices: [],
      my_bridge: {
        available: false,
        device_count: 0,
        online_device_count: 0,
        reason: "no paired LAF Bridge detected",
        runtimes: [],
      },
    });

    renderSettingsApp();

    await user.click(await screen.findByRole("button", { name: "LAF Bridge" }));

    const firstStep = await screen.findByText(
      "Open a terminal app. On macOS use Terminal, on Windows use PowerShell, and on Linux use your terminal.",
    );
    expect(firstStep.closest("li")?.parentElement?.tagName).toBe("OL");
    expect(
      screen
        .getByText(
          "Click Create setup code here. If the command is not copied automatically, click Copy command.",
        )
        .closest("li")?.parentElement?.tagName,
    ).toBe("OL");
    expect(
      screen
        .getByText(
          "Paste the command and press Enter, then paste the setup code when LAF Bridge asks for it.",
        )
        .closest("li")?.parentElement?.tagName,
    ).toBe("OL");
    expect(
      screen
        .getByText(
          "Come back to this page. When the status says LAF Bridge online, setup is done.",
        )
        .closest("li")?.parentElement?.tagName,
    ).toBe("OL");
  });

  it("shows only the public npx command and setup code after creating Bridge pairing", async () => {
    const user = userEvent.setup();
    apiMocks.getBridgeAvailability.mockResolvedValue({
      devices: [],
      my_bridge: {
        available: false,
        device_count: 0,
        online_device_count: 0,
        reason: "no paired LAF Bridge detected",
        runtimes: [],
      },
    });

    renderSettingsApp();

    await user.click(await screen.findByRole("button", { name: "LAF Bridge" }));
    await user.click(
      await screen.findByRole("button", { name: "Create setup code" }),
    );

    const setupCode = await screen.findByText("SETUP-CODE");
    const pairCommand = screen.getByText("npx laf-bridge pair");
    expect(pairCommand).toBeInTheDocument();
    expect(
      pairCommand.compareDocumentPosition(setupCode) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByText(
        new RegExp(
          [MALICIOUS_PAIR_API_FLAG, MALICIOUS_PAIR_CODE_FLAG, "SECRET"]
            .map(escapeRegExp)
            .join("|"),
        ),
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        new RegExp(
          [
            MALICIOUS_RAW_CODE,
            MALICIOUS_START_COMMAND,
            MALICIOUS_STATUS_COMMAND,
          ]
            .map(escapeRegExp)
            .join("|"),
        ),
      ),
    ).not.toBeInTheDocument();
    expect(apiMocks.startBridgePairing).toHaveBeenCalledWith({
      api_url: "https://office.example/api",
    });
  });

  it("shows only supported Codex and Claude Bridge runtime checks", () => {
    expect(
      __test__.bridgeRuntimeLabels(
        {
          device_kind: "desktop",
          device_label: "MacBook",
          id: "device-1",
          status: "online",
          team_id: "team-1",
          user_id: "user-1",
          capabilities: {
            cli_details: {
              "claude-code": { detected: true },
              opencode: { detected: true },
            },
            provider_runtimes: ["codex", "opencode"],
          },
        },
        undefined,
      ),
    ).toEqual(["Codex", "Claude Code"]);
    expect(
      __test__.bridgeRuntimeLabels(
        {
          device_kind: "desktop",
          device_label: "MacBook",
          id: "device-1",
          status: "online",
          team_id: "team-1",
          user_id: "user-1",
          capabilities: { provider_runtimes: ["opencode"] },
        },
        {
          available: true,
          device_count: 1,
          online_device_count: 1,
          runtimes: ["claude"],
        },
      ),
    ).toEqual(["Claude Code"]);
  });

  it("fills every agent model surface with team defaults", () => {
    expect(__test__.normalizeAgentModelDefaults({})).toEqual({
      claude: "sonnet",
      codex: "gpt-5.4",
      laf: "balanced",
    });
    expect(__test__.LAF_MODEL_OPTIONS).toHaveLength(5);
    expect(
      __test__.CODEX_MODEL_OPTIONS.map((option) => option.value),
    ).toContain("gpt-5.4");
  });
});
