import {
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building,
  Copy,
  Key,
  PeopleTag,
  Refresh,
  SendMail,
  Settings as SettingsIcon,
  WarningTriangle,
} from "iconoir-react";

import {
  type AuthUser,
  type ConfigSnapshot,
  type ConfigUpdate,
  createInvite,
  getAuthSession,
  getAuthUsers,
  getConfig,
  getInvites,
  resetWorkspace,
  shredWorkspace,
  updateAuthUserRole,
  updateConfig,
  type WorkspaceWipeResult,
} from "../../api/client";
import { useI18n } from "../../lib/i18n";
import { useAppStore } from "../../stores/app";
import { showNotice } from "../ui/Toast";

type SectionId = "general" | "team" | "company" | "keys" | "danger";

interface Section {
  id: SectionId;
  Icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  nameKey:
    | "settings.section.general"
    | "settings.section.team"
    | "settings.section.company"
    | "settings.section.keys"
    | "settings.section.danger";
}

interface SectionGroup {
  labelKey:
    | "settings.group.workspace"
    | "settings.group.credentials"
    | "settings.group.system"
    | "settings.group.advanced";
  items: Section[];
}

const SECTION_GROUPS: SectionGroup[] = [
  {
    labelKey: "settings.group.workspace",
    items: [
      {
        id: "general",
        Icon: SettingsIcon,
        nameKey: "settings.section.general",
      },
      { id: "team", Icon: PeopleTag, nameKey: "settings.section.team" },
      { id: "company", Icon: Building, nameKey: "settings.section.company" },
    ],
  },
  {
    labelKey: "settings.group.credentials",
    items: [{ id: "keys", Icon: Key, nameKey: "settings.section.keys" }],
  },
  {
    labelKey: "settings.group.advanced",
    items: [
      {
        id: "danger",
        Icon: WarningTriangle,
        nameKey: "settings.section.danger",
      },
    ],
  },
];

// ─── Styles ─────────────────────────────────────────────────────────────

const styles = {
  shell: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    alignItems: "flex-start",
  } as const,
  nav: {
    width: 260,
    flexShrink: 0,
    padding: "14px 12px",
    position: "sticky" as const,
    top: 0,
    maxHeight: "100vh",
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
    background: "var(--bg-card)",
  } as const,
  navGroupLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "var(--text-tertiary)",
    margin: "0 0 4px 10px",
  } as const,
  navItem: (active: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    fontSize: 12,
    borderRadius: 6,
    color: active ? "var(--text)" : "var(--text-secondary)",
    cursor: "pointer",
    border: "none",
    background: active ? "rgba(0, 0, 0, 0.06)" : "transparent",
    width: "100%",
    textAlign: "left" as const,
    fontFamily: "var(--font-sans)",
    fontWeight: active ? 600 : 400,
    transition: "all 0.15s",
  }),
  navIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
    strokeWidth: 2,
  } as const,
  body: {
    flex: 1,
    padding: "24px 32px",
    maxWidth: 680,
  } as const,
  sectionTitle: { fontSize: 18, fontWeight: 700, marginBottom: 4 } as const,
  sectionDesc: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 20,
    lineHeight: 1.5,
  } as const,
  banner: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 14px",
    marginBottom: 16,
    background: "var(--yellow-bg)",
    borderRadius: "var(--radius-md)",
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text)",
  } as const,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  } as const,
  rowLabel: { width: 160, flexShrink: 0, paddingTop: 8 } as const,
  rowLabelName: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text)",
  } as const,
  rowLabelHint: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    marginTop: 2,
  } as const,
  rowField: { flex: 1, minWidth: 0 } as const,
  input: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    borderRadius: "var(--radius-sm)",
    height: 36,
    fontSize: 13,
    padding: "0 10px",
    outline: "none",
    width: "100%",
    fontFamily: "var(--font-sans)",
  } as const,
  textarea: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    borderRadius: "var(--radius-sm)",
    minHeight: 60,
    fontSize: 13,
    padding: "8px 10px",
    outline: "none",
    width: "100%",
    fontFamily: "var(--font-sans)",
    lineHeight: 1.5,
    resize: "vertical" as const,
  },
  keyStatus: (set: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    fontSize: 11,
    fontWeight: 500,
    padding: "2px 8px",
    borderRadius: "var(--radius-full)",
    whiteSpace: "nowrap" as const,
    background: set ? "var(--green-bg)" : "var(--bg-warm)",
    color: set ? "var(--green)" : "var(--text-tertiary)",
  }),
  saveRow: {
    display: "flex",
    gap: 8,
    marginTop: 20,
    paddingTop: 16,
    borderTop: "1px solid var(--border-light)",
  } as const,
  filePath: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-tertiary)",
    padding: "6px 10px",
    background: "var(--bg-warm)",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border-light)",
    userSelect: "all" as const,
    wordBreak: "break-all" as const,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 12,
  } as const,
  th: {
    textAlign: "left" as const,
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "var(--text-tertiary)",
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
  } as const,
  td: {
    padding: "6px 8px",
    borderBottom: "1px solid var(--border-light)",
    verticalAlign: "top" as const,
  } as const,
  tdFlag: {
    padding: "6px 8px",
    borderBottom: "1px solid var(--border-light)",
    verticalAlign: "top" as const,
    fontFamily: "var(--font-mono)",
    color: "var(--accent)",
    whiteSpace: "nowrap" as const,
  } as const,
  tdDesc: {
    padding: "6px 8px",
    borderBottom: "1px solid var(--border-light)",
    verticalAlign: "top" as const,
    color: "var(--text-secondary)",
  } as const,
  groupTitle: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "var(--text-tertiary)",
    marginBottom: 10,
    paddingBottom: 6,
    borderBottom: "1px solid var(--border-light)",
  } as const,
  emptyState: {
    border: "1px solid var(--border-light)",
    borderRadius: 6,
    background: "var(--bg-warm)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
    padding: "12px 14px",
    marginBottom: 20,
  } as const,
};

