import { describe, expect, it } from "vitest";

import type { Task } from "../../../api/client";
import { normalizeStatus, userEnteredTaskDetails } from "./taskDisplay";

function task(overrides: Partial<Task>): Task {
  return {
    created_by: "human",
    id: "SAJU-1",
    owner: "engineer",
    project_id: "sajuhook",
    status: "open",
    title: "Fix checkout handoff",
    ...overrides,
  };
}

describe("taskDisplay", () => {
  it("normalizes server status aliases for kanban grouping", () => {
    expect(normalizeStatus("completed")).toBe("done");
    expect(normalizeStatus("in-review")).toBe("review");
    expect(normalizeStatus("unknown")).toBe("open");
  });

  it("extracts the user-written detail from generated assignment text", () => {
    expect(
      userEnteredTaskDetails(
        task({
          human_details:
            "Pick up the reported issue: `Checkout stalls after payment` Treat this as a bugfix lane.",
        }),
      ),
    ).toBe("Checkout stalls after payment");
  });

  it("extracts plain quoted detail without treating question marks as quotes", () => {
    expect(
      userEnteredTaskDetails(
        task({
          human_details:
            'Pick up the reported issue: "Show the receipt number?" Treat this as a bugfix lane.',
        }),
      ),
    ).toBe("Show the receipt number?");
  });

  it("hides generated details that were not directly entered by the user", () => {
    expect(
      userEnteredTaskDetails(
        task({
          created_by: "ceo",
          details: "No isolated worktree. Task chat now routes correctly.",
          human_details: "",
        }),
      ),
    ).toBe("");
  });
});
