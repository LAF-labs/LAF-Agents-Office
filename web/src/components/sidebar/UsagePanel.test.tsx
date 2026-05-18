import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { UsagePanel } from "./UsagePanel";

const apiMocks = vi.hoisted(() => ({
  getModelAvailability: vi.fn(),
  getUsage: vi.fn(),
}));

vi.mock("../../api/client", () => apiMocks);

function renderUsagePanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsagePanel />
    </QueryClientProvider>,
  );
}

describe("UsagePanel", () => {
  it("keeps usage values hidden until the panel is opened", async () => {
    useAppStore.setState({ language: "ko" });
    apiMocks.getUsage.mockResolvedValue({ session: { total_tokens: 1200 } });
    apiMocks.getModelAvailability.mockResolvedValue({
      laf_model: { available: false },
    });

    renderUsagePanel();

    expect(screen.getByRole("button", { name: "사용량" })).toBeInTheDocument();
    expect(screen.queryByText("개인 CLI")).not.toBeInTheDocument();
    expect(apiMocks.getUsage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "사용량" }));

    expect(await screen.findByText("개인 CLI")).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.getUsage).toHaveBeenCalledTimes(1));
    expect(screen.getByText("1.2k tokens")).toBeInTheDocument();
    expect(screen.getByText("잠김")).toBeInTheDocument();
  });
});
