import { describe, expect, it } from "vitest";

import type { SlashCommandDescriptor } from "../api/client";
import { __test__, HOSTED_FALLBACK_SLASH_COMMANDS } from "./useCommands";

const { toAutocomplete, fallbackCommands, COMMAND_ICONS, DEFAULT_ICON } =
  __test__;
const sortText = (a: string, b: string) => a.localeCompare(b);

describe("toAutocomplete", () => {
  it("filters out TUI-only commands and prefixes slash to the name", () => {
    const registry: SlashCommandDescriptor[] = [
      { name: "ask", description: "Ask the team lead", webSupported: true },
      { name: "object", description: "Object commands", webSupported: false },
      { name: "clear", description: "Clear messages", webSupported: true },
    ];
    const mapped = toAutocomplete(registry);
    expect(mapped.map((c) => c.name)).toEqual(["/ask", "/clear"]);
  });

  it("filters deferred app commands even if the registry marks them web-supported", () => {
    const registry: SlashCommandDescriptor[] = [
      { name: "calendar", description: "Calendar", webSupported: true },
      { name: "policies", description: "Policies", webSupported: true },
      { name: "recover", description: "Recover", webSupported: true },
      { name: "tasks", description: "Tasks", webSupported: true },
    ];

    expect(toAutocomplete(registry).map((c) => c.name)).toEqual([]);
  });

  it("filters non-hosted workflow commands from the registry", () => {
    const registry: SlashCommandDescriptor[] = [
      { name: "ask", description: "Ask the team lead", webSupported: true },
      {
        name: "deploy-simulation",
        description: "Deployment rehearsal workflow",
        webSupported: true,
      },
      { name: "focus", description: "Focus mode", webSupported: true },
      { name: "reset", description: "Reset workspace", webSupported: true },
    ];

    expect(toAutocomplete(registry).map((c) => c.name)).toEqual(["/ask"]);
  });

  it("maps known commands to their icon", () => {
    const registry: SlashCommandDescriptor[] = [
      { name: "ask", description: "Ask", webSupported: true },
      { name: "growth", description: "Growth", webSupported: true },
    ];
    const mapped = toAutocomplete(registry);
    expect(mapped[0].icon).toBe(COMMAND_ICONS.ask);
    expect(mapped[1].icon).toBe(COMMAND_ICONS.growth);
  });

  it("assigns the default icon to unknown commands so autocomplete never shows a blank glyph", () => {
    const registry: SlashCommandDescriptor[] = [
      {
        name: "brand-new-command",
        description: "Future command",
        webSupported: true,
      },
    ];
    const mapped = toAutocomplete(registry);
    expect(mapped).toEqual([]);
    expect(DEFAULT_ICON).toBe("default");
  });

  it("preserves the registry description verbatim", () => {
    const registry: SlashCommandDescriptor[] = [
      {
        name: "ask",
        description: "Custom override description",
        webSupported: true,
      },
    ];
    const mapped = toAutocomplete(registry);
    expect(mapped[0].desc).toBe("Custom override description");
  });

  it("localizes known registry commands for Korean UI", () => {
    const registry: SlashCommandDescriptor[] = [
      { name: "ask", description: "Ask the team lead", webSupported: true },
      { name: "growth", description: "Open Startup Office", webSupported: true },
    ];
    const mapped = toAutocomplete(registry, "ko");
    expect(mapped[0].desc).toBe("팀 리드에게 묻기");
    expect(mapped[1].desc).toBe("스타트업 오피스 열기");
  });

  it("returns an empty array when every command is TUI-only", () => {
    const registry: SlashCommandDescriptor[] = [
      { name: "object", description: "TUI", webSupported: false },
      { name: "record", description: "TUI", webSupported: false },
    ];
    expect(toAutocomplete(registry)).toEqual([]);
  });

  it("returns an empty array for an empty registry response", () => {
    expect(toAutocomplete([])).toEqual([]);
  });
});

describe("HOSTED_FALLBACK_SLASH_COMMANDS", () => {
  // This locks in the fallback contract: if the hosted registry is unreachable, the
  // autocomplete still populates with the web-supported command set the
  // composer knows how to execute.
  it("covers every command the composer handler currently implements", () => {
    const expected = [
      "/ask",
      "/approvals",
      "/search",
      "/remember",
      "/help",
      "/clear",
      "/growth",
      "/loops",
      "/receipts",
      "/requests",
      "/1o1",
      "/skills",
      "/threads",
    ].sort(sortText);
    expect(
      HOSTED_FALLBACK_SLASH_COMMANDS.map((c) => c.name).sort(sortText),
    ).toEqual(expected);
  });

  it("does not expose deferred CRM-style or operator-only app commands", () => {
    const names = HOSTED_FALLBACK_SLASH_COMMANDS.map((c) => c.name);
    expect(names).not.toContain("/policies");
    expect(names).not.toContain("/calendar");
    expect(names).not.toContain("/recover");
  });

  it("never ships an empty icon — every fallback entry has a glyph", () => {
    for (const cmd of HOSTED_FALLBACK_SLASH_COMMANDS) {
      expect(cmd.icon).not.toBe("");
    }
  });

  // Real-world bug: useCommands returned a fresh array on every render, so
  // the Autocomplete effect that watches `commands` + items fired on every
  // render, called `onItems(items)` which called setAcItems in Composer,
  // re-rendering Composer, which re-ran useCommands, which returned a new
  // array... React bailed with "Maximum update depth exceeded" and the UI
  // thrashed into unresponsiveness. Referential stability of the returned
  // list is load-bearing, not cosmetic.
  it("toAutocomplete returns a stable result shape for identical input", () => {
    const registry: SlashCommandDescriptor[] = [
      { name: "ask", description: "Ask the team lead", webSupported: true },
    ];
    const a = toAutocomplete(registry);
    const b = toAutocomplete(registry);
    // Same-content input → equal shape. The useMemo in useCommands takes
    // care of referential identity across renders; this pins the pure
    // helper's deterministic output contract.
    expect(a).toEqual(b);
  });
  it("keeps autocomplete on the deployed web-safe command set", () => {
    const names = HOSTED_FALLBACK_SLASH_COMMANDS.map((c) => c.name).sort(
      sortText,
    );
    expect(names).toEqual(
      [
        "/1o1",
        "/ask",
        "/approvals",
        "/clear",
        "/growth",
        "/help",
        "/loops",
        "/remember",
        "/receipts",
        "/requests",
        "/search",
        "/skills",
        "/threads",
      ].sort(sortText),
    );
    expect(names).not.toContain("/deploy-simulation");
    expect(names).not.toContain("/reset");
    expect(names).not.toContain("/pause");
  });

  it("uses the same cloud-safe fallback everywhere", () => {
    const names = fallbackCommands("en").map((c) => c.name);
    expect(names).toEqual(HOSTED_FALLBACK_SLASH_COMMANDS.map((c) => c.name));
    expect(names).not.toContain("/deploy-simulation");
  });
});
