import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { ChannelHeader } from "./ChannelHeader";

vi.mock("../../hooks/useChannels", () => ({
  useChannels: () => ({ data: [] }),
}));

describe("ChannelHeader", () => {
  beforeEach(() => {
    useAppStore.setState({
      currentApp: "growth",
      currentChannel: "general",
      language: "ko",
    });
  });

  it("uses localized app names in the app header", () => {
    render(<ChannelHeader />);

    expect(screen.getByText("스타트업 오피스")).toBeInTheDocument();
    expect(screen.queryByText("Tasks")).not.toBeInTheDocument();
  });

  it("localizes header action labels", () => {
    render(<ChannelHeader onLogout={vi.fn()} userEmail="me@example.com" />);

    expect(screen.getByLabelText("로그아웃")).toHaveAttribute(
      "title",
      "me@example.com 로그아웃",
    );
    expect(screen.getByLabelText("검색")).toBeInTheDocument();
  });
});
