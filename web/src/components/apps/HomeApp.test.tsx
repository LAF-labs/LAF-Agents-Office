import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeApp } from "./HomeApp";

const apiMocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  getConfig: vi.fn(),
  getMessages: vi.fn(),
  getOfficeMembers: vi.fn(),
  getProjects: vi.fn(),
  postMessage: vi.fn(),
}));

vi.mock("../../api/client", () => apiMocks);

function renderHomeApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <HomeApp />
    </QueryClientProvider>,
  );
}

describe("HomeApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getConfig.mockResolvedValue({ team_lead_slug: "ceo" });
    apiMocks.getMessages.mockResolvedValue({ messages: [] });
    apiMocks.getOfficeMembers.mockResolvedValue({
      members: [
        { built_in: true, name: "CEO", role: "Lead", slug: "ceo" },
        { name: "Engineer", role: "Build", slug: "engineer" },
        { name: "Human", role: "User", slug: "human" },
      ],
    });
    apiMocks.getProjects.mockResolvedValue({
      projects: [
        {
          created_at: "2026-05-01T00:00:00Z",
          id: "old",
          name: "Old Project",
          updated_at: "2026-05-01T00:00:00Z",
        },
        {
          created_at: "2026-05-02T00:00:00Z",
          id: "new",
          name: "New Project",
          updated_at: "2026-05-09T00:00:00Z",
        },
        {
          created_at: "2026-05-03T00:00:00Z",
          id: "middle",
          name: "Middle Project",
          updated_at: "2026-05-04T00:00:00Z",
        },
      ],
    });
    apiMocks.postMessage.mockResolvedValue({ id: "msg-1" });
  });

  it("shows project cards in recent update order", async () => {
    renderHomeApp();

    const region = await screen.findByRole("region", { name: "프로젝트" });
    await within(region).findByText("New Project");
    const projectNames = within(region)
      .getAllByText(/Project$/)
      .map((node) => node.textContent);

    expect(projectNames).toEqual([
      "New Project",
      "Middle Project",
      "Old Project",
    ]);
  });

  it("creates a project from only its name when there are no projects", async () => {
    const user = userEvent.setup();
    apiMocks.getProjects.mockResolvedValue({ projects: [] });
    apiMocks.createProject.mockResolvedValue({
      project: { id: "launch", name: "Launch" },
    });

    renderHomeApp();

    await user.type(
      await screen.findByPlaceholderText("프로젝트 이름"),
      "Launch",
    );
    await user.click(screen.getByRole("button", { name: "만들기" }));

    await waitFor(() => {
      expect(apiMocks.createProject).toHaveBeenCalledWith({ name: "Launch" });
    });
  });

  it("adds the selected project hashtag and defaults chat to CEO", async () => {
    const user = userEvent.setup();
    renderHomeApp();

    await user.click(
      await screen.findByRole("button", { name: /New Project/ }),
    );
    await user.type(
      screen.getByPlaceholderText("무엇이든 물어보세요"),
      "이번 주 계획 정리해줘",
    );
    await user.click(screen.getByRole("button", { name: "보내기" }));

    await waitFor(() => {
      expect(apiMocks.postMessage).toHaveBeenCalledWith(
        "#new @ceo 이번 주 계획 정리해줘",
        "general",
        undefined,
        ["ceo"],
      );
    });
  });

  it("routes explicit agent mentions without tagging the user or adding CEO", async () => {
    const user = userEvent.setup();
    renderHomeApp();

    await screen.findByText("New Project");
    await user.type(
      screen.getByPlaceholderText("무엇이든 물어보세요"),
      "@engineer 디자인 확인해줘",
    );
    await user.click(screen.getByRole("button", { name: "보내기" }));

    await waitFor(() => {
      expect(apiMocks.postMessage).toHaveBeenCalledWith(
        "@engineer 디자인 확인해줘",
        "general",
        undefined,
        ["engineer"],
      );
    });
  });

  it("does not submit the home composer twice while the first send is pending", async () => {
    const user = userEvent.setup();
    let resolvePost!: (value: unknown) => void;
    apiMocks.postMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );
    renderHomeApp();

    await screen.findByText("New Project");
    await user.type(screen.getByPlaceholderText("무엇이든 물어보세요"), "ㅇㅋ");
    const sendButton = screen.getByRole("button", { name: "보내기" });
    await user.click(sendButton);
    await user.click(sendButton);

    expect(apiMocks.postMessage).toHaveBeenCalledTimes(1);
    resolvePost({ id: "msg-1" });
  });

  it("does not submit Enter while Korean IME composition is active", async () => {
    renderHomeApp();

    await screen.findByText("New Project");
    const input = screen.getByPlaceholderText("무엇이든 물어보세요");
    fireEvent.change(input, {
      target: { value: "ㅇ", selectionStart: 1 },
    });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });

    expect(apiMocks.postMessage).not.toHaveBeenCalled();
  });

  it("loads the live home channel so agent replies are visible", async () => {
    renderHomeApp();

    await screen.findByText("오늘은 무슨 이야기를 할까요?");

    expect(apiMocks.getMessages).toHaveBeenCalledWith("general", null, 50);
  });
});
