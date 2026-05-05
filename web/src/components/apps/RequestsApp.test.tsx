import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { RequestsApp } from "./RequestsApp";

const apiMocks = vi.hoisted(() => ({
  answerRequest: vi.fn(),
  createDM: vi.fn(),
  getAllRequests: vi.fn(),
}));

vi.mock("../../api/client", () => apiMocks);
vi.mock("../ui/Toast", () => ({ showNotice: vi.fn() }));

function renderRequestsApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RequestsApp />
    </QueryClientProvider>,
  );
}

describe("RequestsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ currentApp: "requests", language: "en" });
    apiMocks.answerRequest.mockResolvedValue({});
    apiMocks.createDM.mockResolvedValue({ slug: "ceo__human" });
    apiMocks.getAllRequests.mockResolvedValue({
      requests: [
        {
          id: "req-1",
          from: "ceo",
          channel: "customer-portal",
          title: "Scope decision",
          question: "Should signup launch before billing?",
          status: "open",
          blocking: true,
          options: [
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
            {
              id: "custom",
              label: "Custom",
              requires_text: true,
              text_hint: "Describe scope",
            },
          ],
        },
        {
          id: "req-2",
          from: "reviewer",
          channel: "agent-lab",
          question: "Accept the PR?",
          status: "answered",
        },
      ],
    });
  });

  it("shows all-channel request status and opens agent chat", async () => {
    const user = userEvent.setup();

    renderRequestsApp();

    expect(
      await screen.findByRole("heading", { name: "Requests" }),
    ).toBeInTheDocument();
    const summary = screen.getByLabelText("Request summary");
    expect(within(summary).getByText("Pending")).toBeInTheDocument();
    expect(within(summary).getByText("Blocking")).toBeInTheDocument();
    expect(within(summary).getByText("Answered")).toBeInTheDocument();
    expect(screen.getByText("#customer-portal")).toBeInTheDocument();
    expect(
      screen.getByText("Should signup launch before billing?"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Accept the PR?")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Chat @ceo" }));

    await waitFor(() => {
      expect(apiMocks.createDM).toHaveBeenCalledWith("ceo");
    });
    expect(useAppStore.getState().currentChannel).toBe("ceo__human");

    await user.click(screen.getByRole("button", { name: /Show history/ }));
    expect(screen.getByText("Accept the PR?")).toBeInTheDocument();
  });

  it("captures required text before answering a blocking request", async () => {
    const user = userEvent.setup();

    renderRequestsApp();

    await user.click(await screen.findByRole("button", { name: "Custom" }));
    await user.type(
      screen.getByLabelText("Describe scope"),
      "Launch signup first.",
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(apiMocks.answerRequest).toHaveBeenCalledWith(
        "req-1",
        "custom",
        "Launch signup first.",
      );
    });
  });
});