// ─── Small components ───────────────────────────────────────────────────

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <div style={styles.row}>
      <div style={styles.rowLabel}>
        <div style={styles.rowLabelName}>{label}</div>
        {hint ? <div style={styles.rowLabelHint}>{hint}</div> : null}
      </div>
      <div style={styles.rowField}>{children}</div>
    </div>
  );
}

interface SaveButtonProps {
  label: string;
  onSave: () => Promise<void> | void;
}

function SaveButton({ label, onSave }: SaveButtonProps) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  const handle = async () => {
    if (state === "saving") return;
    setState("saving");
    try {
      await onSave();
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(`${t("settings.saveFailed")}: ${msg}`, "error");
      setState("idle");
    }
  };

  return (
    <div style={styles.saveRow}>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={handle}
        disabled={state === "saving"}
      >
        {state === "saving"
          ? t("common.saving")
          : state === "saved"
            ? t("common.saved")
            : label}
      </button>
    </div>
  );
}

interface KeyFieldProps {
  hasValue: boolean;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}

function KeyField({ hasValue, placeholder, value, onChange }: KeyFieldProps) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="password"
        className="input"
        style={{
          ...styles.input,
          flex: 1,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
        }}
        placeholder={
          hasValue
            ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (set)"
            : placeholder
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span style={styles.keyStatus(hasValue)}>
        {hasValue ? t("common.set") : t("common.notSet")}
      </span>
    </div>
  );
}

// ─── Section components ─────────────────────────────────────────────────

interface SectionProps {
  cfg: ConfigSnapshot;
  save: (patch: ConfigUpdate) => Promise<void>;
}

