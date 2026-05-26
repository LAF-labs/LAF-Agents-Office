import { afterEach, describe, expect, it, vi } from "vitest";

import {
  get,
  hostedAPIBaseURL,
  hostedAPIURLFromBrowser,
  initApi,
  login,
  normalizeHostedAPIBase,
  resetWorkspace,
  shredWorkspace,
  signup,
  sseURL,
  supportsBrokerEvents,
} from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("workspace destructive api client", () => {
  it("sends the typed confirmation phrase with workspace wipes", async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await resetWorkspace("i can spell responsibility");
    await shredWorkspace("i can spell responsibility");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspace/reset",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ confirm: "i can spell responsibility" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspace/shred",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ confirm: "i can spell responsibility" }),
      }),
    );
  });
});

describe("cloud-only api client surface", () => {
  it("does not expose obsolete execution or project binding helpers", async () => {
    const client = await import("./client");
    expect("getProjectLocalBindings" in client).toBe(false);
    expect("createProjectLocalBinding" in client).toBe(false);
    expect("deleteProjectLocalBinding" in client).toBe(false);
    expect("getProjects" in client).toBe(false);
    expect("createProject" in client).toBe(false);
    expect("getOfficeTasks" in client).toBe(false);
    expect("createTask" in client).toBe(false);
  });
});

describe("generic api client", () => {
  it("omits nullish query params without stringifying undefined", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await get("/example", {
      q: "customer portal",
      include_done: false,
      limit: 0,
      omitted: undefined,
      channel: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/example?q=customer%20portal&include_done=false&limit=0",
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });
});

describe("hosted browser api client", () => {
  it("uses hosted /api directly without discovery", async () => {
    vi.stubGlobal("location", { hostname: "laf-co.com" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await initApi();
    await get("/auth/session");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith("/api-token", expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("localhost:7890"),
      expect.anything(),
    );
    expect(supportsBrokerEvents()).toBe(false);
  });

  it("supports a configured cross-origin hosted API base", async () => {
    vi.stubEnv("VITE_LAF_API_BASE_URL", "https://api.office.example/api/");
    vi.stubGlobal("location", {
      hostname: "app.office.example",
      origin: "https://app.office.example",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await initApi();
    await get("/auth/session");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.office.example/api/auth/session",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith("/api-token", expect.anything());
    expect(hostedAPIBaseURL()).toBe("https://api.office.example/api");
    expect(hostedAPIURLFromBrowser()).toBe("https://api.office.example/api");
    expect(sseURL("/events")).toBe("https://api.office.example/api/events");
  });

  it("enables broker events when the browser provides EventSource", () => {
    vi.stubGlobal("EventSource", class {} as unknown as typeof EventSource);

    expect(supportsBrokerEvents()).toBe(true);
  });

  it("normalizes a bare browser API host for split-origin deployments", async () => {
    vi.stubEnv("VITE_LAF_API_BASE_URL", "api.office.example");
    vi.stubGlobal("location", {
      hostname: "app.office.example",
      origin: "https://app.office.example",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await initApi();
    await get("/auth/session");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.office.example/api/auth/session",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(hostedAPIBaseURL()).toBe("https://api.office.example/api");
  });

  it("normalizes hosted API base values for same-origin and split-origin deployments", () => {
    vi.stubGlobal("location", {
      hostname: "office.example",
      origin: "https://office.example",
    });

    expect(normalizeHostedAPIBase("")).toBe("/api");
    expect(normalizeHostedAPIBase("api/")).toBe("/api");
    expect(normalizeHostedAPIBase("/custom-api/")).toBe("/custom-api");
    expect(normalizeHostedAPIBase("api.office.example")).toBe(
      "https://api.office.example/api",
    );
    expect(normalizeHostedAPIBase("api.office.example/custom-api/")).toBe(
      "https://api.office.example/custom-api",
    );
    expect(normalizeHostedAPIBase("https://api.office.example")).toBe(
      "https://api.office.example/api",
    );
    expect(
      normalizeHostedAPIBase("https://api.office.example/api/?x=1#frag"),
    ).toBe("https://api.office.example/api");
    expect(hostedAPIURLFromBrowser()).toBe("https://office.example/api");
  });

  it("keeps same-origin cloud API mode when auth fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("invalid credentials", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await initApi();

    await expect(
      login({ email: "nobody@example.com", password: "wrongpassword" }),
    ).rejects.toThrow("invalid credentials");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });
});

describe("auth api client errors", () => {
  it("unwraps JSON API errors before showing them to auth forms", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid login credentials" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      login({ email: "nobody@example.com", password: "wrongpassword" }),
    ).rejects.toThrow("Invalid login credentials");
  });

  it("unwraps JSON signup errors before showing them to auth forms", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Unable to validate email address: invalid format",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      signup({
        email: "not-an-email",
        name: "Test User",
        password: "fake-password-for-test",
        team_action: "create",
        team_name: "Test Team",
      }),
    ).rejects.toThrow("Unable to validate email address: invalid format");
  });

  it("unwraps typed hosted API error envelopes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "rate_limit_exceeded",
            message: "rate limit exceeded",
            retryable: true,
            status: 429,
          },
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      login({ email: "nobody@example.com", password: "wrongpassword" }),
    ).rejects.toThrow("rate limit exceeded");
  });
});
