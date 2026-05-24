import { describe, expect, it } from "vitest";

import { SIDEBAR_APPS } from "./constants";

describe("SIDEBAR_APPS", () => {
  it("keeps the product surface focused on the Startup Office workspace", () => {
    expect(SIDEBAR_APPS.map((app) => app.id)).toEqual([
      "growth",
      "home",
      "skills",
      "wiki",
      "activity",
      "receipts",
      "settings",
    ]);
  });

  it("puts Startup Office first as the primary company operating surface", () => {
    expect(SIDEBAR_APPS[0]).toMatchObject({
      id: "growth",
      name: "Startup Office",
    });
  });

  it("does not expose deferred CRM-style or operator-only surfaces", () => {
    const ids = SIDEBAR_APPS.map((app) => app.id);
    expect(ids).not.toContain("graph");
    expect(ids).not.toContain("policies");
    expect(ids).not.toContain("calendar");
    expect(ids).not.toContain("health-check");
  });
});