function GeneralSection({ cfg, save }: SectionProps) {
  const { language, t } = useI18n();
  const setLanguage = useAppStore((s) => s.setLanguage);
  const [provider, setProvider] = useState(cfg.llm_provider ?? "claude-code");
  const [teamLead, setTeamLead] = useState(cfg.team_lead_slug ?? "");
  const [maxConcurrent, setMaxConcurrent] = useState(
    cfg.max_concurrent_agents ? String(cfg.max_concurrent_agents) : "",
  );
  const [format, setFormat] = useState(cfg.default_format ?? "text");
  const [timeout, setTimeout] = useState(
    cfg.default_timeout ? String(cfg.default_timeout) : "",
  );
  const [devUrl, setDevUrl] = useState(cfg.dev_url ?? "");

  const onSave = async () => {
    const patch: ConfigUpdate = {
      llm_provider: provider as ConfigUpdate["llm_provider"],
      memory_backend: "markdown",
      default_format: format,
      dev_url: devUrl,
      team_lead_slug: teamLead,
    };
    if (maxConcurrent)
      patch.max_concurrent_agents = parseInt(maxConcurrent, 10);
    if (timeout) patch.default_timeout = parseInt(timeout, 10);
    await save(patch);
  };

  return (
    <div>
      <h2 style={styles.sectionTitle}>{t("settings.general.title")}</h2>
      <p style={styles.sectionDesc}>{t("settings.general.desc")}</p>

      <div style={styles.banner}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>{"\u26A0"}</span>
        <div>
          <strong>{t("settings.general.restartTitle")} </strong>
          {t("settings.general.restartBody")}{" "}
          <code
            style={{
              fontFamily: "var(--font-mono)",
              padding: "1px 6px",
              background: "var(--warning-200)",
              color: "var(--warning-500)",
              borderRadius: 3,
            }}
          >
            laf-office shred
          </code>{" "}
          {t("settings.general.restartTail")}
        </div>
      </div>

      <div style={styles.groupTitle}>{t("settings.general.languageGroup")}</div>
      <Field
        label={t("settings.general.languageLabel")}
        hint={t("settings.general.languageHint")}
      >
        <select
          style={styles.input}
          value={language}
          onChange={(e) => setLanguage(e.target.value === "ko" ? "ko" : "en")}
        >
          <option value="en">{t("language.english")}</option>
          <option value="ko">{t("language.korean")}</option>
        </select>
      </Field>

      <div style={styles.groupTitle}>{t("settings.general.runtimeGroup")}</div>
      <Field label={t("settings.general.provider")} hint="--provider">
        <select
          style={styles.input}
          value={provider}
          onChange={(e) => setProvider(e.target.value as typeof provider)}
        >
          <option value="claude-code">Claude Code</option>
          <option value="codex">Codex</option>
          <option value="opencode">Opencode</option>
        </select>
      </Field>

      <div style={{ ...styles.groupTitle, marginTop: 24 }}>
        {t("settings.general.agentsGroup")}
      </div>
      <Field
        label={t("settings.general.teamLead")}
        hint={t("settings.general.teamLeadHint")}
      >
        <input
          style={styles.input}
          placeholder={t("settings.general.teamLeadPlaceholder")}
          value={teamLead}
          onChange={(e) => setTeamLead(e.target.value)}
        />
      </Field>
      <Field
        label={t("settings.general.maxConcurrent")}
        hint={t("settings.general.maxConcurrentHint")}
      >
        <input
          style={styles.input}
          type="number"
          min={1}
          placeholder={t("settings.general.unlimited")}
          value={maxConcurrent}
          onChange={(e) => setMaxConcurrent(e.target.value)}
        />
      </Field>

      <div style={{ ...styles.groupTitle, marginTop: 24 }}>
        {t("settings.general.defaultsGroup")}
      </div>
      <Field label={t("settings.general.outputFormat")} hint="--format">
        <select
          style={styles.input}
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="text">Text</option>
          <option value="json">JSON</option>
        </select>
      </Field>
      <Field
        label={t("settings.general.timeout")}
        hint={t("settings.general.timeoutHint")}
      >
        <input
          style={styles.input}
          type="number"
          min={1000}
          placeholder="120000"
          value={timeout}
          onChange={(e) => setTimeout(e.target.value)}
        />
      </Field>

      <div style={{ ...styles.groupTitle, marginTop: 24 }}>
        {t("settings.general.developmentGroup")}
      </div>
      <Field
        label={t("settings.general.devUrl")}
        hint={t("settings.general.devUrlHint")}
      >
        <input
          style={styles.input}
          placeholder="http://localhost:7890"
          value={devUrl}
          onChange={(e) => setDevUrl(e.target.value)}
        />
      </Field>

      <div style={{ marginTop: 24 }}>
        <SaveButton label={t("settings.general.save")} onSave={onSave} />
      </div>

      {cfg.config_path ? (
        <div style={{ marginTop: 24 }}>
          <div style={styles.groupTitle}>
            {t("settings.general.configFile")}
          </div>
          <div style={styles.filePath}>{cfg.config_path}</div>
        </div>
      ) : null}
    </div>
  );
}

type EditableRole = "owner" | "admin" | "member";

