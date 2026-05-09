import { describe, expect, it } from "vitest";

import {
  agentMentionTargets,
  mentionSlugFromEmail,
  mentionTargetSlugs,
  normalizeMentionSlug,
  personMentionTargets,
} from "./mentionTargets";

describe("mention target helpers", () => {
  it("derives human mention slugs from email local-parts", () => {
    expect(mentionSlugFromEmail("Sarah.Chen+ops@Acme.com")).toBe(
      "sarah-chen-ops",
    );
    expect(mentionSlugFromEmail("a@x.y")).toBe("");
  });

  it("normalizes only mention-pattern-compatible slugs", () => {
    expect(normalizeMentionSlug("Sarah Chen")).toBe("sarah-chen");
    expect(normalizeMentionSlug("human")).toBe("");
    expect(normalizeMentionSlug("a")).toBe("");
  });

  it("builds people targets from auth users, human members, and identities", () => {
    const people = personMentionTargets({
      authUsers: [
        {
          id: "user-1",
          email: "sarah.chen@acme.com",
          name: "Sarah Chen",
          team_id: "team-a",
          role: "admin",
          status: "active",
        },
      ],
      humanMembers: [
        {
          id: "human-dwight",
          email: "dwight@dunder.com",
          name: "Dwight Schrute",
          role: "member",
          status: "active",
        },
      ],
      humanIdentities: [
        {
          email: "nazz@laf.local",
          name: "Nazz",
          slug: "nazz",
        },
      ],
      agentSlugs: ["pm"],
    });

    expect(people.map((person) => person.slug)).toEqual([
      "dwight",
      "nazz",
      "sarah-chen",
    ]);
  });

  it("skips people whose slug collides with an agent", () => {
    const people = personMentionTargets({
      authUsers: [
        {
          id: "user-1",
          email: "pm@acme.com",
          name: "Human PM",
          team_id: "team-a",
          role: "member",
          status: "active",
        },
      ],
      agentSlugs: ["pm"],
    });

    expect(people).toEqual([]);
  });

  it("merges agent and person slugs for mention rendering", () => {
    const agents = agentMentionTargets([{ slug: "pm", name: "PM", role: "" }]);
    const people = personMentionTargets({
      humanIdentities: [{ slug: "sarah", name: "Sarah", email: "s@x.com" }],
    });

    expect(mentionTargetSlugs(agents, people)).toEqual(["pm", "sarah"]);
  });
});
