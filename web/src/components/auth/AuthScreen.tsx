import { type FormEvent, useEffect, useState } from "react";

import {
  type AuthSessionResponse,
  getTeams,
  login,
  signup,
  type WorkspaceTeam,
} from "../../api/client";

interface AuthScreenProps {
  onAuthenticated: (session: AuthSessionResponse) => void;
}

type AuthMode = "login" | "signup";
type TeamAction = "create" | "join";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The MVP keeps this short auth form colocated.
export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [teamAction, setTeamAction] = useState<TeamAction>("create");
  const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [teamName, setTeamName] = useState("My Team");
  const [inviteToken, setInviteToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTeams()
      .then((response) => {
        if (!cancelled) setTeams(response.teams ?? []);
      })
      .catch(() => {
        if (!cancelled) setTeams([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result =
        mode === "login"
          ? await login({ email: email.trim(), password })
          : await signup({
              email: email.trim(),
              name: name.trim(),
              password,
              team_action: teamAction,
              team_name: teamName.trim(),
              invite_token: inviteToken.trim(),
            });
      onAuthenticated({
        authenticated: true,
        user: result.user,
        team: result.team,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    email.trim() !== "" &&
    password.length >= 8 &&
    (mode === "login" ||
      (name.trim() !== "" &&
        (teamAction === "create"
          ? teamName.trim() !== ""
          : inviteToken.trim() !== "")));

  return (
    <main className="auth-page">
      <section className="auth-shell" aria-label="WUPHF sign in">
        <div className="auth-copy">
          <div className="auth-kicker">WUPHF workspace</div>
          <h1>Team access</h1>
          <p>
            Sign in to your local office, or create an account and choose a team
            before entering the workspace.
          </p>
          {teams.length > 0 ? (
            <ul className="auth-team-list" aria-label="Existing teams">
              {teams.slice(0, 4).map((team) => (
                <li key={team.id}>{team.name}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <form className="auth-panel" onSubmit={handleSubmit}>
          <div className="auth-tabs" role="tablist" aria-label="Auth mode">
            <button
              type="button"
              className={mode === "signup" ? "active" : ""}
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              Log in
            </button>
          </div>

          {mode === "signup" ? (
            <div className="auth-tabs auth-tabs-secondary" role="tablist">
              <button
                type="button"
                className={teamAction === "create" ? "active" : ""}
                onClick={() => setTeamAction("create")}
              >
                New team
              </button>
              <button
                type="button"
                className={teamAction === "join" ? "active" : ""}
                onClick={() => setTeamAction("join")}
              >
                Join by invite
              </button>
            </div>
          ) : null}

          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="you@company.com"
            />
          </div>

          {mode === "signup" ? (
            <div className="auth-field">
              <label htmlFor="auth-name">Name</label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="Your name"
              />
            </div>
          ) : null}

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder="At least 8 characters"
            />
          </div>

          {mode === "signup" && teamAction === "create" ? (
            <div className="auth-field">
              <label htmlFor="auth-team-name">Team name</label>
              <input
                id="auth-team-name"
                type="text"
                value={teamName}
                onChange={(event) => setTeamName(event.currentTarget.value)}
                placeholder="Team name"
              />
            </div>
          ) : null}

          {mode === "signup" && teamAction === "join" ? (
            <div className="auth-field">
              <label htmlFor="auth-invite-token">Invite token</label>
              <input
                id="auth-invite-token"
                type="text"
                value={inviteToken}
                onChange={(event) => setInviteToken(event.currentTarget.value)}
                placeholder="Paste invite token or open invite link"
              />
            </div>
          ) : null}

          {error ? <div className="auth-error">{error}</div> : null}

          <button
            className="auth-submit"
            type="submit"
            disabled={!canSubmit || busy}
          >
            {busy
              ? "Working..."
              : mode === "login"
                ? "Log in"
                : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}
