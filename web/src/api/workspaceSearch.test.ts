import { afterEach, describe, expect, it, vi } from "vitest";

import * as client from "./client";
import { searchWorkspace } from "./workspaceSearch";

describe("workspace search api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("omits the scopes param when default scopes are used", async () => {
    const spy = vi.spyOn(client, "get").mockResolvedValue({
      query: "launch",
      hits: [],
      counts: {},
      omitted: [],
    });

    await searchWorkspace("launch");

    expect(spy).toHaveBeenCalledWith("/workspace/search", {
      q: "launch",
      limit: 24,
    });
  });

  it("passes explicit scopes and limit", async () => {
    const spy = vi.spyOn(client, "get").mockResolvedValue({
      query: "matrix",
      hits: [],
      counts: {},
      omitted: [],
    });

    await searchWorkspace("matrix", { scopes: ["wiki", "chat"], limit: 8 });

    expect(spy).toHaveBeenCalledWith("/workspace/search", {
      q: "matrix",
      limit: 8,
      scopes: "wiki,chat",
    });
  });

  it("returns an empty response on short queries", async () => {
    const spy = vi.spyOn(client, "get");

    const result = await searchWorkspace("x");

    expect(spy).not.toHaveBeenCalled();
    expect(result.hits).toEqual([]);
  });
});
