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
  Check,
  Copy,
  Key,
  Laptop,
  PeopleTag,
  Refresh,
  SendMail,
  Settings as SettingsIcon,
  Terminal,
  WarningTriangle,
} from "iconoir-react";

import {
  type AgentModelDefaults,
  type AuthUser,
  type BridgeDevice,
  type ConfigSnapshot,
  type ConfigUpdate,
  changeOwnPassword,
  createInvite,
  createOfficeMember,
  createRunnerPairing,
  type GeneratedAgentTemplate,
  generateAgent,
  getAuthSession,
  getAuthUsers,
  getBridgeAvailability,
  getConfig,
  getInvites,
  getOfficeMembers,
  getPermissions,
  getRunnerStatus,
  type HostedRunner,
  type OfficeMember,
  type PermissionMember,
  type RunnerDiagnostic,
  type RunnerPairingStartResponse,
  resetWorkspace,
  shredWorkspace,
  updateAuthUserRole,
  updateConfig,
  updateOfficeMember,
  updateOwnProfile,
  updatePermissions,
  type WorkspaceRole,
  type WorkspaceWipeResult,
} from "../../api/client";
import { useI18n } from "../../lib/i18n";
import {
  PROFILE_AVATAR_IDS,
  normalizeProfileAvatarId,
} from "../../lib/profileAvatar";
import { useAppStore } from "../../stores/app";
import { PixelAvatar } from "../ui/PixelAvatar";
import { showNotice } from "../ui/Toast";

type SectionId =
  | "profile"
  | "general"
  | "agents"
  | "team"
  | "access"
  | "company"
  | "bridge"
  | "keys"
  | "danger";

