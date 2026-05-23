import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { AppList } from "./AppList";

const notebookMocks = vi.hoisted(() => ({
  fetchReviews: vi.fn(),
}));

vi.mock("../../api/notebook", () => notebookMocks);

function renderAppList() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppList />
    </QueryClientProvider>,
  );
}

describe("AppList Startup Office navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notebookMocks.fetchReviews.mockResolvedValue([]);
    useAppStore.setState({
      currentApp: "growth",
      language: "en",
      projectFocusId: null,
      taskFocusId: null,
    });
  });

  it("shows cloud operating surfaces without project/task navigation", () => {
    renderAppList();

    expect(screen.getByRole("button", { name: "Growth Center" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Command" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Assets" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Receipts" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Projects" }),
    ).not.toBeInTheDocument();
  });
});
