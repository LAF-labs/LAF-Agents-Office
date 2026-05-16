import { describe, expect, it } from "vitest";

import { __test__ } from "./useHashRouter";

const baseState = {
  channelMeta: {},
  currentChannel: "general",
  notebookAgentSlug: null,
  notebookEntrySlug: null,
  projectFocusId: null,
  skillsSection: "dashboard" as const,
  taskFocusId: null,
  wikiLookupQuery: null,
  wikiPath: null,
};

describe("useHashRouter project routes", () => {
  it("uses the home workspace as the default route", () => {
    expect(__test__.parseHash("")).toEqual({ view: "app", app: "home" });
    expect(__test__.parseHash("#/home")).toEqual({
      view: "app",
      app: "home",
    });
  });

  it("accepts project-first route aliases", () => {
    expect(__test__.parseHash("#/projects")).toEqual({
      view: "app",
      app: "tasks",
      projectId: null,
      taskId: null,
    });
    expect(__test__.parseHash("#/projects/customer-portal")).toEqual({
      view: "app",
      app: "tasks",
      projectId: "customer-portal",
      taskId: null,
    });
    expect(
      __test__.parseHash("#/projects/customer-portal/tickets/task-36"),
    ).toEqual({
      view: "app",
      app: "tasks",
      projectId: "customer-portal",
      taskId: "task-36",
    });
    expect(
      __test__.parseHash("#/projects/customer-portal/tasks/task-36"),
    ).toEqual({
      view: "app",
      app: "tasks",
      projectId: "customer-portal",
      taskId: "task-36",
    });
    expect(__test__.parseHash("#/apps/projects")).toEqual({
      view: "app",
      app: "tasks",
    });
  });

  it("accepts growth center and skills routes", () => {
    expect(__test__.parseHash("#/growth")).toEqual({
      view: "app",
      app: "growth",
    });
    expect(__test__.parseHash("#/skills")).toEqual({
      view: "app",
      app: "skills",
    });
    expect(__test__.parseHash("#/skills/list")).toEqual({
      view: "app",
      app: "skills",
    });
    expect(__test__.parseHash("#/apps/skills")).toEqual({
      view: "app",
      app: "skills",
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

  it("canonicalizes the home app to the home route", () => {
    expect(
      __test__.stateToHash({
        ...baseState,
        currentApp: "home",
      }),
    ).toBe("#/home");
  });

  it("canonicalizes growth center and skills app routes", () => {
    expect(
      __test__.stateToHash({
        ...baseState,
        currentApp: "growth",
      }),
    ).toBe("#/growth");
    expect(
      __test__.stateToHash({
        ...baseState,
        currentApp: "skills",
      }),
    ).toBe("#/skills");
    expect(
      __test__.stateToHash({
        ...baseState,
        currentApp: "skills",
        skillsSection: "list",
      }),
    ).toBe("#/skills");
  });

  it("keeps the focused project in the project route", () => {
    expect(
      __test__.stateToHash({
        ...baseState,
        currentApp: "tasks",
        projectFocusId: "customer-portal",
      }),
    ).toBe("#/projects/customer-portal");
  });

  it("keeps the focused task in the project route", () => {
    expect(
      __test__.stateToHash({
        ...baseState,
        currentApp: "tasks",
        projectFocusId: "customer-portal",
        taskFocusId: "task-36",
      }),
    ).toBe("#/projects/customer-portal/tasks/task-36");
  });
});