const ROLE_OPTIONS: { value: EditableRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

function editableRole(role?: string): EditableRole {
  if (role === "owner" || role === "admin" || role === "member") return role;
  return "member";
}

function canManageTeam(role?: string): boolean {
  return role === "owner" || role === "admin";
}

function shortDate(value: string | undefined, language: "en" | "ko"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(language === "ko" ? "ko-KR" : undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RolePill({ role }: { role?: string }) {
  const { t } = useI18n();
  const normalized = editableRole(role);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 22,
        borderRadius: "var(--radius-full)",
        background:
          normalized === "owner"
            ? "var(--green-bg)"
            : normalized === "admin"
              ? "var(--yellow-bg)"
              : "var(--bg-warm)",
        color:
          normalized === "owner"
            ? "var(--green)"
            : normalized === "admin"
              ? "var(--warning-500)"
              : "var(--text-secondary)",
        padding: "0 8px",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "capitalize",
      }}
    >
      {t(`settings.team.${normalized}`)}
    </span>
  );
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: Team settings keeps account, members, and invites together for this MVP.
function TeamSection() {
  const { language, t } = useI18n();
  const queryClient = useQueryClient();
  const inviteBaseURL =
    typeof window === "undefined" ? "" : window.location.origin;
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<EditableRole>("member");
  const [roleBusyUser, setRoleBusyUser] = useState<string | null>(null);

  const { data: session } = useQuery({
    queryKey: ["auth-session"],
    queryFn: getAuthSession,
  });
  const { data: usersData } = useQuery({
    queryKey: ["auth-users"],
    queryFn: getAuthUsers,
  });
  const { data: inviteData } = useQuery({
    queryKey: ["human-invites", inviteBaseURL],
    queryFn: () => getInvites(inviteBaseURL),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      createInvite({
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        role: inviteRole,
        base_url: inviteBaseURL,
      }),
    onSuccess: (result) => {
      setInviteEmail("");
      setInviteName("");
      setInviteRole("member");
      queryClient.invalidateQueries({ queryKey: ["human-invites"] });
      showNotice(
        result.email_sent
          ? t("settings.team.inviteSent")
          : t("settings.team.inviteCreated"),
        "success",
      );
    },
    onError: (err) => {
      showNotice(
        err instanceof Error ? err.message : t("settings.team.inviteFailed"),
        "error",
      );
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({
      targetUser,
      role,
    }: {
      targetUser: AuthUser;
      role: EditableRole;
    }) => updateAuthUserRole({ user_id: targetUser.id, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth-users"] });
      queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      queryClient.invalidateQueries({ queryKey: ["human-invites"] });
      showNotice(t("settings.team.roleUpdated"), "success");
    },
    onError: (err) => {
      showNotice(
        err instanceof Error
          ? err.message
          : t("settings.team.roleUpdateFailed"),
        "error",
      );
    },
    onSettled: () => setRoleBusyUser(null),
  });

  const user = session?.user;
  const team = session?.team;
  const users = usersData?.users ?? [];
  const pendingInvites = (inviteData?.invites ?? []).filter(
    (invite) => invite.status === "pending",
  );
  const canManage = canManageTeam(user?.role);
  const canSubmitInvite =
    canManage && inviteEmail.trim() !== "" && !inviteMutation.isPending;

  const copyInvite = async (url?: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showNotice(t("settings.team.linkCopied"), "success");
    } catch {
      showNotice(t("settings.team.copyFailed"), "error");
    }
  };

  const changeRole = async (target: AuthUser, role: EditableRole) => {
    if (role === editableRole(target.role)) return;
    setRoleBusyUser(target.id);
    await roleMutation.mutateAsync({ targetUser: target, role });
  };

  if (session && !session.authenticated) {
    return (
      <div>
        <h2 style={styles.sectionTitle}>{t("settings.team.title")}</h2>
        <p style={styles.sectionDesc}>{t("settings.team.signInRequired")}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={styles.sectionTitle}>{t("settings.team.title")}</h2>
      <p style={styles.sectionDesc}>{t("settings.team.desc")}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
          marginBottom: 22,
        }}
      >
        {[
          [
            t("settings.team.workspace"),
            team?.name ?? t("settings.team.localOffice"),
          ],
          [t("settings.team.signedInAs"), user?.email ?? "—"],
          [t("settings.team.yourRole"), editableRole(user?.role)],
        ].map(([label, value]) => (
          <div
            key={label}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)",
              padding: "12px 14px",
              minWidth: 0,
            }}
          >
            <div
              style={{
                color: "var(--text-tertiary)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.05em",
                marginBottom: 5,
                textTransform: "uppercase",
              }}
            >
              {label}
            </div>
            <div
              style={{
                overflow: "hidden",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 650,
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={value}
            >
              {label === t("settings.team.yourRole") ? (
                <RolePill role={value} />
              ) : (
                value
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.groupTitle}>{t("settings.team.inviteGroup")}</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) 130px auto",
          gap: 8,
          alignItems: "end",
          marginBottom: 22,
        }}
      >
        <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
          <span style={styles.rowLabelName}>{t("settings.team.email")}</span>
          <input
            style={styles.input}
            type="email"
            placeholder="teammate@company.com"
            value={inviteEmail}
            disabled={!canManage}
            onChange={(event) => setInviteEmail(event.currentTarget.value)}
          />
        </label>
        <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
          <span style={styles.rowLabelName}>{t("settings.team.name")}</span>
          <input
            style={styles.input}
            type="text"
            placeholder={t("settings.team.optional")}
            value={inviteName}
            disabled={!canManage}
            onChange={(event) => setInviteName(event.currentTarget.value)}
          />
        </label>
        <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
          <span style={styles.rowLabelName}>{t("settings.team.role")}</span>
          <select
            style={styles.input}
            value={inviteRole}
            disabled={!canManage}
            onChange={(event) =>
              setInviteRole(event.currentTarget.value as EditableRole)
            }
          >
            <option value="member">{t("settings.team.member")}</option>
            <option value="admin">{t("settings.team.admin")}</option>
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!canSubmitInvite}
          onClick={() => inviteMutation.mutate()}
          style={{ minHeight: 36 }}
        >
          <SendMail width={14} height={14} />
          {inviteMutation.isPending
            ? t("settings.team.sending")
            : t("settings.team.invite")}
        </button>
      </div>
      {!canManage ? (
        <div style={{ ...styles.banner, marginTop: -8 }}>
          <WarningTriangle width={14} height={14} />
          <span>{t("settings.team.manageRequired")}</span>
        </div>
      ) : null}

      <div style={styles.groupTitle}>{t("settings.team.people")}</div>
      <table style={{ ...styles.table, marginBottom: 24 }}>
        <thead>
          <tr>
            <th style={styles.th}>{t("settings.team.person")}</th>
            <th style={styles.th}>{t("settings.team.role")}</th>
            <th style={styles.th}>{t("settings.team.status")}</th>
            <th style={styles.th}>{t("settings.team.joined")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((member) => {
            const isSelf = member.id === user?.id;
            const disabled = !canManage || isSelf || roleBusyUser === member.id;
            return (
              <tr key={member.id}>
                <td style={styles.td}>
                  <div style={{ fontWeight: 650 }}>
                    {member.name || member.email}
                    {isSelf ? ` (${t("settings.team.you")})` : ""}
                  </div>
                  <div
                    style={{
                      color: "var(--text-tertiary)",
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {member.email}
                  </div>
                </td>
                <td style={styles.td}>
                  {canManage ? (
                    <select
                      style={{ ...styles.input, height: 30, maxWidth: 126 }}
                      value={editableRole(member.role)}
                      disabled={disabled}
                      onChange={(event) =>
                        changeRole(
                          member,
                          event.currentTarget.value as EditableRole,
                        )
                      }
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role.value} value={role.value}>
                          {t(`settings.team.${role.value}`)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <RolePill role={member.role} />
                  )}
                </td>
                <td style={styles.td}>
                  {member.status || t("settings.team.statusActive")}
                </td>
                <td style={styles.td}>
                  {shortDate(member.created_at, language)}
                </td>
              </tr>
            );
          })}
          {users.length === 0 ? (
            <tr>
              <td style={styles.tdDesc} colSpan={4}>
                {t("settings.team.noMembers")}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div style={styles.groupTitle}>{t("settings.team.pendingInvites")}</div>
      {pendingInvites.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
          {t("settings.team.noPendingInvites")}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {pendingInvites.map((invite) => (
            <div
              key={invite.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto auto",
                gap: 8,
                alignItems: "center",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                padding: "9px 10px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    overflow: "hidden",
                    fontSize: 13,
                    fontWeight: 650,
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {invite.name || invite.email}
                </div>
                <div
                  style={{
                    color: "var(--text-tertiary)",
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  {invite.email} ·{" "}
                  {t(`settings.team.${editableRole(invite.role)}`)} ·{" "}
                  {t("settings.team.expires")}{" "}
                  {shortDate(invite.expires_at, language)}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => copyInvite(invite.invite_url)}
              >
                <Copy width={13} height={13} />
                {t("settings.team.copy")}
              </button>
              {invite.mailto_url ? (
                <a
                  className="btn btn-secondary btn-sm"
                  href={invite.mailto_url}
                >
                  {t("settings.team.openEmail")}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanySection({ cfg, save }: SectionProps) {
  const { t } = useI18n();
  const [name, setName] = useState(cfg.company_name ?? "");
  const [description, setDescription] = useState(cfg.company_description ?? "");
  const [goals, setGoals] = useState(cfg.company_goals ?? "");
  const [size, setSize] = useState(cfg.company_size ?? "");
  const [priority, setPriority] = useState(cfg.company_priority ?? "");

  const onSave = () =>
    save({
      company_name: name,
      company_description: description,
      company_goals: goals,
      company_size: size,
      company_priority: priority,
    });

  return (
    <div>
      <h2 style={styles.sectionTitle}>{t("settings.company.title")}</h2>
      <p style={styles.sectionDesc}>{t("settings.company.desc")}</p>

      <Field
        label={t("settings.company.name")}
        hint={t("settings.company.nameHint")}
      >
        <input
          style={styles.input}
          placeholder="Acme Corp"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field
        label={t("settings.company.description")}
        hint={t("settings.company.descriptionHint")}
      >
        <textarea
          style={styles.textarea}
          placeholder={t("settings.company.descriptionPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <Field
        label={t("settings.company.goals")}
        hint={t("settings.company.goalsHint")}
      >
        <textarea
          style={styles.textarea}
          placeholder={t("settings.company.goalsPlaceholder")}
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
        />
      </Field>

      <Field
        label={t("settings.company.size")}
        hint={t("settings.company.sizeHint")}
      >
        <input
          style={styles.input}
          placeholder={t("settings.company.sizePlaceholder")}
          value={size}
          onChange={(e) => setSize(e.target.value)}
        />
      </Field>

      <Field
        label={t("settings.company.priority")}
        hint={t("settings.company.priorityHint")}
      >
        <textarea
          style={styles.textarea}
          placeholder={t("settings.company.priorityPlaceholder")}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        />
      </Field>

      <SaveButton label={t("settings.company.save")} onSave={onSave} />
    </div>
  );
}

interface KeyDef {
  field: keyof ConfigUpdate;
  flag: keyof ConfigSnapshot;
  label: string;
  placeholder: string;
  env: string;
}

const KEY_DEFS: KeyDef[] = [
  {
    field: "api_key",
    flag: "api_key_set",
    label: "LAF-Office API Key",
    placeholder: "key_...",
    env: "LAF_OFFICE_API_KEY",
  },
  {
    field: "anthropic_api_key",
    flag: "anthropic_key_set",
    label: "Anthropic",
    placeholder: "sk-ant-...",
    env: "ANTHROPIC_API_KEY",
  },
  {
    field: "openai_api_key",
    flag: "openai_key_set",
    label: "OpenAI",
    placeholder: "sk-...",
    env: "OPENAI_API_KEY",
  },
  {
    field: "gemini_api_key",
    flag: "gemini_key_set",
    label: "Gemini",
    placeholder: "AI...",
    env: "GEMINI_API_KEY",
  },
  {
    field: "minimax_api_key",
    flag: "minimax_key_set",
    label: "Minimax",
    placeholder: "mm-...",
    env: "MINIMAX_API_KEY",
  },
];

function KeysSection({ cfg, save }: SectionProps) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>({});

  const onSave = async () => {
    const entries = Object.entries(values).filter(([, v]) => v.trim() !== "");
    if (entries.length === 0) {
      showNotice(t("settings.keys.noKeys"), "info");
      throw new Error("no_keys_entered");
    }
    const patch: ConfigUpdate = {};
    for (const [k, v] of entries) {
      (patch as Record<string, string>)[k] = v;
    }
    await save(patch);
    setValues({});
  };

  return (
    <div>
      <h2 style={styles.sectionTitle}>{t("settings.keys.title")}</h2>
      <p style={styles.sectionDesc}>{t("settings.keys.desc")}</p>

      {KEY_DEFS.map((def) => (
        <Field
          key={def.field}
          label={def.label}
          hint={`${t("settings.keys.env")} ${def.env}`}
        >
          <KeyField
            hasValue={Boolean(cfg[def.flag])}
            placeholder={def.placeholder}
            value={values[def.field] ?? ""}
            onChange={(v) => setValues((prev) => ({ ...prev, [def.field]: v }))}
          />
        </Field>
      ))}

      <SaveButton label={t("settings.keys.save")} onSave={onSave} />
    </div>
  );
}

// ─── Danger Zone ────────────────────────────────────────────────────────

// dangerStyles lives next to the section because it's the only caller and the
// warning palette shouldn't bleed into the rest of the app's styling surface.
const dangerStyles = {
  card: (severity: "warn" | "critical") => ({
    marginBottom: 20,
    padding: 20,
    borderRadius: "var(--radius-md)",
    background: severity === "critical" ? "var(--red-bg)" : "var(--yellow-bg)",
  }),
  cardTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: 6,
  } as const,
  cardSubtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 14,
    lineHeight: 1.5,
  } as const,
  listLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "var(--text-tertiary)",
    marginTop: 8,
    marginBottom: 4,
  } as const,
  list: {
    margin: 0,
    paddingLeft: 20,
    fontSize: 12,
    lineHeight: 1.7,
    color: "var(--text-secondary)",
  } as const,
  button: (severity: "warn" | "critical") => ({
    marginTop: 16,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer" as const,
    color: "#fff",
    background:
      severity === "critical"
        ? "var(--red, #e5484d)"
        : "var(--yellow, #e5a00d)",
    fontFamily: "var(--font-sans)",
  }),
  modalBackdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modalPanel: {
    width: "min(520px, calc(100vw - 40px))",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    padding: 24,
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  } as const,
  modalTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: 10,
  } as const,
  modalBody: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
    marginBottom: 16,
  } as const,
  modalInputLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "var(--text-tertiary)",
    marginBottom: 6,
    display: "block",
  } as const,
  modalInput: {
    width: "100%",
    background: "var(--bg-warm)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    borderRadius: "var(--radius-sm)",
    height: 38,
    fontSize: 14,
    padding: "0 12px",
    outline: "none",
    fontFamily: "var(--font-mono)",
  } as const,
  modalRow: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 18,
  } as const,
  modalCancel: {
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 500,
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer" as const,
    color: "var(--text)",
    background: "transparent",
    fontFamily: "var(--font-sans)",
  } as const,
  modalConfirm: (severity: "warn" | "critical", enabled: boolean) => ({
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: enabled ? "pointer" : ("not-allowed" as const),
    color: "#fff",
    background: enabled
      ? severity === "critical"
        ? "var(--red, #e5484d)"
        : "var(--yellow, #e5a00d)"
      : "var(--bg-warm)",
    opacity: enabled ? 1 : 0.6,
    fontFamily: "var(--font-sans)",
  }),
};

const CONFIRM_PHRASE = "i can spell responsibility";

interface WipeModalProps {
  title: string;
  severity: "warn" | "critical";
  intro: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// WipeModal gates a destructive action behind a type-the-exact-phrase confirm.
// The placeholder and the body copy both surface the full phrase so there's no mystery
// about what to type — we want the friction, not the guesswork.
function WipeModal({
  title,
  severity,
  intro,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: WipeModalProps) {
  const { t } = useI18n();
  const inputId = useId();
  const [value, setValue] = useState("");
  const enabled = !busy && value.trim().toLowerCase() === CONFIRM_PHRASE;
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !busy) onCancel();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !busy) onCancel();
  };

  return (
    <div
      style={dangerStyles.modalBackdrop}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <div style={dangerStyles.modalPanel}>
        <div style={dangerStyles.modalTitle}>{title}</div>
        <div style={dangerStyles.modalBody}>{intro}</div>
        <label htmlFor={inputId} style={dangerStyles.modalInputLabel}>
          {t("settings.danger.confirmType")} <code>{CONFIRM_PHRASE}</code>{" "}
          {t("settings.danger.confirmTail")}
        </label>
        <input
          id={inputId}
          type="text"
          style={dangerStyles.modalInput}
          placeholder={CONFIRM_PHRASE}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
        />
        <div style={dangerStyles.modalRow}>
          <button
            type="button"
            style={dangerStyles.modalCancel}
            onClick={onCancel}
            disabled={busy}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            style={dangerStyles.modalConfirm(severity, enabled)}
            onClick={enabled ? onConfirm : undefined}
            disabled={!enabled}
          >
            {busy ? t("common.working") : String(confirmLabel)}
          </button>
        </div>
      </div>
    </div>
  );
}

type DangerAction = "reset" | "shred";

function DangerZoneSection() {
  const { t } = useI18n();
  const [open, setOpen] = useState<DangerAction | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const resetForOnboarding = useAppStore((s) => s.resetForOnboarding);

  const handleReset = async () => {
    setBusy(true);
    try {
      const result: WorkspaceWipeResult = await resetWorkspace();
      if (!result.ok) {
        showNotice(result.error || t("settings.danger.resetFailed"), "error");
        setBusy(false);
        return;
      }
      showNotice(t("settings.danger.resetSuccess"), "success");
      setTimeout(() => window.location.reload(), 400);
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : t("settings.danger.resetFailed"),
        "error",
      );
      setBusy(false);
    }
  };

  const handleShred = async () => {
    setBusy(true);
    try {
      const result: WorkspaceWipeResult = await shredWorkspace();
      if (!result.ok) {
        showNotice(result.error || t("settings.danger.shredFailed"), "error");
        setBusy(false);
        return;
      }
      queryClient.clear();
      window.history.replaceState(null, "", "#/channels/general");
      resetForOnboarding();
      setOpen(null);
      setBusy(false);
      showNotice(t("settings.danger.shredSuccess"), "success");
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : t("settings.danger.shredFailed"),
        "error",
      );
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={styles.sectionTitle}>{t("settings.danger.title")}</div>
      <div style={styles.sectionDesc}>{t("settings.danger.desc")}</div>

      {/* RESET — narrow: broker runtime state only */}
      <div style={dangerStyles.card("warn")}>
        <div style={dangerStyles.cardTitle}>
          <Refresh width={16} height={16} />
          <span>{t("settings.danger.resetTitle")}</span>
        </div>
        <div style={dangerStyles.cardSubtitle}>
          {t("settings.danger.resetSubtitle")}
        </div>
        <div style={dangerStyles.listLabel}>{t("settings.danger.clears")}</div>
        <ul style={dangerStyles.list}>
          <li>
            {t("settings.danger.resetClearBroker")} (
            <code>~/.laf-office/team/broker-state.json</code>)
          </li>
          <li>{t("settings.danger.resetClearSnapshot")}</li>
        </ul>
        <div style={dangerStyles.listLabel}>
          {t("settings.danger.preserved")}
        </div>
        <ul style={dangerStyles.list}>
          <li>{t("settings.danger.resetPreserveTeam")}</li>
          <li>{t("settings.danger.resetPreserveHistory")}</li>
          <li>{t("settings.danger.resetPreserveKeys")}</li>
        </ul>
        <button
          type="button"
          style={dangerStyles.button("warn")}
          onClick={() => setOpen("reset")}
          disabled={busy}
        >
          {t("settings.danger.resetButton")}
        </button>
      </div>

      {/* SHRED — full wipe */}
      <div style={dangerStyles.card("critical")}>
        <div style={dangerStyles.cardTitle}>
          <WarningTriangle width={16} height={16} />
          <span>{t("settings.danger.shredTitle")}</span>
        </div>
        <div style={dangerStyles.cardSubtitle}>
          {t("settings.danger.shredSubtitle")}
        </div>
        <div style={dangerStyles.listLabel}>{t("settings.danger.deletes")}</div>
        <ul style={dangerStyles.list}>
          <li>
            {t("settings.danger.shredDeleteOnboarding")} (
            <code>~/.laf-office/onboarded.json</code>)
          </li>
          <li>
            {t("settings.danger.shredDeleteCompany")} (
            <code>~/.laf-office/company.json</code>)
          </li>
          <li>
            {t("settings.danger.shredDeleteRuntime")}{" "}
            <code>~/.laf-office/</code>
          </li>
          <li>{t("settings.danger.shredDeleteLogs")}</li>
          <li>{t("settings.danger.shredDeleteBroker")}</li>
        </ul>
        <div style={dangerStyles.listLabel}>
          {t("settings.danger.preserved")}
        </div>
        <ul style={dangerStyles.list}>
          <li>{t("settings.danger.shredPreserveWorktrees")}</li>
          <li>
            {t("settings.danger.shredPreserveConfig")} (<code>config.json</code>
            )
          </li>
          <li>{t("settings.danger.shredPreserveDevice")}</li>
        </ul>
        <button
          type="button"
          style={dangerStyles.button("critical")}
          onClick={() => setOpen("shred")}
          disabled={busy}
        >
          {t("settings.danger.shredButton")}
        </button>
      </div>

      {open === "reset" && (
        <WipeModal
          title={t("settings.danger.resetModalTitle")}
          severity="warn"
          intro={t("settings.danger.resetModalIntro")}
          confirmLabel={t("settings.danger.resetConfirm")}
          busy={busy}
          onConfirm={handleReset}
          onCancel={() => setOpen(null)}
        />
      )}

      {open === "shred" && (
        <WipeModal
          title={t("settings.danger.shredModalTitle")}
          severity="critical"
          intro={t("settings.danger.shredModalIntro")}
          confirmLabel={t("settings.danger.shredConfirm")}
          busy={busy}
          onConfirm={handleShred}
          onCancel={() => setOpen(null)}
        />
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────

export function SettingsApp() {
  const { t } = useI18n();
  const [section, setSection] = useState<SectionId>("general");
  const queryClient = useQueryClient();
  const requestedSection = useAppStore((s) => s.settingsSection);
  const setSettingsSection = useAppStore((s) => s.setSettingsSection);

  const { data, isLoading, error } = useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
    staleTime: 10_000,
  });

  const saveMutation = useMutation({
    mutationFn: (patch: ConfigUpdate) => updateConfig(patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
      showNotice(t("settings.saved"), "success");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : t("settings.saveFailed");
      showNotice(message, "error");
    },
  });

  // Reset section state when data changes so form values pick up latest server state
  const [dataKey, setDataKey] = useState(0);
  useEffect(() => {
    setDataKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!requestedSection) return;
    if (
      SECTION_GROUPS.some((group) =>
        group.items.some((item) => item.id === requestedSection),
      )
    ) {
      setSection(requestedSection as SectionId);
    }
    setSettingsSection(null);
  }, [requestedSection, setSettingsSection]);

  const save = async (patch: ConfigUpdate) => {
    await saveMutation.mutateAsync(patch);
  };

  if (isLoading) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--text-tertiary)",
          fontSize: 14,
        }}
      >
        {t("settings.loading")}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--text-tertiary)",
          fontSize: 14,
        }}
      >
        {t("settings.loadFailed")}{" "}
        {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <nav style={styles.nav}>
        {SECTION_GROUPS.map((group) => (
          <div key={group.labelKey}>
            <p style={styles.navGroupLabel}>{t(group.labelKey)}</p>
            {group.items.map((sec) => {
              const { Icon } = sec;
              return (
                <button
                  type="button"
                  key={sec.id}
                  style={styles.navItem(sec.id === section)}
                  onClick={() => setSection(sec.id)}
                >
                  <Icon style={styles.navIcon} />
                  <span>{t(sec.nameKey)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={styles.body} key={dataKey}>
        {section === "general" && <GeneralSection cfg={data} save={save} />}
        {section === "team" && <TeamSection />}
        {section === "company" && <CompanySection cfg={data} save={save} />}
        {section === "keys" && <KeysSection cfg={data} save={save} />}
        {section === "danger" && <DangerZoneSection />}
      </div>
    </div>
  );
}
