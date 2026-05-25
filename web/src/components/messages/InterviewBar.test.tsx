import { describe, expect, it } from "vitest";

import { __test__ } from "./InterviewBar";

describe("interview skip behavior", () => {
  it("dismisses hosted requests without local pause behavior", () => {
    expect(__test__.interviewSkipBehavior()).toMatchObject({
      ariaLabel: "Skip request",
      title: "Skip request",
    });
  });

  it("does not advertise hidden slash commands in skip notices", () => {
    expect(__test__.interviewSkipBehavior().notice).not.toContain("/");
  });
});