interface Section {
  id: SectionId;
  Icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  nameKey:
    | "settings.section.profile"
    | "settings.section.general"
    | "settings.section.agents"
    | "settings.section.team"
    | "settings.section.access"
    | "settings.section.company"
    | "settings.section.bridge"
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

type TranslationFn = ReturnType<typeof useI18n>["t"];

const SECTION_GROUPS: SectionGroup[] = [
  {
    labelKey: "settings.group.workspace",
    items: [
      { id: "profile", Icon: PeopleTag, nameKey: "settings.section.profile" },
      {
        id: "general",
        Icon: SettingsIcon,
        nameKey: "settings.section.general",
      },
      { id: "agents", Icon: PeopleTag, nameKey: "settings.section.agents" },
      { id: "team", Icon: PeopleTag, nameKey: "settings.section.team" },
      { id: "access", Icon: Key, nameKey: "settings.section.access" },
      { id: "company", Icon: Building, nameKey: "settings.section.company" },
    ],
  },
  {
    labelKey: "settings.group.credentials",
    items: [{ id: "keys", Icon: Key, nameKey: "settings.section.keys" }],
  },
  {
    labelKey: "settings.group.system",
    items: [{ id: "bridge", Icon: Laptop, nameKey: "settings.section.bridge" }],
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
    gap: 20,
    flexWrap: "wrap",
  } as const,
  nav: {
    width: "min(240px, 100%)",
    flexShrink: 0,
    padding: "6px 0 0",
    position: "sticky" as const,
    top: 18,
    maxHeight: "calc(100vh - 96px)",
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
    background: "transparent",
    border: 0,
    borderRadius: 0,
    boxShadow: "none",
    backdropFilter: "none",
  } as const,
  navGroupLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0",
    color: "var(--text-tertiary)",
    margin: "0 0 4px 10px",
  } as const,
  navItem: (active: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px 8px 14px",
    fontSize: 12,
    borderRadius: 0,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    cursor: "pointer",
    border: 0,
    background: "transparent",
    boxShadow: active ? "inset 2px 0 0 var(--accent)" : "none",
    width: "100%",
    textAlign: "left" as const,
    fontFamily: "var(--font-sans)",
    fontWeight: active ? 700 : 500,
    transition: "background 0.15s, border-color 0.15s, color 0.15s",
  }),
  navIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
    strokeWidth: 2,
  } as const,
  body: {
    flex: "1 1 520px",
    minWidth: 0,
    padding: "2px 4px 96px",
    maxWidth: 720,
  } as const,
  sectionTitle: { fontSize: 18, fontWeight: 700, marginBottom: 4 } as const,
  sectionDesc: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 16,
    lineHeight: 1.5,
  } as const,
  banner: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 0",
    marginBottom: 16,
    background: "transparent",
    borderTop: "1px solid var(--border-light)",
    borderBottom: "1px solid var(--border-light)",
    borderRadius: 0,
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } as const,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
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
    background: "transparent",
    border: 0,
    borderBottom: "1px solid var(--border-light)",
    color: "var(--text)",
    borderRadius: 0,
    boxShadow: "none",
    height: 36,
    fontSize: 13,
    padding: "0 2px",
    outline: "none",
    width: "100%",
    fontFamily: "var(--font-sans)",
  } as const,
  textarea: {
    background: "transparent",
    border: 0,
    borderTop: "1px solid var(--border-light)",
    borderBottom: "1px solid var(--border-light)",
    color: "var(--text)",
    borderRadius: 0,
    boxShadow: "none",
    minHeight: 60,
    fontSize: 13,
    padding: "8px 2px",
    outline: "none",
    width: "100%",
    fontFamily: "var(--font-sans)",
    lineHeight: 1.5,
    resize: "vertical" as const,
  },
  primaryButton: {
    minHeight: 34,
    border: "1px solid var(--accent-border)",
    background: "var(--accent)",
    color: "var(--accent-ink)",
    borderRadius: "var(--radius-full)",
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
  } as const,
  keyStatus: (set: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 500,
    padding: 0,
    borderRadius: 0,
    whiteSpace: "nowrap" as const,
    background: "transparent",
    color: set ? "var(--green)" : "var(--text-tertiary)",
  }),
  statusDot: (color: string) => ({
    width: 6,
    height: 6,
    flex: "0 0 auto",
    borderRadius: "50%",
    background: color,
  }),
  saveRow: {
    display: "flex",
    gap: 8,
    marginTop: 8,
    paddingTop: 10,
    borderTop: "1px solid var(--border-light)",
  } as const,
  filePath: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-tertiary)",
    padding: "6px 0",
    background: "transparent",
    borderRadius: 0,
    border: 0,
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
    letterSpacing: "0",
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
    letterSpacing: "0",
    color: "var(--text-tertiary)",
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: "1px solid var(--border-light)",
  } as const,
  emptyState: {
    border: 0,
    borderTop: "1px solid var(--border-light)",
    borderBottom: "1px solid var(--border-light)",
    borderRadius: 0,
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
    padding: "12px 0",
    marginBottom: 20,
  } as const,
  runnerSetupDesc: {
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
    margin: "0 0 12px",
  } as const,
  runnerStepRail: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
    gap: 8,
    marginBottom: 16,
  } as const,
  runnerStep: (done: boolean, active: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 38,
    padding: "8px 0",
    borderTop: "1px solid var(--border-light)",
    borderBottom: active
      ? "2px solid var(--accent)"
      : "1px solid var(--border-light)",
    color: done || active ? "var(--text-primary)" : "var(--text-tertiary)",
    fontSize: 12,
    fontWeight: active ? 700 : 600,
  }),
  runnerStepMark: (done: boolean, active: boolean) => ({
    width: 22,
    height: 22,
    flex: "0 0 22px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    border: `1px solid ${
      done || active ? "var(--accent-border)" : "var(--border-light)"
    }`,
    background: done ? "var(--accent)" : "transparent",
    color: done
      ? "var(--accent-ink)"
      : active
        ? "var(--accent)"
        : "var(--text-tertiary)",
    fontSize: 11,
    fontWeight: 700,
  }),
  bridgeHelpBox: {
    display: "grid",
    gap: 8,
    padding: "12px 0",
    marginBottom: 14,
    borderTop: "1px solid var(--border-light)",
    borderBottom: "1px solid var(--border-light)",
  } as const,
  bridgeHelpTitle: {
    fontSize: 12,
    fontWeight: 750,
    color: "var(--text-primary)",
  } as const,
  bridgeHelpText: {
    margin: 0,
    color: "var(--text-secondary)",
    fontSize: 12,
    lineHeight: 1.5,
  } as const,
  bridgeStepList: {
    display: "grid",
    gap: 8,
    margin: "0 0 14px",
    paddingLeft: 18,
    color: "var(--text-secondary)",
    fontSize: 12,
    lineHeight: 1.5,
  } as const,
  bridgeStepItem: {
    paddingLeft: 2,
  } as const,
  runnerActionRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 14,
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
    <div className="settings-field" style={styles.row}>
      <div className="settings-field-label" style={styles.rowLabel}>
        <div style={styles.rowLabelName}>{label}</div>
        {hint ? <div style={styles.rowLabelHint}>{hint}</div> : null}
      </div>
      <div className="settings-field-control" style={styles.rowField}>
        {children}
      </div>
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

function ProfileSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["auth-session"],
    queryFn: getAuthSession,
    staleTime: 30_000,
  });
  const user = data?.user;
  const [name, setName] = useState("");
  const [avatarID, setAvatarID] = useState("human");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!user) return;
    setName(user.name || user.email || "");
    setAvatarID(normalizeProfileAvatarId(user.avatar_id));
  }, [user]);

  const profileMutation = useMutation({
    mutationFn: updateOwnProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      queryClient.invalidateQueries({ queryKey: ["auth-users"] });
      queryClient.invalidateQueries({ queryKey: ["mention-people"] });
      showNotice(t("settings.profile.saved"), "success");
    },
  });
  const passwordMutation = useMutation({
    mutationFn: changeOwnPassword,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showNotice(t("settings.profile.passwordSaved"), "success");
    },
  });

  if (isLoading) {
    return <div className="app-loading-state">{t("settings.loading")}</div>;
  }

  if (!user) {
    return (
      <div style={styles.emptyState}>{t("settings.profile.sessionMissing")}</div>
    );
  }

  const saveProfile = async () => {
    await profileMutation.mutateAsync({
      avatar_id: avatarID,
      name: name.trim(),
    });
  };
  const savePassword = async () => {
    if (newPassword !== confirmPassword) {
      throw new Error(t("settings.profile.passwordMismatch"));
    }
    await passwordMutation.mutateAsync({
      current_password: currentPassword,
      new_password: newPassword,
    });
  };

  return (
    <section>
      <h2 style={styles.sectionTitle}>{t("settings.profile.title")}</h2>
      <p style={styles.sectionDesc}>{t("settings.profile.desc")}</p>

      <p style={styles.groupTitle}>{t("settings.profile.identityGroup")}</p>
      <Field
        label={t("settings.profile.nickname")}
        hint={t("settings.profile.nicknameHint")}
      >
        <input
          className="input"
          style={styles.input}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        label={t("settings.profile.avatar")}
        hint={t("settings.profile.avatarHint")}
      >
        <div className="profile-avatar-grid">
          {PROFILE_AVATAR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`profile-avatar-option${avatarID === id ? " is-selected" : ""}`}
              aria-label={id}
              aria-pressed={avatarID === id}
              onClick={() => setAvatarID(id)}
            >
              <PixelAvatar slug={id} size={34} />
            </button>
          ))}
        </div>
      </Field>
      <SaveButton label={t("settings.profile.save")} onSave={saveProfile} />

      <p style={{ ...styles.groupTitle, marginTop: 24 }}>
        {t("settings.profile.passwordGroup")}
      </p>
      <Field label={t("settings.profile.currentPassword")}>
        <input
          className="input"
          style={styles.input}
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </Field>
      <Field
        label={t("settings.profile.newPassword")}
        hint={t("settings.profile.newPasswordHint")}
      >
        <input
          className="input"
          style={styles.input}
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </Field>
      <Field label={t("settings.profile.confirmPassword")}>
        <input
          className="input"
          style={styles.input}
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </Field>
      <SaveButton
        label={t("settings.profile.changePassword")}
        onSave={savePassword}
      />

      <p style={{ ...styles.groupTitle, marginTop: 24 }}>
        {t("settings.profile.preferencesGroup")}
      </p>
      <div style={styles.emptyState}>{t("settings.profile.preferencesHint")}</div>
    </section>
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
        <span
          aria-hidden="true"
          style={styles.statusDot(
            hasValue ? "var(--green)" : "var(--text-tertiary)",
          )}
        />
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
              background: "var(--accent-bg)",
              color: "var(--accent-strong)",
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

type EditableRole = WorkspaceRole;

const ROLE_OPTIONS: { value: EditableRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

function editableRole(role?: string): EditableRole {
  if (
    role === "owner" ||
    role === "admin" ||
    role === "manager" ||
    role === "member" ||
    role === "viewer"
  )
    return role;
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
  const color =
    normalized === "owner"
      ? "var(--green)"
      : normalized === "admin"
        ? "var(--yellow)"
        : normalized === "manager"
          ? "var(--blue)"
          : normalized === "viewer"
            ? "var(--text-tertiary)"
            : "var(--text-secondary)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: "auto",
        borderRadius: 0,
        background: "transparent",
        color,
        padding: 0,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "capitalize",
      }}
    >
      <span aria-hidden="true" style={styles.statusDot(color)} />
      {t(`settings.team.${normalized}`)}
    </span>
  );
}

function normalizeDraft(template?: GeneratedAgentTemplate | null) {
  return {
    slug: template?.slug ?? "",
    name: template?.name ?? "",
    role: template?.role ?? "",
    expertise: (template?.expertise ?? []).join(", "),
    personality: template?.personality ?? "",
  };
}

const CLAUDE_MODEL_OPTIONS = [
  {
    value: "sonnet",
    label: "Sonnet",
    desc: "Everyday coding and agent work",
  },
  {
    value: "opus",
    label: "Opus",
    desc: "Hard reasoning and planning",
  },
  {
    value: "opusplan",
    label: "Opus Plan",
    desc: "Opus for planning, Sonnet for execution",
  },
  {
    value: "haiku",
    label: "Haiku",
    desc: "Fast, smaller tasks",
  },
  {
    value: "sonnet[1m]",
    label: "Sonnet 1M",
    desc: "Long-context sessions",
  },
];

const CODEX_MODEL_OPTIONS = [
  {
    value: "gpt-5.5",
    label: "GPT-5.5",
    desc: "Frontier work",
  },
  {
    value: "gpt-5.4",
    label: "GPT-5.4",
    desc: "Strong everyday coding",
  },
  {
    value: "gpt-5.3-codex",
    label: "GPT-5.3 Codex",
    desc: "Coding-optimized",
  },
  {
    value: "gpt-5.3-codex-spark",
    label: "Codex Spark",
    desc: "Fast coding turns",
  },
  {
    value: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    desc: "Small and efficient",
  },
];

const LAF_MODEL_OPTIONS = [
  { value: "economy", label: "1 · Economy", desc: "Lowest cost" },
  { value: "standard", label: "2 · Standard", desc: "Routine work" },
  { value: "balanced", label: "3 · Balanced", desc: "Default high setting" },
  { value: "advanced", label: "4 · Advanced", desc: "Harder work" },
  { value: "frontier", label: "5 · Frontier", desc: "Best available LAF tier" },
];

const DEFAULT_AGENT_MODEL_DEFAULTS: Required<AgentModelDefaults> = {
  claude: "sonnet",
  codex: "gpt-5.4",
  laf: "balanced",
};

function normalizeAgentModelDefaults(
  value?: AgentModelDefaults | null,
): Required<AgentModelDefaults> {
  return {
    claude: value?.claude?.trim() || DEFAULT_AGENT_MODEL_DEFAULTS.claude,
    codex: value?.codex?.trim() || DEFAULT_AGENT_MODEL_DEFAULTS.codex,
    laf: value?.laf?.trim() || DEFAULT_AGENT_MODEL_DEFAULTS.laf,
  };
}

function sameModelDefaults(
  a: AgentModelDefaults,
  b: AgentModelDefaults,
): boolean {
  const left = normalizeAgentModelDefaults(a);
  const right = normalizeAgentModelDefaults(b);
  return (
    left.claude === right.claude &&
    left.codex === right.codex &&
    left.laf === right.laf
  );
}

function ModelSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; desc: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 3, minWidth: 0 }}>
      <span style={{ ...styles.rowLabelHint, marginTop: 0 }}>{label}</span>
      <select
        style={{ ...styles.input, height: 30, fontSize: 12 }}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} · {option.desc}
          </option>
        ))}
      </select>
    </label>
  );
}

function AgentModelDefaultsRow({
  member,
  busy,
  onSave,
}: {
  member: OfficeMember;
  busy: boolean;
  onSave: (slug: string, defaults: Required<AgentModelDefaults>) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() =>
    normalizeAgentModelDefaults(member.model_defaults),
  );
  const saved = normalizeAgentModelDefaults(member.model_defaults);
  const changed = !sameModelDefaults(draft, saved);

  useEffect(() => {
    setDraft(normalizeAgentModelDefaults(member.model_defaults));
  }, [member.model_defaults]);

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: "12px 0",
        borderBottom: "1px solid var(--border-light)",
      }}
    >
      <div
        style={{
          alignItems: "baseline",
          display: "flex",
          gap: 8,
          justifyContent: "space-between",
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <strong style={{ color: "var(--text-primary)", fontSize: 12 }}>
            @{member.slug}
          </strong>
          <div
            style={{
              color: "var(--text-tertiary)",
              fontSize: 11,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={member.role || member.name}
          >
            {member.role || member.name}
          </div>
        </div>
        {member.built_in ? (
          <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
            protected
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        }}
      >
        <ModelSelect
          label="Claude"
          value={draft.claude}
          options={CLAUDE_MODEL_OPTIONS}
          onChange={(claude) => setDraft((current) => ({ ...current, claude }))}
        />
        <ModelSelect
          label="Codex"
          value={draft.codex}
          options={CODEX_MODEL_OPTIONS}
          onChange={(codex) => setDraft((current) => ({ ...current, codex }))}
        />
        <ModelSelect
          label="LAF"
          value={draft.laf}
          options={LAF_MODEL_OPTIONS}
          onChange={(laf) => setDraft((current) => ({ ...current, laf }))}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!changed || busy}
          onClick={() => onSave(member.slug, draft)}
          style={{ minHeight: 30 }}
        >
          {busy ? t("common.saving") : t("settings.agents.saveModels")}
        </button>
      </div>
    </div>
  );
}

function AgentMakerSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState(normalizeDraft(null));
  const [modelDraft, setModelDraft] = useState<Required<AgentModelDefaults>>(
    () => ({ ...DEFAULT_AGENT_MODEL_DEFAULTS }),
  );
  const [savingModelSlug, setSavingModelSlug] = useState<string | null>(null);

  const { data: memberData } = useQuery({
    queryKey: ["office-members"],
    queryFn: getOfficeMembers,
  });
  const members = memberData?.members ?? [];

  const generateMutation = useMutation({
    mutationFn: () => generateAgent(prompt.trim()),
    onSuccess: (template) => {
      setDraft(normalizeDraft(template));
      showNotice(t("settings.agents.generated"), "success");
    },
    onError: (err) => {
      showNotice(
        err instanceof Error
          ? err.message
          : t("settings.agents.generateFailed"),
        "error",
      );
    },
  });

  const updateModelDefaultsMutation = useMutation({
    mutationFn: ({
      slug,
      model_defaults,
    }: {
      slug: string;
      model_defaults: Required<AgentModelDefaults>;
    }) => updateOfficeMember({ slug, model_defaults }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["office-members"] });
      showNotice(t("settings.agents.modelsSaved"), "success");
    },
    onError: (err) => {
      showNotice(
        err instanceof Error ? err.message : t("settings.agents.modelsFailed"),
        "error",
      );
    },
    onSettled: () => setSavingModelSlug(null),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createOfficeMember({
        slug: draft.slug.trim(),
        name: draft.name.trim(),
        role: draft.role.trim(),
        expertise: draft.expertise
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        personality: draft.personality.trim(),
        permission_mode: "plan",
        model_defaults: modelDraft,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["office-members"] });
      setPrompt("");
      setDraft(normalizeDraft(null));
      setModelDraft({ ...DEFAULT_AGENT_MODEL_DEFAULTS });
      showNotice(t("settings.agents.created"), "success");
    },
    onError: (err) => {
      showNotice(
        err instanceof Error ? err.message : t("settings.agents.createFailed"),
        "error",
      );
    },
  });

  const canGenerate = prompt.trim() !== "" && !generateMutation.isPending;
  const canCreate =
    draft.slug.trim() !== "" &&
    draft.name.trim() !== "" &&
    !createMutation.isPending;
  const saveModelDefaults = (
    slug: string,
    model_defaults: Required<AgentModelDefaults>,
  ) => {
    setSavingModelSlug(slug);
    updateModelDefaultsMutation.mutate({ slug, model_defaults });
  };

  return (
    <div>
      <h2 style={styles.sectionTitle}>{t("settings.agents.title")}</h2>
      <p style={styles.sectionDesc}>{t("settings.agents.desc")}</p>

      <div style={styles.groupTitle}>{t("settings.agents.coreTeam")}</div>
      <p style={styles.runnerSetupDesc}>{t("settings.agents.modelDesc")}</p>
      <div style={{ ...styles.emptyState, paddingTop: 2 }}>
        {members.map((member, index) => (
          <div
            key={member.slug}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr auto",
              gap: 10,
              alignItems: "center",
              padding: "6px 0",
              borderBottom:
                index === members.length - 1
                  ? "0"
                  : "1px solid var(--border-light)",
            }}
          >
            <strong style={{ color: "var(--text-primary)" }}>
              @{member.slug}
            </strong>
            <span>{member.role || member.name}</span>
            {member.built_in ? (
              <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
                protected
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div style={styles.groupTitle}>{t("settings.agents.modelDefaults")}</div>
      <div
        style={{
          borderTop: "1px solid var(--border-light)",
          marginBottom: 24,
        }}
      >
        {members.map((member) => (
          <AgentModelDefaultsRow
            key={member.slug}
            member={member}
            busy={savingModelSlug === member.slug}
            onSave={saveModelDefaults}
          />
        ))}
      </div>

      <div style={styles.groupTitle}>{t("settings.agents.maker")}</div>
      <Field
        label={t("settings.agents.prompt")}
        hint={t("settings.agents.promptHint")}
      >
        <textarea
          style={{ ...styles.textarea, minHeight: 86 }}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t("settings.agents.promptPlaceholder")}
        />
      </Field>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 18,
        }}
      >
        <button
          type="button"
          style={styles.primaryButton}
          disabled={!canGenerate}
          onClick={() => generateMutation.mutate()}
        >
          {generateMutation.isPending
            ? t("settings.agents.generating")
            : t("settings.agents.generate")}
        </button>
      </div>

      <div style={styles.groupTitle}>{t("settings.agents.draft")}</div>
      <Field label="Slug">
        <input
          style={styles.input}
          value={draft.slug}
          onChange={(event) =>
            setDraft((current) => ({ ...current, slug: event.target.value }))
          }
          placeholder="domain-specialist"
        />
      </Field>
      <Field label={t("settings.agents.name")}>
        <input
          style={styles.input}
          value={draft.name}
          onChange={(event) =>
            setDraft((current) => ({ ...current, name: event.target.value }))
          }
        />
      </Field>
      <Field label={t("settings.agents.role")}>
        <input
          style={styles.input}
          value={draft.role}
          onChange={(event) =>
            setDraft((current) => ({ ...current, role: event.target.value }))
          }
        />
      </Field>
      <Field label={t("settings.agents.expertise")}>
        <input
          style={styles.input}
          value={draft.expertise}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              expertise: event.target.value,
            }))
          }
          placeholder="research, finance, legal review"
        />
      </Field>
      <Field label={t("settings.agents.personality")}>
        <textarea
          style={styles.textarea}
          value={draft.personality}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              personality: event.target.value,
            }))
          }
        />
      </Field>
      <Field
        label={t("settings.agents.modelDefaults")}
        hint={t("settings.agents.modelHint")}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 8,
          }}
        >
          <ModelSelect
            label="Claude"
            value={modelDraft.claude}
            options={CLAUDE_MODEL_OPTIONS}
            onChange={(claude) =>
              setModelDraft((current) => ({ ...current, claude }))
            }
          />
          <ModelSelect
            label="Codex"
            value={modelDraft.codex}
            options={CODEX_MODEL_OPTIONS}
            onChange={(codex) =>
              setModelDraft((current) => ({ ...current, codex }))
            }
          />
          <ModelSelect
            label="LAF"
            value={modelDraft.laf}
            options={LAF_MODEL_OPTIONS}
            onChange={(laf) =>
              setModelDraft((current) => ({ ...current, laf }))
            }
          />
        </div>
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          style={styles.primaryButton}
          disabled={!canCreate}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending
            ? t("settings.agents.creating")
            : t("settings.agents.create")}
        </button>
      </div>
    </div>
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
        className="settings-team-summary"
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
            className="settings-team-stat"
            style={{
              border: 0,
              borderTop: "1px solid var(--border-light)",
              borderBottom: "1px solid var(--border-light)",
              borderRadius: 0,
              background: "transparent",
              padding: "12px 14px",
              minWidth: 0,
            }}
          >
            <div
              style={{
                color: "var(--text-tertiary)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0",
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
        className="settings-team-invite"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) 130px auto",
          gap: 8,
          alignItems: "end",
          marginBottom: 22,
        }}
      >
        <label
          className="settings-team-invite-field"
          style={{ display: "grid", gap: 5, minWidth: 0 }}
        >
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
        <label
          className="settings-team-invite-field"
          style={{ display: "grid", gap: 5, minWidth: 0 }}
        >
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
        <label
          className="settings-team-invite-field"
          style={{ display: "grid", gap: 5, minWidth: 0 }}
        >
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
          className="btn btn-primary btn-sm settings-team-invite-button"
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
      <table
        className="settings-team-table"
        style={{ ...styles.table, marginBottom: 24 }}
      >
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
                      className="settings-team-role-select"
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
                borderTop: "1px solid var(--border-light)",
                borderBottom: "1px solid var(--border-light)",
                borderRadius: 0,
                background: "transparent",
                padding: "10px 0",
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

function AccessControlSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["permissions"],
    queryFn: getPermissions,
  });
  const mutation = useMutation({
    mutationFn: (input: { member: PermissionMember; role: WorkspaceRole }) =>
      updatePermissions({
        user_id: input.member.user_id,
        role: input.role,
        permissions: input.member.overrides,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
      queryClient.invalidateQueries({ queryKey: ["auth-users"] });
      queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      showNotice("Access control updated.", "success");
    },
    onError: (err) => {
      showNotice(
        err instanceof Error ? err.message : "Access update failed.",
        "error",
      );
    },
  });

  return (
    <div>
      <h2 style={styles.sectionTitle}>{t("settings.access.title")}</h2>
      <p style={styles.sectionDesc}>{t("settings.access.desc")}</p>
      {isLoading ? (
        <p style={styles.tdDesc}>{t("settings.loading")}</p>
      ) : error ? (
        <div style={styles.banner}>
          <WarningTriangle width={14} height={14} />
          <span>
            {error instanceof Error
              ? error.message
              : "Could not load permissions."}
          </span>
        </div>
      ) : (
        <>
          <div style={styles.groupTitle}>{t("settings.access.members")}</div>
          <table className="settings-team-table" style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>{t("settings.team.person")}</th>
                <th style={styles.th}>{t("settings.team.role")}</th>
                <th style={styles.th}>{t("settings.access.effective")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.members ?? []).map((member) => (
                <tr key={member.user_id}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 650 }}>
                      {member.name || member.email}
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
                    <select
                      style={{ ...styles.input, height: 30, maxWidth: 132 }}
                      value={editableRole(member.role)}
                      disabled={mutation.isPending}
                      onChange={(event) =>
                        mutation.mutate({
                          member,
                          role: event.currentTarget.value as WorkspaceRole,
                        })
                      }
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{ color: "var(--text-tertiary)", fontSize: 11 }}
                    >
                      {member.effective_permissions.length} permissions
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ ...styles.banner, marginTop: 16 }}>
            <Key width={14} height={14} />
            <span>{t("settings.access.overrideHint")}</span>
          </div>
        </>
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

const RUNNER_INSTALL_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/LAF-labs/LAF-Agents-Office/main/scripts/install.sh | LAF_OFFICE_INSTALL_BINARY=laf-runner sh";

function BridgeSection() {
  const { t } = useI18n();
  const [pairing, setPairing] = useState<RunnerPairingStartResponse | null>(
    null,
  );
  const bridgeQuery = useQuery({
    queryKey: ["bridge-availability", "settings"],
    queryFn: () => getBridgeAvailability(),
    refetchInterval: 5_000,
  });
  const runnerQuery = useQuery({
    queryKey: ["runner-status", "settings"],
    queryFn: () => getRunnerStatus(),
    refetchInterval: 5_000,
  });
  const pairingMutation = useMutation({
    mutationFn: () => createRunnerPairing(browserRunnerAPIURL()),
    onSuccess: async (result) => {
      setPairing(result);
      const command = result.commands.setup || result.commands.connect || "";
      if (!command) {
        showNotice(t("settings.bridge.codeReady"), "success");
        return;
      }
      try {
        await navigator.clipboard.writeText(command);
        showNotice(t("settings.bridge.commandReadyCopied"), "success");
      } catch {
        showNotice(t("settings.bridge.codeReady"), "success");
      }
    },
    onError: (err) => {
      showNotice(
        err instanceof Error
          ? err.message
          : t("settings.bridge.generateFailed"),
        "error",
      );
    },
  });

  const devices = bridgeQuery.data?.devices ?? [];
  const bridge = preferredBridgeDevice(devices);
  const runners = runnerQuery.data?.runners ?? [];
  const runnerDiagnostics = runnerQuery.data?.diagnostics ?? [];
  const runner = preferredRunner(runners);
  const connected = lafBridgeConnected(runner, bridge);
  const setupCommand =
    pairing?.commands.setup || pairing?.commands.connect || "";

  const copyCommand = async (
    command: string,
    successMessage = t("settings.bridge.commandCopied"),
  ) => {
    try {
      await navigator.clipboard.writeText(command);
      showNotice(successMessage, "success");
    } catch {
      showNotice(t("settings.bridge.copyFailed"), "error");
    }
  };

  return (
    <div>
      <h2 style={styles.sectionTitle}>{t("settings.bridge.title")}</h2>
      <p style={styles.sectionDesc}>{t("settings.bridge.desc")}</p>

      <Field
        label={t("settings.bridge.status")}
        hint={lafBridgeStatusHint(t, runner, bridge, runnerDiagnostics)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={styles.statusDot(lafBridgeStatusColor(runner, bridge))}
          />
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {lafBridgeStatusLabel(t, runner, bridge)}
          </span>
        </div>
      </Field>

      <div style={styles.groupTitle}>{t("settings.bridge.setupTitle")}</div>
      <p style={styles.runnerSetupDesc}>{t("settings.bridge.setupDesc")}</p>
      <div style={styles.bridgeHelpBox}>
        <div style={styles.bridgeHelpTitle}>
          {t("settings.bridge.whyTitle")}
        </div>
        <p style={styles.bridgeHelpText}>{t("settings.bridge.whyBody")}</p>
      </div>
      <LafBridgeSetupProgress
        connected={connected}
        commandReady={Boolean(pairing)}
        t={t}
      />
      {!connected ? (
        <ol style={styles.bridgeStepList}>
          <li style={styles.bridgeStepItem}>
            {t("settings.bridge.helpOpenTerminal")}
          </li>
          <li style={styles.bridgeStepItem}>
            {t("settings.bridge.helpCreateCopy")}
          </li>
          <li style={styles.bridgeStepItem}>
            {t("settings.bridge.helpPasteEnter")}
          </li>
          <li style={styles.bridgeStepItem}>
            {t("settings.bridge.helpReturn")}
          </li>
        </ol>
      ) : null}
      {!connected ? (
        <div style={styles.runnerActionRow}>
          <button
            type="button"
            style={{
              ...styles.primaryButton,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
            }}
            onClick={() => pairingMutation.mutate()}
            disabled={pairingMutation.isPending}
          >
            <Refresh width={14} height={14} />
            {pairingMutation.isPending
              ? t("settings.bridge.generating")
              : t("settings.bridge.generate")}
          </button>
        </div>
      ) : null}

      {pairing && setupCommand && !connected ? (
        <Field
          label={t("settings.bridge.commandLabel")}
          hint={`${t("settings.bridge.commandHint")} ${t("settings.bridge.expires")} ${formatPairingExpiry(pairing.pairing.expires_at)}`}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <code style={styles.filePath}>{setupCommand}</code>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => copyCommand(setupCommand)}
              style={{ justifySelf: "start" }}
            >
              <Terminal width={13} height={13} />
              <Copy width={13} height={13} />
              {t("settings.bridge.copyCommand")}
            </button>
          </div>
        </Field>
      ) : null}
    </div>
  );
}

function LafBridgeSetupProgress({
  connected,
  commandReady,
  t,
}: {
  connected: boolean;
  commandReady: boolean;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const steps = [
    {
      done: commandReady || connected,
      label: t("settings.bridge.stepCommand"),
    },
    {
      done: connected,
      label: t("settings.bridge.stepConnect"),
    },
    {
      done: connected,
      label: t("settings.bridge.stepReady"),
    },
  ];
  const firstOpenIndex = steps.findIndex((step) => !step.done);

  return (
    <div style={styles.runnerStepRail}>
      {steps.map((step, index) => {
        const active = index === firstOpenIndex || (connected && index === 2);
        return (
          <div
            key={step.label}
            style={styles.runnerStep(step.done, active)}
            aria-current={active ? "step" : undefined}
          >
            <span style={styles.runnerStepMark(step.done, active)}>
              {step.done ? <Check width={13} height={13} /> : index + 1}
            </span>
            <span>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function preferredRunner(runners: HostedRunner[]) {
  const active = runners.filter((runner) => runner.status !== "revoked");
  return (
    active.find((runner) => runner.status === "connected") ||
    active.find((runner) => runner.status === "stale") ||
    active[0]
  );
}

function preferredBridgeDevice(devices: BridgeDevice[]) {
  const active = devices.filter((device) => device.status !== "revoked");
  return (
    active.find((device) => device.status === "online") ||
    active.find((device) => device.status === "offline") ||
    active[0]
  );
}

function lafBridgeConnected(runner?: HostedRunner, bridge?: BridgeDevice) {
  return runner?.status === "connected" || bridge?.status === "online";
}

function lafBridgeStatusLabel(
  t: TranslationFn,
  runner?: HostedRunner,
  bridge?: BridgeDevice,
) {
  if (lafBridgeConnected(runner, bridge)) return t("settings.bridge.connected");
  if (runner?.status === "stale" || bridge?.status === "offline") {
    return t("settings.bridge.needsAttention");
  }
  return t("settings.bridge.noBridge");
}

function lafBridgeStatusColor(runner?: HostedRunner, bridge?: BridgeDevice) {
  if (lafBridgeConnected(runner, bridge)) return "var(--green)";
  if (runner?.status === "stale" || bridge?.status === "offline") {
    return "var(--yellow)";
  }
  return "var(--text-tertiary)";
}

function lafBridgeStatusHint(
  t: TranslationFn,
  runner?: HostedRunner,
  bridge?: BridgeDevice,
  diagnostics: RunnerDiagnostic[] = [],
) {
  const preflightHint = runnerPreflightStatusHint(t, runner, diagnostics);
  if (preflightHint) return preflightHint;
  if (runner?.last_seen_at) return runnerStatusHint(runner);
  if (bridge) return bridgeStatusHint(bridge);
  return t("settings.bridge.optionalHint");
}

function runnerPreflightStatusHint(
  t: TranslationFn,
  runner: HostedRunner | undefined,
  diagnostics: RunnerDiagnostic[],
) {
  const runnerID = runner?.id || "";
  const diagnostic = diagnostics.find(
    (candidate) =>
      candidate.kind === "runner_preflight_failed" &&
      (!runnerID || candidate.runner_id === runnerID) &&
      candidate.severity === "critical",
  );
  if (!diagnostic) return "";
  switch (diagnosticDataString(diagnostic, "check_id")) {
    case "git":
      return t("settings.runner.gitMissing");
    case "github_auth":
      return t("settings.runner.githubMissing");
    case "provider_runtime":
      return t("settings.bridge.providerMissing");
    default:
      return (
        diagnostic.detail ||
        diagnostic.title ||
        t("settings.bridge.needsAttention")
      );
  }
}

function diagnosticDataString(diagnostic: RunnerDiagnostic, key: string) {
  const value = diagnostic.data?.[key];
  return typeof value === "string" ? value : "";
}

function bridgeStatusHint(bridge?: BridgeDevice) {
  if (!bridge?.last_seen_at) return bridge?.device_label || "";
  return `${bridge.device_label || bridge.id} · ${new Date(bridge.last_seen_at).toLocaleString()}`;
}

function runnerStatusHint(runner?: HostedRunner) {
  if (!runner?.last_seen_at) return "";
  return new Date(runner.last_seen_at).toLocaleString();
}

function browserRunnerAPIURL() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api`;
}

