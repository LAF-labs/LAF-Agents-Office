import { afterEach, describe, expect, it, vi } from "vitest";

import { directChannelSlug, isDMChannel, useAppStore } from "./app";

afterEach(() => {
  useAppStore.setState({
    currentChannel: "general",
    currentApp: null,
    settingsSection: null,
    activeThreadId: null,
    lastMessageId: null,
    activeAgentSlug: null,
    searchOpen: false,
    composerSearchInitialQuery: "",
    composerHelpOpen: false,
    onboardingComplete: false,
    wikiPath: null,
    wikiLookupQuery: null,
    notebookAgentSlug: null,
    notebookEntrySlug: null,
  });
});

async function freshLanguageForSystemLocale(
  locales: readonly string[],
  language = locales[0] ?? "",
): Promise<{ domLanguage: string | null; storeLanguage: string }> {
  window.localStorage.removeItem("laf-office-language");
  const languagesSpy = vi
    .spyOn(window.navigator, "languages", "get")
    .mockReturnValue([...locales]);
  const languageSpy = vi
    .spyOn(window.navigator, "language", "get")
    .mockReturnValue(language);

  try {
    vi.resetModules();
    const { useAppStore: freshStore } = await import("./app");
    return {
      domLanguage: document.documentElement.getAttribute("lang"),
      storeLanguage: freshStore.getState().language,
    };
  } finally {
    languagesSpy.mockRestore();
    languageSpy.mockRestore();
    vi.resetModules();
    document.documentElement.setAttribute("lang", "en");
    useAppStore.setState({ language: "en" });
  }
}

describe("DM channel helpers", () => {
  it("uses the broker canonical direct slug", () => {
    expect(directChannelSlug("ceo")).toBe("ceo__human");
    expect(directChannelSlug("pm")).toBe("human__pm");
  });

  it("recognizes canonical and legacy DM slugs", () => {
    expect(isDMChannel("ceo__human", {})).toEqual({ agentSlug: "ceo" });
    expect(isDMChannel("human__pm", {})).toEqual({ agentSlug: "pm" });
    expect(isDMChannel("dm-ceo", {})).toEqual({ agentSlug: "ceo" });
    expect(isDMChannel("dm-human-ceo", {})).toEqual({ agentSlug: "ceo" });
  });

  it("resets navigation and onboarding state for a shred flow", () => {
    useAppStore.setState({
      currentChannel: "ceo__human",
      currentApp: "settings",
      settingsSection: "team",
      activeThreadId: "thread-1",
      lastMessageId: "msg-1",
      activeAgentSlug: "ceo",
      searchOpen: true,
      composerSearchInitialQuery: "stuck task",
      composerHelpOpen: true,
      onboardingComplete: true,
      wikiPath: "companies/acme",
      wikiLookupQuery: "who owns renewal?",
      notebookAgentSlug: "ceo",
      notebookEntrySlug: "handoff",
    });

    useAppStore.getState().resetForOnboarding();

    expect(useAppStore.getState()).toMatchObject({
      currentChannel: "general",
      currentApp: null,
      settingsSection: null,
      activeThreadId: null,
      lastMessageId: null,
      activeAgentSlug: null,
      searchOpen: false,
      composerSearchInitialQuery: "",
      composerHelpOpen: false,
      onboardingComplete: false,
      wikiPath: null,
      wikiLookupQuery: null,
      notebookAgentSlug: null,
      notebookEntrySlug: null,
    });
  });
});

describe("setTheme", () => {
  it("updates DOM + store even when localStorage.setItem throws", () => {
    // Simulates Safari private browsing / sandboxed-iframe (write-only block).
    // The previous setTheme threw uncaught here and broke the dark-mode
    // toggle entirely; the guard makes the DOM + store update succeed and
    // logs a breadcrumb instead.
    const setItemSpy = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      useAppStore.getState().setTheme("office-dark");

      expect(setItemSpy).toHaveBeenCalledWith("laf-office-theme", "office-dark");
      expect(useAppStore.getState().theme).toBe("office-dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe(
        "office-dark",
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("setTheme: localStorage.setItem failed"),
        expect.any(DOMException),
      );
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
      // Reset DOM + store so other tests don't inherit dark theme.
      document.documentElement.setAttribute("data-theme", "office");
      useAppStore.setState({ theme: "office" });
    }
  });
});

describe("setLanguage", () => {
  it("defaults to Korean for a Korean OS locale when no language is saved", async () => {
    const { domLanguage, storeLanguage } = await freshLanguageForSystemLocale([
      "ko-KR",
    ]);

    expect(storeLanguage).toBe("ko");
    expect(domLanguage).toBe("ko");
  });

  it("defaults to English for an English OS locale when no language is saved", async () => {
    const { domLanguage, storeLanguage } = await freshLanguageForSystemLocale([
      "en-US",
    ]);

    expect(storeLanguage).toBe("en");
    expect(domLanguage).toBe("en");
  });

  it("falls back to English for unsupported OS locales", async () => {
    const { domLanguage, storeLanguage } = await freshLanguageForSystemLocale([
      "ja-JP",
    ]);

    expect(storeLanguage).toBe("en");
    expect(domLanguage).toBe("en");
  });

  it("uses the primary OS locale instead of scanning secondary locale preferences", async () => {
    const { domLanguage, storeLanguage } = await freshLanguageForSystemLocale([
      "ja-JP",
      "ko-KR",
    ]);

    expect(storeLanguage).toBe("en");
    expect(domLanguage).toBe("en");
  });

  it("persists English and Korean UI language", () => {
    const setItemSpy = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {});

    try {
      useAppStore.getState().setLanguage("ko");

      expect(setItemSpy).toHaveBeenCalledWith("laf-office-language", "ko");
      expect(useAppStore.getState().language).toBe("ko");
      expect(document.documentElement.getAttribute("lang")).toBe("ko");

      useAppStore.getState().setLanguage("en");

      expect(setItemSpy).toHaveBeenCalledWith("laf-office-language", "en");
      expect(useAppStore.getState().language).toBe("en");
      expect(document.documentElement.getAttribute("lang")).toBe("en");
    } finally {
      setItemSpy.mockRestore();
      document.documentElement.setAttribute("lang", "en");
      useAppStore.setState({ language: "en" });
    }
  });
});
