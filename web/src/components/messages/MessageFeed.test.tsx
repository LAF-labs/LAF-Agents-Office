import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { MessageFeed } from "./MessageFeed";

vi.mock("../../hooks/useMessages", () => ({
  useMessages: () => ({ data: [], isLoading: false }),
}));
vi.mock("../../hooks/useConfig", () => ({
  useDefaultHarness: () => "claude-code",
}));
vi.mock("../../hooks/useMembers", () => ({
  useOfficeMembers: () => ({ data: [] }),
}));

describe("MessageFeed", () => {
  beforeEach(() => {
    useAppStore.setState({
      currentChannel: "general",
      language: "ko",
      collapsedThreads: {},
    });
  });

  it("localizes the empty channel state", () => {
    render(<MessageFeed />);

    expect(
      screen.getByText("#general 채널은 아직 비어 있습니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "팀이 실제 개발을 시작할 준비가 되면 GitHub를 연결하세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/is empty\. For now/i)).not.toBeInTheDocument();
  });
});
