import { afterEach, describe, expect, it, vi } from "vitest";

import { createProject } from "./client";

describe("project api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an optional GitHub repo URL when creating a project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          project: {
            id: "customer-portal",
            name: "Customer Portal",
            github_repo_url: "https://github.com/laf-labs/customer-portal",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createProject({
      name: "Customer Portal",
      github_repo_url: "https://github.com/laf-labs/customer-portal",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "create",
          created_by: "human",
          name: "Customer Portal",
          github_repo_url: "https://github.com/laf-labs/customer-portal",
        }),
      }),
    );
    expect(result.project.github_repo_url).toBe(
      "https://github.com/laf-labs/customer-portal",
    );
  });
});
