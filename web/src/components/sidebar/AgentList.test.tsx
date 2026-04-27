import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { AgentList } from "./AgentList";

vi.mock("../../hooks/useConfig", () => ({
  useDefaultHarness: () => "codex",
}));

vi.mock("../../hooks/useMembers", () => ({
  useOfficeMembers: () => ({
    data: [
      {
        slug: "ceo",
        name: "CEO",
        status: "idle",
        task: "",
        provider: "codex",
      },
    ],
  }),
}));

vi.mock("../../hooks/useOverflow", () => ({
  useOverflow: () => ({ current: null }),
}));

vi.mock("../agents/AgentWizard", () => ({
  AgentWizard: () => null,
  useAgentWizard: () => ({ open: false, show: vi.fn(), hide: vi.fn() }),
}));

describe("AgentList", () => {
  beforeEach(() => {
    useAppStore.setState({
      language: "ko",
      currentChannel: "general",
      channelMeta: {},
    });
  });

  it("localizes sidebar agent actions", () => {
    render(<AgentList />);

    const createAgent = screen.getByRole("button", {
      name: "새 에이전트 만들기",
    });
    const invitePerson = screen.getByRole("button", { name: "팀원 초대" });

    expect(createAgent).toHaveAttribute("title", "새 에이전트 만들기");
    expect(createAgent).toHaveTextContent("+새 에이전트");
    expect(invitePerson).toHaveAttribute("title", "팀원 초대");
    expect(invitePerson).toHaveTextContent("@팀원 초대");
    expect(screen.queryByText("New Agent")).not.toBeInTheDocument();
    expect(screen.queryByText("Invite Person")).not.toBeInTheDocument();
  });
});
