import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanClientText,
  clientErrorPayload,
  currentClientTelemetryRoute,
  installClientErrorReporter,
  reportClientError,
} from "./clientTelemetry";

vi.mock("../api/client", () => ({
  post: vi.fn().mockResolvedValue({ status: "recorded" }),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function browserLike() {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  return {
    addEventListener: vi.fn((name: string, handler: (event: unknown) => void) => {
      listeners.set(name, [...(listeners.get(name) || []), handler]);
    }),
    dispatch(name: string, event: unknown) {
      for (const handler of listeners.get(name) || []) handler(event);
    },
    innerHeight: 720,
    innerWidth: 1280,
    location: {
      hash: "#/growth/customer-token-abc123?secret=value",
      origin: "https://app.example",
      pathname: "/office",
    },
  };
}

describe("client telemetry", () => {
  it("builds workspace-safe browser error payloads", () => {
    const win = browserLike();
    const payload = clientErrorPayload(
      {
        column: 9,
        error: new TypeError("boom founder@example.com https://secret.example/x?token=abc"),
        filename: "https://app.example/assets/index.js?token=secret",
        line: 42,
        source: "window.error",
      },
      win as unknown as Window,
    );

    expect(payload).toMatchObject({
      column: 9,
      filename: "index.js",
      line: 42,
      message: "boom [email] [url]",
      name: "TypeError",
      route: "/office#growth",
      source: "window.error",
      viewport: { height: 720, width: 1280 },
    });
    expect(payload.fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(JSON.stringify(payload)).not.toMatch(/founder@example|token=secret|customer-token/);
  });

  it("redacts common sensitive text before reporting", () => {
    expect(cleanClientText("email founder@example.com password=hunter2", 300)).toBe(
      "email [email] password=[redacted]",
    );
  });

  it("uses only pathname and top-level hash route", () => {
    const win = browserLike();
    expect(currentClientTelemetryRoute(win as unknown as Window)).toBe("/office#growth");
  });

  it("installs global error listeners once and reports without throwing", async () => {
    const { post } = await import("../api/client");
    const win = browserLike();

    installClientErrorReporter(win as unknown as Window);
    installClientErrorReporter(win as unknown as Window);
    win.dispatch("error", {
      colno: 2,
      error: new Error("render failed"),
      filename: "https://app.example/assets/app.js",
      lineno: 1,
      message: "render failed",
    });
    win.dispatch("unhandledrejection", {
      reason: new Error("promise failed"),
    });
    await Promise.resolve();

    expect(win.addEventListener).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenNthCalledWith(
      1,
      "/client-errors",
      expect.objectContaining({ source: "window.error" }),
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      "/client-errors",
      expect.objectContaining({ source: "unhandledrejection" }),
    );
  });

  it("swallows telemetry transport failures", async () => {
    const { post } = await import("../api/client");
    vi.mocked(post).mockRejectedValueOnce(new Error("network down"));

    await expect(reportClientError({ message: "boom", source: "manual" })).resolves.toBeUndefined();
  });
});
