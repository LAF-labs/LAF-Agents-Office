import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Terminal } from "iconoir-react";

import {
  type BridgeDevice,
  createProjectLocalBinding,
  deleteProjectLocalBinding,
  getBridgeAvailability,
  getProjectLocalBindings,
  type Project,
  type ProjectLocalBinding,
  type RunnerStatusResponse,
} from "../../../api/client";
import type { I18nKey } from "../../../lib/i18n";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";
import { Input } from "../../ui/input";
import { Select } from "../../ui/select";
import { bridgeDeviceForBinding, onlineBridgeDevices } from "./bridgeUtils";

type TranslationFn = (key: I18nKey) => string;
type RunnerSignal = {
  labelKey: I18nKey;
  state: string;
};

function hasConnectedTeamRunner(
  status: RunnerStatusResponse | undefined,
): boolean {
  return Boolean(
    status?.runners?.some((runner) => runner.status === "connected"),
  );
}

export function ProjectBridgeWorkspacePanel({
  project,
  runnerSignal,
  runnerStatus,
  t,
}: {
  project: Project;
  runnerSignal: RunnerSignal;
  runnerStatus: RunnerStatusResponse | undefined;
  t: TranslationFn;
}) {
  const queryClient = useQueryClient();
  const [useExistingFolder, setUseExistingFolder] = useState(false);
  const [localPath, setLocalPath] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [deviceID, setDeviceID] = useState("");
  const [linkCommand, setLinkCommand] = useState("");
  const bindingsQuery = useQuery({
    queryKey: ["project-local-bindings", project.id],
    queryFn: () => getProjectLocalBindings(project.id),
    staleTime: 15_000,
  });
  const bindings = bindingsQuery.data?.bindings ?? [];
  const shouldLoadPersonalBridge = useExistingFolder || bindings.length > 0;
  const bridgeQuery = useQuery({
    queryKey: ["bridge-availability"],
    queryFn: () => getBridgeAvailability(),
    enabled: shouldLoadPersonalBridge,
    staleTime: 30_000,
  });
  const devices = bridgeQuery.data?.devices ?? [];
  const onlineDevices = onlineBridgeDevices(devices);
  const selectedDeviceID =
    deviceID ||
    bridgeQuery.data?.my_bridge.default_device_id ||
    onlineDevices[0]?.id ||
    "";
  const runnerConnected = hasConnectedTeamRunner(runnerStatus);
  const workspaceStatusLabel =
    runnerSignal.state === "loading"
      ? t("tasks.runnerChecking")
      : runnerConnected
        ? t("tasks.bridgeWorkspaceRunnerReady")
        : t("tasks.bridgeWorkspaceRunnerWaiting");
  const canCreate = Boolean(
    useExistingFolder && selectedDeviceID && localPath.trim(),
  );
  const createMutation = useMutation({
    mutationFn: () =>
      createProjectLocalBinding(project.id, {
        device_id: selectedDeviceID,
        display_name: displayName.trim() || project.name || project.id,
        local_path: localPath.trim(),
        trusted: true,
      }),
    onSuccess: (result) => {
      setLinkCommand(result.commands?.link || "");
      setLocalPath("");
      setDisplayName("");
      void queryClient.invalidateQueries({
        queryKey: ["project-local-bindings", project.id],
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (bindingID: string) =>
      deleteProjectLocalBinding(project.id, bindingID),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["project-local-bindings", project.id],
      });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate || createMutation.isPending) return;
    createMutation.mutate();
  }

  async function copyLinkCommand() {
    if (!linkCommand) return;
    await navigator.clipboard.writeText(linkCommand);
  }

  return (
    <Card className="project-directory-card project-bridge-card">
      <CardHeader className="project-bridge-header">
        <CardTitle>{t("tasks.bridgeWorkspaceTitle")}</CardTitle>
        <CardDescription>{t("tasks.bridgeWorkspaceDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="project-bridge-content">
        <ManagedCheckoutCard
          isReady={runnerConnected}
          statusLabel={workspaceStatusLabel}
          t={t}
        />

        {bindings.length > 0 && !useExistingFolder ? (
          <p className="project-workspace-note">
            {t("tasks.bridgeWorkspacePersonalConfigured")}
          </p>
        ) : null}

        <WorkspaceAdvancedToggle
          checked={useExistingFolder}
          t={t}
          onChange={setUseExistingFolder}
        />

        {useExistingFolder ? (
          <>
            <WorkspaceAdvancedPanel
              bindings={bindings}
              bridgeIsLoading={bridgeQuery.isLoading}
              canCreate={canCreate}
              createError={createMutation.error}
              devices={devices}
              displayName={displayName}
              isDeleting={deleteMutation.isPending}
              isLoadingBindings={bindingsQuery.isLoading}
              isSaving={createMutation.isPending}
              localPath={localPath}
              onlineDevices={onlineDevices}
              project={project}
              selectedDeviceID={selectedDeviceID}
              t={t}
              onDeleteBinding={(bindingID) => deleteMutation.mutate(bindingID)}
              onDeviceIDChange={setDeviceID}
              onDisplayNameChange={setDisplayName}
              onLocalPathChange={setLocalPath}
              onSubmit={handleSubmit}
            />
            <BridgeLinkCommand
              command={linkCommand}
              t={t}
              onCopy={copyLinkCommand}
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ManagedCheckoutCard({
  isReady,
  statusLabel,
  t,
}: {
  isReady: boolean;
  statusLabel: string;
  t: TranslationFn;
}) {
  return (
    <div className="project-workspace-mode-card is-active">
      <div className="project-workspace-mode-head">
        <div className="project-workspace-mode-copy">
          <div className="project-workspace-title-row">
            <strong>{t("tasks.bridgeWorkspaceAutoTitle")}</strong>
            <span className="project-workspace-badge">
              {t("tasks.bridgeWorkspaceAutoBadge")}
            </span>
          </div>
          <p>{t("tasks.bridgeWorkspaceAutoDesc")}</p>
        </div>
        <span
          className={cn(
            "project-workspace-status",
            isReady ? "is-ready" : "is-waiting",
          )}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

function WorkspaceAdvancedToggle({
  checked,
  t,
  onChange,
}: {
  checked: boolean;
  t: TranslationFn;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="project-workspace-advanced-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        aria-expanded={checked}
      />
      <span>
        <strong>{t("tasks.bridgeWorkspacePersonalTitle")}</strong>
        <small>{t("tasks.bridgeWorkspacePersonalDesc")}</small>
      </span>
    </label>
  );
}

function WorkspaceAdvancedPanel({
  bindings,
  bridgeIsLoading,
  canCreate,
  createError,
  devices,
  displayName,
  isDeleting,
  isLoadingBindings,
  isSaving,
  localPath,
  onlineDevices,
  project,
  selectedDeviceID,
  t,
  onDeleteBinding,
  onDeviceIDChange,
  onDisplayNameChange,
  onLocalPathChange,
  onSubmit,
}: {
  bindings: ProjectLocalBinding[];
  bridgeIsLoading: boolean;
  canCreate: boolean;
  createError: unknown;
  devices: BridgeDevice[];
  displayName: string;
  isDeleting: boolean;
  isLoadingBindings: boolean;
  isSaving: boolean;
  localPath: string;
  onlineDevices: BridgeDevice[];
  project: Project;
  selectedDeviceID: string;
  t: TranslationFn;
  onDeleteBinding: (bindingID: string) => void;
  onDeviceIDChange: (deviceID: string) => void;
  onDisplayNameChange: (displayName: string) => void;
  onLocalPathChange: (localPath: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="project-workspace-advanced-panel">
      <PersonalBindingList
        bindings={bindings}
        devices={devices}
        isDeleting={isDeleting}
        isLoading={isLoadingBindings}
        t={t}
        onDeleteBinding={onDeleteBinding}
      />
      <PersonalFolderForm
        bridgeIsLoading={bridgeIsLoading}
        canCreate={canCreate}
        createError={createError}
        displayName={displayName}
        isSaving={isSaving}
        localPath={localPath}
        onlineDevices={onlineDevices}
        project={project}
        selectedDeviceID={selectedDeviceID}
        t={t}
        onDeviceIDChange={onDeviceIDChange}
        onDisplayNameChange={onDisplayNameChange}
        onLocalPathChange={onLocalPathChange}
        onSubmit={onSubmit}
      />
    </div>
  );
}

function PersonalBindingList({
  bindings,
  devices,
  isDeleting,
  isLoading,
  t,
  onDeleteBinding,
}: {
  bindings: ProjectLocalBinding[];
  devices: BridgeDevice[];
  isDeleting: boolean;
  isLoading: boolean;
  t: TranslationFn;
  onDeleteBinding: (bindingID: string) => void;
}) {
  if (isLoading) {
    return <p className="project-bridge-empty">{t("tasks.loadingTasks")}</p>;
  }
  if (bindings.length === 0) {
    return (
      <p className="project-bridge-empty">
        {t("tasks.bridgeWorkspacePersonalEmpty")}
      </p>
    );
  }

  return (
    <div className="project-bridge-binding-list">
      {bindings.map((binding) => (
        <PersonalBindingRow
          binding={binding}
          device={bridgeDeviceForBinding(binding, devices)}
          isDeleting={isDeleting}
          key={binding.id}
          t={t}
          onDelete={() => onDeleteBinding(binding.id)}
        />
      ))}
    </div>
  );
}

function PersonalBindingRow({
  binding,
  device,
  isDeleting,
  t,
  onDelete,
}: {
  binding: ProjectLocalBinding;
  device: BridgeDevice | null;
  isDeleting: boolean;
  t: TranslationFn;
  onDelete: () => void;
}) {
  return (
    <div className="project-bridge-binding-row">
      <div className="min-w-0">
        <div className="project-bridge-binding-name">
          {binding.display_name || t("tasks.bridgeWorkspacePersonalExisting")}
        </div>
        <div className="project-bridge-binding-meta">
          {device?.device_label || binding.device_id} -{" "}
          {binding.trusted
            ? t("tasks.bridgeTrusted")
            : t("tasks.bridgeUntrusted")}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={isDeleting}
      >
        {t("tasks.bridgeRemoveBinding")}
      </Button>
    </div>
  );
}

function PersonalFolderForm({
  bridgeIsLoading,
  canCreate,
  createError,
  displayName,
  isSaving,
  localPath,
  onlineDevices,
  project,
  selectedDeviceID,
  t,
  onDeviceIDChange,
  onDisplayNameChange,
  onLocalPathChange,
  onSubmit,
}: {
  bridgeIsLoading: boolean;
  canCreate: boolean;
  createError: unknown;
  displayName: string;
  isSaving: boolean;
  localPath: string;
  onlineDevices: BridgeDevice[];
  project: Project;
  selectedDeviceID: string;
  t: TranslationFn;
  onDeviceIDChange: (deviceID: string) => void;
  onDisplayNameChange: (displayName: string) => void;
  onLocalPathChange: (localPath: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const emptyDeviceLabel = bridgeIsLoading
    ? t("tasks.bridgeChecking")
    : t("tasks.bridgePersonalDeviceUnavailable");

  return (
    <form className="project-bridge-form" onSubmit={onSubmit}>
      <label className="project-info-field" htmlFor="project-bridge-device">
        <span>{t("tasks.bridgeDevice")}</span>
        <Select
          id="project-bridge-device"
          value={selectedDeviceID}
          onChange={(event) => onDeviceIDChange(event.currentTarget.value)}
          aria-label={t("tasks.bridgeDevice")}
          disabled={onlineDevices.length === 0}
        >
          {onlineDevices.length === 0 ? (
            <option value="">{emptyDeviceLabel}</option>
          ) : null}
          {onlineDevices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.device_label || device.id}
            </option>
          ))}
        </Select>
      </label>
      <label className="project-info-field" htmlFor="project-bridge-path">
        <span>{t("tasks.bridgeLocalPath")}</span>
        <Input
          id="project-bridge-path"
          value={localPath}
          onChange={(event) => onLocalPathChange(event.currentTarget.value)}
          placeholder="/Users/me/project"
          aria-label={t("tasks.bridgeLocalPath")}
        />
      </label>
      <label className="project-info-field" htmlFor="project-bridge-name">
        <span>{t("tasks.bridgeDisplayName")}</span>
        <Input
          id="project-bridge-name"
          value={displayName}
          onChange={(event) => onDisplayNameChange(event.currentTarget.value)}
          placeholder={project.name || project.id}
          aria-label={t("tasks.bridgeDisplayName")}
        />
      </label>
      <Button type="submit" variant="outline" disabled={!canCreate || isSaving}>
        {isSaving
          ? t("tasks.bridgeSavingBinding")
          : t("tasks.bridgeSaveBinding")}
      </Button>
      {createError ? (
        <p className="project-bridge-error">
          {createError instanceof Error
            ? createError.message
            : t("tasks.bridgeSaveFailed")}
        </p>
      ) : null}
    </form>
  );
}

function BridgeLinkCommand({
  command,
  t,
  onCopy,
}: {
  command: string;
  t: TranslationFn;
  onCopy: () => Promise<void>;
}) {
  if (!command) return null;
  return (
    <div className="project-bridge-command">
      <div className="project-bridge-command-label">
        <Terminal width={14} height={14} />
        <span>{t("tasks.bridgeLinkCommand")}</span>
      </div>
      <code className="project-bridge-command-code">{command}</code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void onCopy();
        }}
      >
        <Copy width={14} height={14} />
        {t("tasks.bridgeCopyLinkCommand")}
      </Button>
    </div>
  );
}
