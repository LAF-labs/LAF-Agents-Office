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
      currentApp: "tasks",
      currentChannel: "general",
      language: "ko",
    });
  });

  it("uses localized app names in the app header", () => {
    render(<ChannelHeader />);

    expect(screen.getByText("프로젝트")).toBeInTheDocument();
    expect(screen.queryByText("Tasks")).not.toBeInTheDocument();
  });
});
