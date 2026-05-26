import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { InviteAcceptPage } from "./InviteAcceptPage";

const apiMocks = vi.hoisted(() => ({
  lookupInvite: vi.fn(),
  signup: vi.fn(),
}));

vi.mock("../../api/client", () => apiMocks);

describe("InviteAcceptPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ language: "en" });
    apiMocks.lookupInvite.mockResolvedValue({
      invite: {
        email: "founder@example.com",
        id: "invite-1",
        name: "Founder",
        role: "admin",
        status: "pending",
      },
    });
    apiMocks.signup.mockResolvedValue({
      authenticated: true,
      team: { id: "team-1", name: "LAF Labs" },
      user: { email: "founder@example.com", id: "user-1", name: "Founder" },
    });
  });

  it("accepts an invite and joins the workspace", async () => {
    const user = userEvent.setup();
    render(<InviteAcceptPage token="invite-token-1" />);

    expect(await screen.findByText("founder@example.com")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "New Founder");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(apiMocks.signup).toHaveBeenCalledWith({
        email: "founder@example.com",
        invite_token: "invite-token-1",
        name: "New Founder",
        password: "password123",
        team_action: "join",
      });
    });
    expect(await screen.findByText("Open workspace")).toBeInTheDocument();
  });
});
