import { type FormEvent, useEffect, useState } from "react";

import { lookupInvite, signup, type TeamInvite } from "../../api/client";
import { useI18n } from "../../lib/i18n";

interface InviteAcceptPageProps {
  token: string;
}

export function InviteAcceptPage({ token }: InviteAcceptPageProps) {
  const { t } = useI18n();
  const [invite, setInvite] = useState<TeamInvite | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "done" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    lookupInvite(token)
      .then((response) => {
        if (cancelled) return;
        setInvite(response.invite);
        setName(response.invite.name ?? "");
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(err instanceof Error ? err.message : t("invite.notFound"));
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!(invite && trimmed) || password.length < 8) return;
    setMessage("");
    try {
      await signup({
        email: invite.email,
        name: trimmed,
        password,
        team_action: "join",
        invite_token: token,
      });
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : t("invite.acceptFailed"));
    }
  }

  return (
    <main className="invite-page">
      <section className="invite-card">
        <div className="invite-kicker">{t("invite.kicker")}</div>
        <h1>{t("invite.title")}</h1>
        {status === "loading" ? (
          <p className="invite-muted">{t("invite.checking")}</p>
        ) : status === "done" ? (
          <>
            <p className="invite-muted">{t("invite.done")}</p>
            <a className="invite-primary" href="/">
              {t("invite.openOffice")}
            </a>
          </>
        ) : (
          <>
            {invite ? (
              <div className="invite-summary">
                <span>{invite.email}</span>
                {invite.role ? <span>{invite.role}</span> : null}
              </div>
            ) : null}
            {status === "error" && message ? (
              <p className="invite-error">{message}</p>
            ) : null}
            <form onSubmit={handleSubmit} className="invite-form">
              <label htmlFor="invite-name">{t("auth.name")}</label>
              <input
                id="invite-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder={t("auth.yourName")}
              />
              <label htmlFor="invite-password">{t("auth.password")}</label>
              <input
                id="invite-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                placeholder={t("auth.passwordHint")}
              />
              <button
                type="submit"
                className="invite-primary"
                disabled={
                  name.trim() === "" ||
                  password.length < 8 ||
                  status === "error"
                }
              >
                {t("auth.createAccount")}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
