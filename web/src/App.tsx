import {
  Component,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  type AuthSessionResponse,
  get,
  getAuthSession,
  initApi,
} from "./api/client";
import { AuthScreen } from "./components/auth/AuthScreen";
import { useAppStore } from "./stores/app";
import "./styles/shadcn.css";
import "./styles/global.css";
import "./styles/auth.css";

const InviteAcceptPage = lazy(() =>
  import("./components/invites/InviteAcceptPage").then((module) => ({
    default: module.InviteAcceptPage,
  })),
);
const SplashScreen = lazy(() =>
  import("./components/onboarding/SplashScreen").then((module) => ({
    default: module.SplashScreen,
  })),
);
const Wizard = lazy(() =>
  import("./components/onboarding/Wizard").then((module) => ({
    default: module.Wizard,
  })),
);
const WorkspaceApp = lazy(() => import("./components/workspace/WorkspaceApp"));

// ── Error boundary ─────────────────────────────────────────────

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error("[LAF-Office ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          data-testid="error-boundary"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "#fee",
            color: "#900",
            padding: 20,
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 13,
            overflowY: "auto",
            zIndex: 9999,
          }}
        >
          <h2 style={{ margin: "0 0 8px 0", fontSize: 14 }}>
            Something broke in the UI
          </h2>
          <pre
            style={{
              margin: "8px 0 0",
              fontFamily: "SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              whiteSpace: "pre-wrap",
            }}
          >
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 12,
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppLoadingFallback() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-tertiary)",
        fontSize: 14,
      }}
    >
      Loading...
    </div>
  );
}

// ── App root ────────────────────────────────────────────────────
//
// Critical rules (violations caused the blank-page regression):
// 1. ALL hooks are called unconditionally at the top of App(). No early
//    returns before hook calls.
// 2. initApi() runs in an effect, but we render the shell immediately so
//    the user sees something even while init is pending.
// 3. ErrorBoundary wraps the whole tree so render errors are visible.

export default function App() {
  // --- All hooks first, in a fixed order, every render ---
  const [apiReady, setApiReady] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSessionResponse>({
    authenticated: false,
  });
  const [showSplash, setShowSplash] = useState(false);
  const theme = useAppStore((s) => s.theme);
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);
  const setBrokerConnected = useAppStore((s) => s.setBrokerConnected);
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  const resetForOnboarding = useAppStore((s) => s.resetForOnboarding);
  const inviteToken = window.location.pathname.startsWith("/invite/")
    ? decodeURIComponent(window.location.pathname.replace(/^\/invite\//, ""))
    : "";

  const loadOnboardingState = useCallback(async () => {
    try {
      const s = await get<{ onboarded?: boolean }>("/onboarding/state");
      setOnboardingComplete(s.onboarded === true);
    } catch {
      setOnboardingComplete(false);
    }
  }, [setOnboardingComplete]);

  const handleAuthenticated = useCallback(
    (session: AuthSessionResponse) => {
      resetForOnboarding();
      setAuthSession(session);
      if (session.authenticated) {
        void loadOnboardingState();
      }
    },
    [loadOnboardingState, resetForOnboarding],
  );

  useEffect(() => {
    const handleWorkspaceShredded = () => {
      resetForOnboarding();
      setShowSplash(false);
      setAuthSession({ authenticated: false });
    };
    window.addEventListener(
      "laf-office:workspace-shredded",
      handleWorkspaceShredded,
    );
    return () => {
      window.removeEventListener(
        "laf-office:workspace-shredded",
        handleWorkspaceShredded,
      );
    };
  }, [resetForOnboarding]);

  // Load theme CSS when theme changes
  useEffect(() => {
    if (import.meta.env.MODE === "test" || import.meta.env.VITEST) return;
    const existing = document.getElementById(
      "theme-css",
    ) as HTMLLinkElement | null;
    if (existing) {
      existing.href = `/themes/${theme}.css`;
    } else {
      const el = document.createElement("link");
      el.id = "theme-css";
      el.rel = "stylesheet";
      el.href = `/themes/${theme}.css`;
      document.head.appendChild(el);
    }
  }, [theme]);

  // Init API and determine onboarding state.
  // Source of truth: GET /onboarding/state.onboarded (backed by ~/.laf-office/onboarded.json).
  // Broker health / default agents must not skip the wizard — the broker seeds 7
  // default agents on every boot, so a health-based check was making the wizard
  // permanently unreachable for fresh installs.
  useEffect(() => {
    let cancelled = false;
    initApi()
      .then(() => {
        if (cancelled) return;
        setBrokerConnected(true);
        return getAuthSession();
      })
      .then((session) => {
        if (cancelled || !session) return null;
        setAuthSession(session);
        if (!session.authenticated) {
          setOnboardingComplete(false);
          return null;
        }
        return get<{ onboarded?: boolean }>("/onboarding/state");
      })
      .then((s) => {
        if (cancelled || !s) return;
        setOnboardingComplete(s.onboarded === true);
      })
      .catch(() => {
        // Endpoint unreachable — fall through to wizard. Safer default for
        // fresh installs where the broker may not have mounted onboarding yet.
        if (!cancelled) {
          setOnboardingComplete(false);
        }
      })
      .finally(() => {
        if (!cancelled) setApiReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setBrokerConnected, setOnboardingComplete]);

  // --- Render (no hooks past this point) ---

  let body: ReactNode;
  if (!apiReady) {
    // The static skeleton in index.html already covers this case, but
    // render a matching React fallback so nothing flashes.
    body = (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-tertiary)",
          fontSize: 14,
        }}
      >
        Connecting to broker...
      </div>
    );
  } else if (inviteToken) {
    body = <InviteAcceptPage token={inviteToken} />;
  } else if (!authSession.authenticated) {
    body = <AuthScreen onAuthenticated={handleAuthenticated} />;
  } else if (showSplash) {
    body = <SplashScreen onDone={() => setShowSplash(false)} />;
  } else if (!onboardingComplete) {
    body = (
      <Wizard
        onComplete={() => {
          setShowSplash(true);
        }}
      />
    );
  } else {
    body = (
      <WorkspaceApp
        userEmail={authSession.user?.email}
        onLoggedOut={() => {
          setAuthSession({ authenticated: false });
        }}
      />
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<AppLoadingFallback />}>{body}</Suspense>
    </ErrorBoundary>
  );
}
