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

  it("frames signup as a focused LAF-Office entry surface", async () => {
    render(<AuthScreen onAuthenticated={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Create your account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Project setup" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "LAF-Office",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/create a project team to continue/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create a project team/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Join by invite/i }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText(/AI office/i)).not.toBeInTheDocument();
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
      screen.queryByRole("heading", { name: "Project setup" }),
    ).not.toBeInTheDocument();
  });
});
