import { describe, expect, it } from "vitest";

import { __test__ } from "./SettingsApp";

describe("SettingsApp runner installers", () => {
  it("offers a direct Windows MSI download from the hosted app", () => {
    const windows = __test__.RUNNER_INSTALLERS.find(
      (installer) => installer.id === "windows",
    );

    expect(windows).toMatchObject({
      actionKey: "settings.runner.downloadMsi",
      download: "laf-runner-windows-x64-0.0.7.1.msi",
      href: "/downloads/laf-runner-windows-x64-0.0.7.1.msi",
    });
    expect(windows?.external).toBeUndefined();
    expect(__test__.RUNNER_WINDOWS_MSI_PATH).toBe(
      "/downloads/laf-runner-windows-x64-0.0.7.1.msi",
    );
  });

  it("keeps macOS on the bundled PKG download", () => {
    const macos = __test__.RUNNER_INSTALLERS.find(
      (installer) => installer.id === "macos",
    );

    expect(macos).toMatchObject({
      actionKey: "settings.runner.downloadPkg",
      download: "laf-runner-macos-arm64-0.0.7.1.pkg",
      href: __test__.RUNNER_MACOS_PKG_PATH,
    });
  });

  it("detects platform strings for installer recommendations", () => {
    expect(__test__.detectRunnerPlatformFrom("Win32 Windows NT")).toBe(
      "windows",
    );
    expect(__test__.detectRunnerPlatformFrom("MacIntel Safari")).toBe("macos");
    expect(__test__.detectRunnerPlatformFrom("Linux x86_64")).toBe("other");
  });
});
