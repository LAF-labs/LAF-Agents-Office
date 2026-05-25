import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { ReceiptsApp } from "./ReceiptsApp";

const startupOfficeMocks = vi.hoisted(() => ({
  getStartupOfficeReceipts: vi.fn(),
  getStartupOfficeRun: vi.fn(),
}));

vi.mock("../../api/startupOffice", () => startupOfficeMocks);

function renderReceiptsApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ReceiptsApp />
    </QueryClientProvider>,
  );
}

describe("ReceiptsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      currentApp: "receipts",
      language: "en",
      wikiPath: null,
    });
    startupOfficeMocks.getStartupOfficeReceipts.mockResolvedValue({
      receipts: [
        {
          actor_slug: "ceo",
          created_at: "2026-05-24T00:00:00Z",
          event_type: "approval.approved",
          id: "receipt-1",
          run_id: "run-1",
          summary: "Founder approved the validation draft.",
          trace: {
            cost: {
              estimated_usd: 0.03,
              total_tokens: 1234,
            },
          },
        },
      ],
    });
    startupOfficeMocks.getStartupOfficeRun.mockResolvedValue({
      approvals: [],
      artifacts: [],
      receipts: [
        {
          actor_slug: "ceo",
          created_at: "2026-05-24T00:00:00Z",
          event_type: "approval.approved",
          id: "receipt-1",
          integrity: {
            algorithm: "sha256",
            canonical_fields: ["id"],
            digest:
              "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            digest_input_version: "startup-office-receipt.v1",
            signed: false,
            signed_note:
              "Digest is deterministic; external signing can be layered on this canonical payload.",
            version: "startup-office-receipt-integrity.v1",
          },
          run_id: "run-1",
          summary: "Founder approved the validation draft.",
          trace: {},
        },
      ],
      run: {
        id: "run-1",
        status: "completed",
        title: "Idea Validation",
      },
    });
  });

  it("reads Startup Office receipts and opens the run receipt trace", async () => {
    const user = userEvent.setup();
    renderReceiptsApp();

    expect(
      await screen.findByText("A Startup Office ledger of runs, approvals, memory changes, and cost traces."),
    ).toBeInTheDocument();
    expect(startupOfficeMocks.getStartupOfficeReceipts).toHaveBeenCalledWith({
      limit: 100,
    });
    expect(await screen.findByText("approval.approved")).toBeInTheDocument();
    expect(screen.getByText("ceo")).toBeInTheDocument();
    expect(screen.getByText("1.2k")).toBeInTheDocument();
    expect(screen.getByText("$0.0300")).toBeInTheDocument();

    await user.click(screen.getByText("approval.approved"));

    await waitFor(() =>
      expect(startupOfficeMocks.getStartupOfficeRun).toHaveBeenCalledWith(
        "run-1",
      ),
    );
    expect(
      await screen.findByText("Receipts attached to this Startup Office run."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Founder approved the validation draft."),
    ).toBeInTheDocument();
    expect(screen.getByText("Digest")).toBeInTheDocument();
    expect(screen.getByText("0123456789ab...89abcdef")).toBeInTheDocument();
    expect(screen.getByText("Unsigned")).toBeInTheDocument();
  });
});
