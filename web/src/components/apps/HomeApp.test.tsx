import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { __test__, HomeApp } from "./HomeApp";

const apiMocks = vi.hoisted(() => ({
  confirmOrchestrationIntent: vi.fn(),
  getAuthSession: vi.fn(),
  getConfig: vi.fn(),
  getModelAvailability: vi.fn(),
  getOfficeMembers: vi.fn(),
  getProjects: vi.fn(),
  getSkills: vi.fn(),
  getThreadMessages: vi.fn(),
  postMessage: vi.fn(),
  routeOrchestrationIntent: vi.fn(),
}));
const eventMocks = vi.hoisted(() => {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  return {
    reset: () => listeners.clear(),
    emit: (name: string, payload: unknown) => {
      const event = new MessageEvent(name, {
        data: JSON.stringify(payload),
      });
      for (const listener of listeners.get(name) ?? []) {
        if (typeof listener === "function") {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    },
    subscribeBrokerEvent: vi.fn(
      (name: string, listener: EventListenerOrEventListenerObject) => {
        const next =
          listeners.get(name) ?? new Set<EventListenerOrEventListenerObject>();
        next.add(listener);
        listeners.set(name, next);
        return () => {
          next.delete(listener);
          if (next.size === 0) listeners.delete(name);
        };
      },
    ),
  };
});

vi.mock("../../api/client", () => apiMocks);
vi.mock("../../api/events", () => ({
  subscribeBrokerEvent: eventMocks.subscribeBrokerEvent,
}));

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
    eventMocks.reset();
    apiMocks.getAuthSession.mockResolvedValue({
      authenticated: true,
      team: {
        created_at: "2026-05-01T00:00:00Z",
        id: "team-alpha",
        name: "Alpha",
        slug: "alpha",
      },
      user: {
        email: "owner@example.com",
        id: "user-alpha",
        name: "Owner",
        role: "owner",
        status: "active",
        team_id: "team-alpha",
      },
    });
    apiMocks.getConfig.mockResolvedValue({ team_lead_slug: "ceo" });
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["record_only"],
      default_mode: "record_only",
      laf_model: { available: false, reason: "paid workspace required" },
      my_bridge: { available: false, reason: "bridge required" },
      team_bridge: { available: false, reason: "runner required" },
      record_only: { available: true },
    });
    apiMocks.routeOrchestrationIntent.mockResolvedValue({
      intent: {
        id: "intent-chat",
        proposed_actions: [],
        required_permissions: [],
        requires_confirmation: false,
        risk: "low",
        status: "routed",
        summary: "Chat message",
        type: "chat",
      },
    });
    apiMocks.getThreadMessages.mockResolvedValue({ messages: [] });
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
          id: "sajuhook",
          name: "sajuhook",
          updated_at: "2026-05-04T00:00:00Z",
        },
        {
          created_at: "2026-05-02T00:00:00Z",
          id: "aurora-revenue-os",
          name: "Aurora Revenue OS",
          updated_at: "2026-05-09T00:00:00Z",
        },
      ],
    });
    apiMocks.getSkills.mockResolvedValue({
      skills: [
        {
          description: "Release readiness runbook.",
          name: "deploy-check",
          status: "active",
          title: "Deploy Check",
        },
        {
          description: "Archived skill.",
          name: "old-skill",
          status: "archived",
          title: "Old Skill",
        },
      ],
    });
    apiMocks.postMessage.mockResolvedValue({ id: "msg-1" });
  });

  it("does not render the project picker on the home page", async () => {
    renderHomeApp();

    await screen.findByText("오늘은 무슨 이야기를 할까요?");
    expect(screen.queryByRole("region", { name: "프로젝트" })).toBeNull();
    expect(screen.queryByPlaceholderText("프로젝트 이름")).toBeNull();
  });

  it("defaults chat to the orchestrator without showing an artificial mention", async () => {
    const user = userEvent.setup();
    renderHomeApp();

    await user.type(
      await screen.findByPlaceholderText("무엇이든 물어보세요"),
      "이번 주 계획 정리해줘",
    );
    await user.click(screen.getByRole("button", { name: "보내기" }));

    await waitFor(() => {
      expect(apiMocks.postMessage).toHaveBeenCalledWith(
        "이번 주 계획 정리해줘",
        "general",
        "home:team-alpha:user-alpha",
        ["ceo"],
        expect.objectContaining({
          model_mode: "record_only",
          scope: "home_orchestration",
        }),
      );
    });
    expect(
      __test__.buildOutboundMessage("이번 주 계획 정리해줘", ["ceo"], "ceo"),
    ).toEqual({
      content: "이번 주 계획 정리해줘",
      tagged: ["ceo"],
    });
  });

  it("routes explicit agent mentions without tagging the user or adding CEO", async () => {
    const user = userEvent.setup();
    renderHomeApp();

    await user.type(
      await screen.findByPlaceholderText("무엇이든 물어보세요"),
      "@engineer 디자인 확인해줘",
    );
    await user.click(screen.getByRole("button", { name: "보내기" }));

    await waitFor(() => {
      expect(apiMocks.postMessage).toHaveBeenCalledWith(
        "@engineer 디자인 확인해줘",
        "general",
        "home:team-alpha:user-alpha",
        ["engineer"],
        expect.objectContaining({
          model_mode: "record_only",
          scope: "home_orchestration",
        }),
      );
    });
  });

  it("shows project autocomplete for # and sends the selected project hashtag", async () => {
    const user = userEvent.setup();
    renderHomeApp();

    await user.type(
      await screen.findByPlaceholderText("무엇이든 물어보세요"),
      "#aur",
    );
    await user.click(await screen.findByText("#aurora-revenue-os"));
    await user.type(
      screen.getByPlaceholderText("무엇이든 물어보세요"),
      "정리해줘",
    );
    await user.click(screen.getByRole("button", { name: "보내기" }));

    await waitFor(() => {
      expect(apiMocks.postMessage).toHaveBeenCalledWith(
        "#aurora-revenue-os 정리해줘",
        "general",
        "home:team-alpha:user-alpha",
        ["ceo"],
        expect.objectContaining({
          model_mode: "record_only",
          scope: "home_orchestration",
        }),
      );
    });
  });

  it("shows skill autocomplete for / with summaries and sends the selected skill command", async () => {
    const user = userEvent.setup();
    renderHomeApp();

    await user.type(
      await screen.findByPlaceholderText("무엇이든 물어보세요"),
      "/dep",
    );

    expect(await screen.findByText("/deploy-check")).toBeInTheDocument();
    expect(
      await screen.findByText(/Release readiness runbook/),
    ).toBeInTheDocument();
    expect(document.querySelector(".home-autocomplete.is-skill")).toBeTruthy();
    expect(screen.queryByText("/old-skill")).not.toBeInTheDocument();

    await user.click(screen.getByText("/deploy-check"));
    await user.type(
      screen.getByPlaceholderText("무엇이든 물어보세요"),
      "실행해줘",
    );
    await user.click(screen.getByRole("button", { name: "보내기" }));

    await waitFor(() => {
      expect(apiMocks.postMessage).toHaveBeenCalledWith(
        "/deploy-check 실행해줘",
        "general",
        "home:team-alpha:user-alpha",
        ["ceo"],
        expect.objectContaining({
          model_mode: "record_only",
          scope: "home_orchestration",
        }),
      );
    });
  });

  it("shows a thinking bubble and streams an incoming agent reply", async () => {
    const user = userEvent.setup();
    apiMocks.getModelAvailability.mockResolvedValue({
      allowed_modes: ["my_bridge", "record_only"],
      default_mode: "my_bridge",
      laf_model: { available: false, reason: "paid workspace required" },
      local_cli: { available: true, runtimes: ["codex"] },
      my_bridge: { available: true },
      record_only: { available: true },
      team_bridge: { available: false, reason: "runner required" },
    });
    renderHomeApp();

    await waitFor(() =>
      expect(screen.getByText("Codex CLI를 사용합니다.")).toBeInTheDocument(),
    );
    await user.type(
      await screen.findByPlaceholderText("무엇이든 물어보세요"),
      "현재 상태 알려줘",
    );
    await user.click(screen.getByRole("button", { name: "보내기" }));

    await waitFor(() =>
      expect(document.querySelector(".home-message.is-thinking")).toBeTruthy(),
    );
    expect(document.querySelectorAll(".home-typing-dots span")).toHaveLength(3);

    act(() => {
      eventMocks.emit("message", {
        message: {
          channel: "general",
          content: "좋아요. 바로 확인할게요.",
          from: "ceo",
          id: "msg-agent-1",
          reply_to: "msg-1",
          timestamp: new Date().toISOString(),
        },
      });
    });

    await waitFor(() =>
      expect(
        document.querySelector(".home-message-text.is-streaming"),
      ).toBeTruthy(),
    );
    await waitFor(() =>
      expect(screen.queryByText("생각 중")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/좋아요/)).toBeInTheDocument();
    expect(await screen.findByText(/확인할게요/)).toBeInTheDocument();
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

    await user.type(
      await screen.findByPlaceholderText("무엇이든 물어보세요"),
      "ㅇㅋ",
    );
    const sendButton = screen.getByRole("button", { name: "보내기" });
    await user.click(sendButton);
    await user.click(sendButton);

    expect(apiMocks.postMessage).toHaveBeenCalledTimes(1);
    resolvePost({ id: "msg-1" });
  });

  it("does not submit Enter while Korean IME composition is active", async () => {
    renderHomeApp();

    const input = await screen.findByPlaceholderText("무엇이든 물어보세요");
    fireEvent.change(input, {
      target: { value: "ㅇ", selectionStart: 1 },
    });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });

    expect(apiMocks.postMessage).not.toHaveBeenCalled();
  });

  it("loads the persistent home thread for the authenticated user", async () => {
    renderHomeApp();

    await screen.findByText("오늘은 무슨 이야기를 할까요?");

    expect(apiMocks.getThreadMessages).toHaveBeenCalledWith(
      "general",
      "home:team-alpha:user-alpha",
    );
  });

  it("renders compacted home summaries as summary messages", async () => {
    apiMocks.getThreadMessages.mockResolvedValue({
      messages: [
        {
          channel: "general",
          content: "Auto-compressed Home summary.",
          from: "system",
          id: "home-summary-team-alpha-user-alpha",
          kind: "home_summary",
          reply_to: "home:team-alpha:user-alpha",
          timestamp: "2026-05-10T00:00:00Z",
        },
      ],
    });

    renderHomeApp();

    expect(await screen.findByText("요약")).toBeInTheDocument();
    expect(
      await screen.findByText("Auto-compressed Home summary."),
    ).toBeInTheDocument();
  });
});
