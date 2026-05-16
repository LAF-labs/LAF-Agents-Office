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
});
