import { describe, expect, it } from "vitest";

import { __test__ } from "./SettingsApp";

describe("SettingsApp runner setup", () => {
  it("uses command-only LAF Bridge installation", () => {
    expect(__test__.RUNNER_INSTALL_COMMAND).toBe(
      "curl -fsSL https://raw.githubusercontent.com/LAF-labs/LAF-Agents-Office/main/scripts/install.sh | LAF_OFFICE_INSTALL_BINARY=laf-runner sh",
    );
    expect(__test__.RUNNER_INSTALL_COMMAND).toContain("laf-runner");
    expect(__test__.RUNNER_INSTALL_COMMAND).not.toMatch(/\.pkg|\.msi|\.exe/i);
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
