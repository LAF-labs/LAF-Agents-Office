import { describe, expect, it, vi } from "vitest";

import type { SlashCommand } from "../../hooks/useCommands";
import { __test__ } from "./SearchModal";

function deps(commands: SlashCommand[]) {
  return {
    query: "",
    channels: [],
    commands,
    members: [],
    workspaceHits: [],
    setCurrentApp: vi.fn(),
    setCurrentChannel: vi.fn(),
    setLastMessageId: vi.fn(),
    setSearchOpen: vi.fn(),
    enterDM: vi.fn(),
    setActiveAgentSlug: vi.fn(),
    setProjectFocusId: vi.fn(),
    setTaskFocusId: vi.fn(),
    setWikiPath: vi.fn(),
    close: vi.fn(),
  };
}

describe("SearchModal command palette", () => {
  it("builds command actions from the visible hosted command registry", () => {
    const items = __test__.buildCommandItems(
      deps([
        { name: "/ask", desc: "Ask the team lead", icon: "ask" },
        {
          name: "/provider",
          desc: "Switch default AI provider",
          icon: "provider",
        },
        { name: "/tasks", desc: "Open task board", icon: "tasks" },
      ]),
      "",
    );

    const labels = items.map((item) => item.label);
    expect(labels).toEqual(["/ask", "/provider", "/tasks"]);
    expect(labels).not.toContain("/deploy-simulation");
    expect(labels).not.toContain("/focus");
    expect(labels).not.toContain("/reset");
  });

  it("keeps workflow commands hidden unless the registry exposes them", () => {
    const hostedItems = __test__.buildCommandItems(
      deps([{ name: "/ask", desc: "Ask the team lead", icon: "ask" }]),
      "deploy",
    );
    expect(hostedItems.map((item) => item.label)).toEqual([]);

    const localItems = __test__.buildCommandItems(
      deps([
        { name: "/ask", desc: "Ask the team lead", icon: "ask" },
        {
          name: "/deploy-simulation",
          desc: "Deployment rehearsal workflow for Claude or Codex mode",
          icon: "deploy-simulation",
        },
      ]),
      "deploy",
    );
    expect(localItems.map((item) => item.label)).toEqual([
      "/deploy-simulation",
    ]);
  });
});
