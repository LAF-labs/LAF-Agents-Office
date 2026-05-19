import { describe, expect, it } from "vitest";

import { __test__ } from "./InterviewBar";

describe("interview skip behavior", () => {
  it("pauses agents only on localhost runtimes", () => {
    expect(__test__.interviewSkipBehavior(true)).toMatchObject({
      postPauseSignal: true,
      ariaLabel: "Skip and pause agents",
    });
    expect(__test__.interviewSkipBehavior(false)).toMatchObject({
      postPauseSignal: false,
      ariaLabel: "Skip request",
      title: "Skip request",
    });
  });

  it("does not advertise hidden slash commands in skip notices", () => {
    expect(__test__.interviewSkipBehavior(true).notice).not.toContain("/");
    expect(__test__.interviewSkipBehavior(false).notice).not.toContain("/");
  });
});