function formatPairingExpiry(value: string) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// dangerStyles lives next to the section because it's the only caller and the
// warning palette shouldn't bleed into the rest of the app's styling surface.
const dangerStyles = {
  card: (severity: "warn" | "critical") => ({
    marginBottom: 20,
    padding: "18px 0",
    borderRadius: 0,
    borderTop:
      severity === "critical"
        ? "1px solid color-mix(in srgb, var(--red) 24%, var(--border-light))"
        : "1px solid var(--border-light)",
    borderBottom:
      severity === "critical"
        ? "1px solid color-mix(in srgb, var(--red) 24%, var(--border-light))"
        : "1px solid var(--border-light)",
    background: "transparent",
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
    letterSpacing: "0",
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
    borderRadius: "var(--radius-full)",
    cursor: "pointer" as const,
    color: severity === "critical" ? "#fff" : "var(--accent-ink)",
    background:
      severity === "critical" ? "var(--red, #e5484d)" : "var(--accent)",
    fontFamily: "var(--font-sans)",
  }),
  modalBackdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(245, 245, 247, 0.72)",
    backdropFilter: "blur(20px) saturate(1.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modalPanel: {
    width: "min(520px, calc(100vw - 40px))",
    background: "var(--surface-raised, var(--bg-elevated))",
    border: "none",
    borderRadius: "var(--radius-xl)",
    padding: 24,
    boxShadow: "none",
    backdropFilter: "none",
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
    letterSpacing: "0",
    color: "var(--text-tertiary)",
    marginBottom: 6,
    display: "block",
  } as const,
  modalInput: {
    width: "100%",
    background: "var(--color-fog, var(--bg))",
    border: "1px solid transparent",
    color: "var(--text)",
    borderRadius: "var(--radius-full)",
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
    borderRadius: "var(--radius-full)",
    cursor: "pointer" as const,
    color: "var(--text)",
    background: "transparent",
    fontFamily: "var(--font-sans)",
  } as const,
  modalConfirm: (severity: "warn" | "critical", enabled: boolean) => ({
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    border: enabled ? "none" : "1px solid var(--border-light)",
    borderRadius: "var(--radius-full)",
    cursor: enabled ? "pointer" : ("not-allowed" as const),
    color: !enabled
      ? "var(--text-tertiary)"
      : severity === "critical"
        ? "#fff"
        : "var(--accent-ink)",
    background: enabled
      ? severity === "critical"
        ? "var(--red, #e5484d)"
        : "var(--accent)"
      : "var(--overlay-soft)",
    opacity: 1,
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
  onConfirm: (confirmPhrase: string) => void;
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
            onClick={
              enabled ? () => onConfirm(value.trim().toLowerCase()) : undefined
            }
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

  const handleReset = async (confirmPhrase: string) => {
    setBusy(true);
    try {
      const result: WorkspaceWipeResult = await resetWorkspace(confirmPhrase);
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

  const handleShred = async (confirmPhrase: string) => {
    setBusy(true);
    try {
      const result: WorkspaceWipeResult = await shredWorkspace(confirmPhrase);
      if (!result.ok) {
        showNotice(result.error || t("settings.danger.shredFailed"), "error");
        setBusy(false);
        return;
      }
      queryClient.clear();
      window.history.replaceState(null, "", "#/projects");
      resetForOnboarding();
      window.dispatchEvent(new Event("laf-office:workspace-shredded"));
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
    return <div className="app-loading-state">{t("settings.loading")}</div>;
  }

  if (error || !data) {
    return (
      <div className="app-empty-state">
        {t("settings.loadFailed")}{" "}
        {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  return (
    <div className="settings-shell" style={styles.shell}>
      <nav className="settings-nav" style={styles.nav}>
        {SECTION_GROUPS.map((group) => (
          <div key={group.labelKey}>
            <p style={styles.navGroupLabel}>{t(group.labelKey)}</p>
            {group.items.map((sec) => {
              const { Icon } = sec;
              return (
                <button
                  type="button"
                  key={sec.id}
                  className={`settings-nav-item${sec.id === section ? " is-active" : ""}`}
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
      <div className="settings-body" style={styles.body} key={dataKey}>
        {section === "profile" && <ProfileSection />}
        {section === "general" && <GeneralSection cfg={data} save={save} />}
        {section === "agents" && <AgentMakerSection />}
        {section === "team" && <TeamSection />}
        {section === "access" && <AccessControlSection />}
        {section === "company" && <CompanySection cfg={data} save={save} />}
        {section === "bridge" && <BridgeSection />}
        {section === "keys" && <KeysSection cfg={data} save={save} />}
        {section === "danger" && <DangerZoneSection />}
      </div>
    </div>
  );
}

export const __test__ = {
  CODEX_MODEL_OPTIONS,
  DEFAULT_AGENT_MODEL_DEFAULTS,
  LAF_MODEL_OPTIONS,
  RUNNER_INSTALL_COMMAND,
  normalizeAgentModelDefaults,
};
