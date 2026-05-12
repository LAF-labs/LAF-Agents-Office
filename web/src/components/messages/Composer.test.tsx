import type { KeyboardEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { __test__ } from "./Composer";

const {
  historyKey,
  readHistory,
  pushHistory,
  resolveLeadSlug,
  askPrefix,
  isIMEComposing,
  COMPOSER_HISTORY_LIMIT,
} = __test__;

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("per-channel composer history", () => {
  it("stores one message and recalls it", () => {
    pushHistory("general", "hello world");
    expect(readHistory("general")).toEqual(["hello world"]);
  });

  it("keeps channels isolated", () => {
    pushHistory("general", "in-general");
    pushHistory("eng", "in-eng");
    expect(readHistory("general")).toEqual(["in-general"]);
    expect(readHistory("eng")).toEqual(["in-eng"]);
  });

  it("caps history at COMPOSER_HISTORY_LIMIT entries", () => {
    for (let i = 0; i < COMPOSER_HISTORY_LIMIT + 5; i++) {
      pushHistory("general", `m${i}`);
    }
    const hist = readHistory("general");
    expect(hist.length).toBe(COMPOSER_HISTORY_LIMIT);
    // Should be the TAIL of the input, so most recent is last.
    expect(hist[hist.length - 1]).toBe(`m${COMPOSER_HISTORY_LIMIT + 4}`);
  });

  it("skips consecutive duplicates", () => {
    pushHistory("general", "hi");
    pushHistory("general", "hi");
    pushHistory("general", "hi");
    expect(readHistory("general")).toEqual(["hi"]);
  });

  it("ignores empty pushes", () => {
    pushHistory("general", "   ");
    pushHistory("general", "");
    expect(readHistory("general")).toEqual([]);
  });

  it("uses a stable key shape", () => {
    expect(historyKey("eng")).toBe("laf-office:composer-history:eng");
    expect(historyKey("")).toBe("laf-office:composer-history:general");
  });

  it("handles corrupt JSON gracefully", () => {
    sessionStorage.setItem(historyKey("general"), "{not-json");
    expect(readHistory("general")).toEqual([]);
  });
});

describe("team-lead resolution for /ask", () => {
  it("prefers the configured slug", () => {
    expect(resolveLeadSlug("coo", [])).toBe("coo");
  });

  it("falls back to the first built-in agent", () => {
    expect(
      resolveLeadSlug("", [
        { slug: "pm", built_in: false },
        { slug: "ceo", built_in: true },
      ]),
    ).toBe("ceo");
  });

  it('falls back to "ceo" when nothing is known', () => {
    expect(resolveLeadSlug(undefined, [])).toBe("ceo");
  });

  it("lowercases configured slugs", () => {
    expect(resolveLeadSlug("CEO", [])).toBe("ceo");
  });
});

describe("askPrefix", () => {
  it("emits @slug with a trailing space", () => {
    expect(askPrefix("ceo")).toBe("@ceo ");
  });

  it("defaults to @ceo", () => {
    expect(askPrefix(undefined)).toBe("@ceo ");
    expect(askPrefix("")).toBe("@ceo ");
  });
});

describe("IME composition guard", () => {
  function keyboardEvent(nativeEvent: {
    isComposing?: boolean;
    keyCode?: number;
  }) {
    return { nativeEvent } as KeyboardEvent;
  }

  it("treats active composition refs as composing", () => {
    expect(
      isIMEComposing(keyboardEvent({ isComposing: false }), {
        current: true,
      }),
    ).toBe(true);
  });

  it("detects native composing and Safari keyCode fallback", () => {
    expect(
      isIMEComposing(keyboardEvent({ isComposing: true }), {
        current: false,
      }),
    ).toBe(true);
    expect(
      isIMEComposing(keyboardEvent({ keyCode: 229 }), {
        current: false,
      }),
    ).toBe(true);
  });

  it("allows normal key events", () => {
    expect(
      isIMEComposing(keyboardEvent({ isComposing: false, keyCode: 13 }), {
        current: false,
      }),
    ).toBe(false);
  });
});
