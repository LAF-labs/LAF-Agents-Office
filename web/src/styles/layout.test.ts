/// <reference types="node" />

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

describe("office shell responsive CSS", () => {
  it("uses a narrow navigation rail on mobile so the main workspace remains readable", () => {
    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "layout.css"),
      "utf8",
    );

    expect(css).toContain("@media (max-width: 768px)");
    expect(css).toContain(".sidebar:not(.sidebar-collapsed)");
    expect(css).toContain("width: 64px;");
    expect(css).toContain(
      ".sidebar:not(.sidebar-collapsed) .sidebar-agent-wrap",
    );
  });
});
