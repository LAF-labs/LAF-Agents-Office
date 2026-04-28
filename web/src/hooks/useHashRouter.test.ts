import { describe, expect, it } from "vitest";

import { __test__ } from "./useHashRouter";

const baseState = {
  channelMeta: {},
  currentChannel: "general",
  notebookAgentSlug: null,
  notebookEntrySlug: null,
  wikiLookupQuery: null,
  wikiPath: null,
};

describe("useHashRouter project routes", () => {
  it("uses the project workspace as the default route", () => {
    expect(__test__.parseHash("")).toEqual({ view: "app", app: "tasks" });
  });

  it("accepts project-first route aliases", () => {
    expect(__test__.parseHash("#/projects")).toEqual({
      view: "app",
      app: "tasks",
    });
    expect(__test__.parseHash("#/apps/projects")).toEqual({
      view: "app",
      app: "tasks",
    });
  });

  it("canonicalizes the tasks app to the project route", () => {
    expect(
      __test__.stateToHash({
        ...baseState,
        currentApp: "tasks",
      }),
    ).toBe("#/projects");
  });
});
