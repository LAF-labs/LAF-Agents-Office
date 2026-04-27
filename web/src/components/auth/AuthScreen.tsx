import { type FormEvent, useEffect, useState } from "react";

import {
  type AuthSessionResponse,
  getTeams,
  login,
  signup,
  type WorkspaceTeam,
} from "../../api/client";
import { useI18n } from "../../lib/i18n";
import { useAppStore } from "../../stores/app";

interface AuthScreenProps {
  onAuthenticated: (session: AuthSessionResponse) => void;
}

type AuthMode = "login" | "signup";
type TeamAction = "create" | "join";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The MVP keeps this short auth form colocated.
export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const { language, t } = useI18n();
  const setLanguage = useAppStore((s) => s.setLanguage);
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
      setError(err instanceof Error ? err.message : t("auth.failed"));
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
      <section className="auth-shell" aria-label={t("auth.aria")}>
        <div className="auth-copy">
          <div className="auth-kicker">{t("auth.kicker")}</div>
          <h1>{t("auth.title")}</h1>
          <p>{t("auth.desc")}</p>
          {teams.length > 0 ? (
            <ul className="auth-team-list" aria-label={t("auth.existingTeams")}>
              {teams.slice(0, 4).map((team) => (
                <li key={team.id}>{team.name}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <form className="auth-panel" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>{t("settings.general.languageLabel")}</span>
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.currentTarget.value === "ko" ? "ko" : "en")
              }
            >
              <option value="en">{t("language.english")}</option>
              <option value="ko">{t("language.korean")}</option>
            </select>
          </label>

          <div className="auth-tabs" role="tablist" aria-label={t("auth.mode")}>
            <button
              type="button"
              className={mode === "signup" ? "active" : ""}
              onClick={() => setMode("signup")}
            >
              {t("auth.signup")}
            </button>
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              {t("auth.login")}
            </button>
          </div>

          {mode === "signup" ? (
            <div className="auth-tabs auth-tabs-secondary" role="tablist">
              <button
                type="button"
                className={teamAction === "create" ? "active" : ""}
                onClick={() => setTeamAction("create")}
              >
                {t("auth.newTeam")}
              </button>
              <button
                type="button"
                className={teamAction === "join" ? "active" : ""}
                onClick={() => setTeamAction("join")}
              >
                {t("auth.joinByInvite")}
              </button>
            </div>
          ) : null}

          <div className="auth-field">
            <label htmlFor="auth-email">{t("auth.email")}</label>
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
              <label htmlFor="auth-name">{t("auth.name")}</label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder={t("auth.yourName")}
              />
            </div>
          ) : null}

          <div className="auth-field">
            <label htmlFor="auth-password">{t("auth.password")}</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder={t("auth.passwordHint")}
            />
          </div>

          {mode === "signup" && teamAction === "create" ? (
            <div className="auth-field">
              <label htmlFor="auth-team-name">{t("auth.teamName")}</label>
              <input
                id="auth-team-name"
                type="text"
                value={teamName}
                onChange={(event) => setTeamName(event.currentTarget.value)}
                placeholder={t("auth.teamName")}
              />
            </div>
          ) : null}

          {mode === "signup" && teamAction === "join" ? (
            <div className="auth-field">
              <label htmlFor="auth-invite-token">{t("auth.inviteToken")}</label>
              <input
                id="auth-invite-token"
                type="text"
                value={inviteToken}
                onChange={(event) => setInviteToken(event.currentTarget.value)}
                placeholder={t("auth.inviteTokenHint")}
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
              ? t("auth.working")
              : mode === "login"
                ? t("auth.login")
                : t("auth.createAccount")}
          </button>
        </form>
      </section>
    </main>
  );
}
