import { type FormEvent, useEffect, useState } from "react";

import { lookupInvite, signup, type TeamInvite } from "../../api/client";
import { useI18n } from "../../lib/i18n";

interface InviteAcceptPageProps {
  token: string;
}

type InviteStatus = "loading" | "ready" | "done" | "error";

export function InviteAcceptPage({ token }: InviteAcceptPageProps) {
  const { t } = useI18n();
  const [invite, setInvite] = useState<TeamInvite | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<InviteStatus>("loading");
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
      const result = await signup({
        email: invite.email,
        name: trimmed,
        password,
        team_action: "join",
        invite_token: token,
      });
      if (
        result.authenticated === false ||
        result.email_confirmation_required
      ) {
        setMessage(t("auth.checkEmail"));
      }
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
        <InviteAcceptContent
          invite={invite}
          message={message}
          name={name}
          password={password}
          status={status}
          onNameChange={setName}
          onPasswordChange={setPassword}
          onSubmit={handleSubmit}
        />
      </section>
    </main>
  );
}

function InviteAcceptContent({
  invite,
  message,
  name,
  password,
  status,
  onNameChange,
  onPasswordChange,
  onSubmit,
}: {
  invite: TeamInvite | null;
  message: string;
  name: string;
  password: string;
  status: InviteStatus;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useI18n();
  if (status === "loading") {
    return <p className="invite-muted">{t("invite.checking")}</p>;
  }
  if (status === "done") return <InviteDone message={message} />;
  return (
    <>
      <InviteSummary invite={invite} />
      {status === "error" && message ? (
        <p className="invite-error">{message}</p>
      ) : null}
      <InviteForm
        disabled={status === "error"}
        name={name}
        password={password}
        onNameChange={onNameChange}
        onPasswordChange={onPasswordChange}
        onSubmit={onSubmit}
      />
    </>
  );
}

function InviteDone({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <>
      <p className="invite-muted">{t("invite.done")}</p>
      {message ? <p className="invite-muted">{message}</p> : null}
      <a className="invite-primary" href="/">
        {t("invite.openOffice")}
      </a>
    </>
  );
}

function InviteSummary({ invite }: { invite: TeamInvite | null }) {
  if (!invite) return null;
  return (
    <div className="invite-summary">
      <span>{invite.email}</span>
      {invite.role ? <span>{invite.role}</span> : null}
    </div>
  );
}

function InviteForm({
  disabled,
  name,
  password,
  onNameChange,
  onPasswordChange,
  onSubmit,
}: {
  disabled: boolean;
  name: string;
  password: string;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useI18n();
  const submitDisabled = disabled || name.trim() === "" || password.length < 8;
  return (
    <form onSubmit={onSubmit} className="invite-form">
      <label htmlFor="invite-name">{t("auth.name")}</label>
      <input
        id="invite-name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(event) => onNameChange(event.currentTarget.value)}
        placeholder={t("auth.yourName")}
      />
      <label htmlFor="invite-password">{t("auth.password")}</label>
      <input
        id="invite-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => onPasswordChange(event.currentTarget.value)}
        placeholder={t("auth.passwordHint")}
      />
      <button
        type="submit"
        className="invite-primary"
        disabled={submitDisabled}
      >
        {t("auth.createAccount")}
      </button>
    </form>
  );
}
