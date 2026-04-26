import { type FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { createInvite, getInvites, type TeamInvite } from "../../api/client";
import { showNotice } from "../ui/Toast";

interface HumanInviteModalProps {
  open: boolean;
  onClose: () => void;
}

export function HumanInviteModal({ open, onClose }: HumanInviteModalProps) {
  const queryClient = useQueryClient();
  const baseURL = window.location.origin;
  const { data } = useQuery({
    queryKey: ["human-invites", baseURL],
    queryFn: () => getInvites(baseURL),
    enabled: open,
  });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<TeamInvite | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createInvite({
        email: trimmedEmail,
        name: name.trim(),
        base_url: baseURL,
      });
      setCreated(result.invite);
      setEmail("");
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["human-invites"] });
      showNotice(
        result.email_sent ? "Invite email sent" : "Invite link created",
        "success",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invite failed";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite(invite: TeamInvite) {
    const link = invite.invite_url ?? "";
    if (!link) return;
    await navigator.clipboard.writeText(link);
    showNotice("Invite link copied", "success");
  }

  const pending = (data?.invites ?? []).filter((invite) => {
    return invite.status === "pending";
  });
  const humans = data?.human_members ?? [];
  const visibleCreated = created ?? null;

  return (
    <div className="human-invite-overlay" onMouseDown={onClose}>
      <div
        className="human-invite-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="human-invite-header">
          <div>
            <div className="human-invite-kicker">People</div>
            <h2>Invite teammate</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <form className="human-invite-form" onSubmit={handleSubmit}>
          <label htmlFor="human-invite-email">Email</label>
          <input
            id="human-invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            placeholder="teammate@company.com"
          />
          <label htmlFor="human-invite-name">Name</label>
          <input
            id="human-invite-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="Optional"
          />
          <button type="submit" disabled={busy || email.trim() === ""}>
            {busy ? "Sending..." : "Send invite"}
          </button>
        </form>

        {error ? <div className="human-invite-error">{error}</div> : null}

        {visibleCreated ? (
          <div className="human-invite-result">
            <div>
              <strong>{visibleCreated.email}</strong>
              <span>
                {visibleCreated.send_status === "sent"
                  ? "Email sent"
                  : "SMTP not configured. Share the link manually."}
              </span>
            </div>
            <button type="button" onClick={() => copyInvite(visibleCreated)}>
              Copy link
            </button>
            {visibleCreated.mailto_url ? (
              <a href={visibleCreated.mailto_url}>Open email</a>
            ) : null}
          </div>
        ) : null}

        <div className="human-invite-lists">
          <section>
            <h3>Pending</h3>
            {pending.length === 0 ? (
              <p>No pending invites</p>
            ) : (
              pending.slice(0, 5).map((invite) => (
                <div className="human-invite-row" key={invite.id}>
                  <span>{invite.email}</span>
                  <button type="button" onClick={() => copyInvite(invite)}>
                    Copy
                  </button>
                </div>
              ))
            )}
          </section>
          <section>
            <h3>Joined</h3>
            {humans.length === 0 ? (
              <p>No people yet</p>
            ) : (
              humans.slice(0, 5).map((human) => (
                <div className="human-invite-row" key={human.id}>
                  <span>{human.name || human.email}</span>
                  <small>{human.email}</small>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
