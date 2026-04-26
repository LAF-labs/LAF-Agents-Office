import { type FormEvent, useEffect, useState } from "react";

import { lookupInvite, signup, type TeamInvite } from "../../api/client";

interface InviteAcceptPageProps {
  token: string;
}

export function InviteAcceptPage({ token }: InviteAcceptPageProps) {
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
        setMessage(err instanceof Error ? err.message : "Invite not found");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

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
      setMessage(
        err instanceof Error ? err.message : "Could not accept invite",
      );
    }
  }

  return (
    <main className="invite-page">
      <section className="invite-card">
        <div className="invite-kicker">WUPHF invite</div>
        <h1>Join the office</h1>
        {status === "loading" ? (
          <p className="invite-muted">Checking invite...</p>
        ) : status === "done" ? (
          <>
            <p className="invite-muted">
              You're in. Open the WUPHF office tab to start working with the
              team.
            </p>
            <a className="invite-primary" href="/">
              Open office
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
              <label htmlFor="invite-name">Name</label>
              <input
                id="invite-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="Your name"
              />
              <label htmlFor="invite-password">Password</label>
              <input
                id="invite-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                placeholder="At least 8 characters"
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
                Create account
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
