import { describe, expect, it } from "vitest";

import { SIDEBAR_APPS } from "./constants";

describe("SIDEBAR_APPS", () => {
  it("keeps the product surface focused on agent collaboration and the wiki", () => {
    expect(SIDEBAR_APPS.map((app) => app.id)).toEqual([
      "home",
      "tasks",
      "wiki",
      "settings",
    ]);
  });

  it("puts home first as the all-project agent command surface", () => {
    expect(SIDEBAR_APPS[0].id).toBe("home");
  });

  it("does not expose deferred CRM-style or operator-only surfaces", () => {
    const ids = SIDEBAR_APPS.map((app) => app.id);
    expect(ids).not.toContain("graph");
    expect(ids).not.toContain("policies");
    expect(ids).not.toContain("calendar");
    expect(ids).not.toContain("health-check");
  });
});
