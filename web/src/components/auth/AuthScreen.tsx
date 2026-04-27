import { type FormEvent, useState } from "react";

import { type AuthSessionResponse, login, signup } from "../../api/client";
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
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [teamName, setTeamName] = useState("My Team");
  const [inviteToken, setInviteToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const isSignup = mode === "signup";

  return (
    <main className="auth-page">
      <label className="auth-language">
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

      <section className="auth-shell" aria-label={t("auth.aria")}>
        <div className="auth-copy">
          <div className="auth-brand-mark" aria-hidden="true">
            LAF
          </div>
          <div className="auth-kicker">{t("auth.kicker")}</div>
          <h1>{t("auth.title")}</h1>
          <p>{t("auth.desc")}</p>
        </div>

        <form className="auth-panel" onSubmit={handleSubmit}>
          <div className="auth-panel-header">
            <span>{isSignup ? t("auth.signup") : t("auth.login")}</span>
            <h2>
              {isSignup ? t("auth.createAccountTitle") : t("auth.loginTitle")}
            </h2>
            <p>
              {isSignup ? t("auth.createAccountDesc") : t("auth.loginDesc")}
            </p>
          </div>

          <section className="auth-form-section">
            <h3>{t("auth.accountSection")}</h3>
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

            {isSignup ? (
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
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                placeholder={t("auth.passwordHint")}
              />
            </div>
          </section>

          {isSignup ? (
            <section className="auth-form-section">
              <div className="auth-section-heading">
                <h3>{t("auth.workspaceSection")}</h3>
                <p>{t("auth.workspaceDesc")}</p>
              </div>

              <div className="auth-choice-list">
                <button
                  type="button"
                  className={teamAction === "create" ? "active" : ""}
                  aria-pressed={teamAction === "create"}
                  onClick={() => setTeamAction("create")}
                >
                  <span>{t("auth.createWorkspace")}</span>
                  <small>{t("auth.createWorkspaceDesc")}</small>
                </button>
                <button
                  type="button"
                  className={teamAction === "join" ? "active" : ""}
                  aria-pressed={teamAction === "join"}
                  onClick={() => setTeamAction("join")}
                >
                  <span>{t("auth.joinWorkspace")}</span>
                  <small>{t("auth.joinWorkspaceDesc")}</small>
                </button>
              </div>

              {teamAction === "create" ? (
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
              ) : (
                <div className="auth-field">
                  <label htmlFor="auth-invite-token">
                    {t("auth.inviteToken")}
                  </label>
                  <input
                    id="auth-invite-token"
                    type="text"
                    value={inviteToken}
                    onChange={(event) =>
                      setInviteToken(event.currentTarget.value)
                    }
                    placeholder={t("auth.inviteTokenHint")}
                  />
                </div>
              )}
            </section>
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

          <div className="auth-mode-switch">
            <span>
              {isSignup
                ? t("auth.switchToLoginPrompt")
                : t("auth.switchToSignupPrompt")}
            </span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode(isSignup ? "login" : "signup");
              }}
            >
              {isSignup ? t("auth.login") : t("auth.signup")}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
