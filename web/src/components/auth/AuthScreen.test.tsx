import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { AuthScreen } from "./AuthScreen";

vi.mock("../../api/client", async () => {
  const actual =
    await vi.importActual<typeof import("../../api/client")>(
      "../../api/client",
    );
  return {
    ...actual,
    login: vi.fn(),
    signup: vi.fn(),
  };
});

describe("AuthScreen", () => {
  beforeEach(() => {
    useAppStore.setState({ language: "en" });
  });

  it("separates account details from workspace setup on signup", async () => {
    render(<AuthScreen onAuthenticated={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Create your account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Workspace setup" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create a workspace/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Join with an invite/i }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Existing teams")).not.toBeInTheDocument();
    });
  });

  it("hides workspace setup on login", async () => {
    render(<AuthScreen onAuthenticated={vi.fn()} />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Log in" }));

    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Workspace setup" }),
    ).not.toBeInTheDocument();
  });
});
