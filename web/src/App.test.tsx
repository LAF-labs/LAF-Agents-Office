import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { useAppStore } from "./stores/app";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAuthSession: vi.fn(),
  initApi: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("./api/client", () => apiMocks);

vi.mock("./hooks/useBrokerEvents", () => ({ useBrokerEvents: vi.fn() }));
vi.mock("./hooks/useHashRouter", () => ({ useHashRouter: vi.fn() }));
vi.mock("./hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock("./components/auth/AuthScreen", () => ({
  AuthScreen: ({
    onAuthenticated,
  }: {
    onAuthenticated: (session: unknown) => void;
  }) => (
    <button
      data-testid="auth-screen"
      type="button"
      onClick={() =>
        onAuthenticated({
          authenticated: true,
          user: { email: "fresh@example.com" },
          team: { id: "team-fresh", name: "Fresh Team" },
        })
      }
    >
      mock auth
    </button>
  ),
}));
vi.mock("./components/invites/InviteAcceptPage", () => ({
  InviteAcceptPage: () => <div data-testid="invite-page" />,
}));
vi.mock("./components/layout/Shell", () => ({
  Shell: () => <div data-testid="shell" />,
}));
vi.mock("./components/workspace/WorkspaceApp", () => ({
  default: () => <div data-testid="shell" />,
}));
vi.mock("./components/onboarding/SplashScreen", () => ({
  SplashScreen: () => <div data-testid="splash" />,
}));
vi.mock("./components/onboarding/Wizard", () => ({
  Wizard: () => <div data-testid="wizard" />,
}));
vi.mock("./components/ui/ConfirmDialog", () => ({
  ConfirmHost: () => null,
}));
vi.mock("./components/ui/ProviderSwitcher", () => ({
  ProviderSwitcherHost: () => null,
}));
vi.mock("./components/ui/Toast", () => ({
  ToastContainer: () => null,
}));

describe("App auth and onboarding gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState(null, "", "/");
    useAppStore.setState({
      onboardingComplete: false,
      currentChannel: "general",
      currentApp: null,
      channelMeta: {},
    });
    apiMocks.initApi.mockResolvedValue(undefined);
    apiMocks.get.mockResolvedValue({ onboarded: false });
  });

  it("does not carry stale onboarding completion into an authenticated session", async () => {
    useAppStore.setState({ onboardingComplete: true });
    apiMocks.getAuthSession.mockResolvedValue({
      authenticated: true,
      user: { email: "fresh@example.com" },
      team: { id: "team-fresh", name: "Fresh Team" },
    });

    render(<App />);

    expect(await screen.findByTestId("wizard")).toBeInTheDocument();
    expect(screen.queryByTestId("shell")).not.toBeInTheDocument();
  });

  it("rechecks onboarding after signup instead of entering the old main surface", async () => {
    useAppStore.setState({ onboardingComplete: true });
    apiMocks.getAuthSession.mockResolvedValue({ authenticated: false });

    render(<App />);
    await userEvent.click(await screen.findByTestId("auth-screen"));

    await waitFor(() => {
      expect(screen.getByTestId("wizard")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("shell")).not.toBeInTheDocument();
  });

  it("drops the in-memory auth session when the workspace is shredded", async () => {
    useAppStore.setState({ onboardingComplete: true });
    apiMocks.getAuthSession.mockResolvedValue({
      authenticated: true,
      user: { email: "founder@example.com" },
      team: { id: "team-old", name: "Old Team" },
    });
    apiMocks.get.mockResolvedValue({ onboarded: true });

    render(<App />);
    expect(await screen.findByTestId("shell")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("laf-office:workspace-shredded"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-screen")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("shell")).not.toBeInTheDocument();
    expect(useAppStore.getState().onboardingComplete).toBe(false);
  });
});
