import { useEffect, useId, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getModelAvailability,
  type ModelAvailability,
  type ModelMode,
} from "../api/client";
import { cn } from "../lib/utils";

const CLI_UNAVAILABLE_TITLE =
  "CLI가 감지되지 않습니다. Codex/Claude Code CLI를 설치하거나 팀 플랜을 업그레이드해 LAF 모델을 활성화해주세요.";
const CLI_ACTIVE_TITLE = "CLI를 사용합니다.";
const LAF_ACTIVE_TITLE = "LAF 모델을 사용합니다.";
const BRIDGE_REASON_TITLES: Record<string, string> = {
  "no supported local CLI detected":
    "LAF Bridge가 Codex/Claude Code CLI를 감지하지 못했습니다.",
  "LAF Bridge has no supported local CLI detected":
    "LAF Bridge가 Codex/Claude Code CLI를 감지하지 못했습니다.",
  "no online LAF Bridge detected":
    "LAF Bridge가 오프라인입니다. Bridge 터미널을 다시 연결해주세요.",
  "no paired LAF Bridge detected":
    "LAF Bridge가 연결되어 있지 않습니다. Settings의 LAF Bridge에서 연결해주세요.",
  "permission required: bridge:execute_own":
    "LAF Bridge 실행 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.",
};

const CLI_RUNTIME_LABELS: Record<string, string> = {
  claude: "Claude Code",
  "claude-code": "Claude Code",
  codex: "Codex",
};

function modeAvailable(
  availability: ModelAvailability | undefined,
  mode: ModelMode,
): boolean {
  if (!availability) return false;
  return (
    availability.allowed_modes.includes(mode) &&
    Boolean(availability[mode]?.available)
  );
}

function cliAvailable(availability: ModelAvailability | undefined): boolean {
  if (!availability) return false;
  return modeAvailable(availability, "my_bridge");
}

function cliMode(availability: ModelAvailability | undefined): ModelMode {
  if (modeAvailable(availability, "my_bridge")) return "my_bridge";
  return "record_only";
}

function cliRuntimeLabel(availability: ModelAvailability | undefined): string {
  const runtimes = availability?.my_bridge?.runtimes ?? [];
  if (runtimes.includes("codex")) return "Codex";
  if (runtimes.includes("claude-code") || runtimes.includes("claude")) {
    return "Claude Code";
  }
  for (const runtime of runtimes) {
    const label = CLI_RUNTIME_LABELS[runtime];
    if (label) return label;
  }
  return "";
}

function cliActiveTitle(availability: ModelAvailability | undefined): string {
  const label = cliRuntimeLabel(availability);
  return label ? `${label} CLI를 사용합니다.` : CLI_ACTIVE_TITLE;
}

function cliUnavailableTitle(
  availability: ModelAvailability | undefined,
): string {
  const reason = availability?.my_bridge?.reason?.trim() ?? "";
  return BRIDGE_REASON_TITLES[reason] || CLI_UNAVAILABLE_TITLE;
}

function preferredMode(availability: ModelAvailability | undefined): ModelMode {
  if (!availability) return "record_only";
  if (
    availability.default_mode === "laf_model" &&
    modeAvailable(availability, "laf_model")
  ) {
    return "laf_model";
  }
  if (cliAvailable(availability)) return cliMode(availability);
  if (modeAvailable(availability, "laf_model")) return "laf_model";
  return "record_only";
}

function reconciledMode(
  availability: ModelAvailability,
  value: ModelMode,
  applyDefault: boolean,
): ModelMode | null {
  const nextMode = preferredMode(availability);
  if (applyDefault) return value === nextMode ? null : nextMode;
  if (value === "laf_model") {
    return modeAvailable(availability, "laf_model") ? null : nextMode;
  }
  if (!cliAvailable(availability)) {
    return modeAvailable(availability, "laf_model") ? "laf_model" : null;
  }
  const nextCLI = cliMode(availability);
  return value === nextCLI ? null : nextCLI;
}

export function ModelModeToggle({
  className,
  value,
  onChange,
}: {
  className?: string;
  value: ModelMode;
  onChange: (mode: ModelMode) => void;
}) {
  const appliedDefaultRef = useRef(false);
  const tooltipId = useId();
  const availabilityQuery = useQuery({
    queryKey: ["model-availability"],
    queryFn: getModelAvailability,
    staleTime: 30_000,
  });
  const availability = availabilityQuery.data;
  const lafAvailable = modeAvailable(availability, "laf_model");
  const hasCLI = cliAvailable(availability);
  const selectedIsLAF = value === "laf_model";
  const disabled = Boolean(availability) && !lafAvailable && !hasCLI;
  const title = availability
    ? disabled
      ? cliUnavailableTitle(availability)
      : selectedIsLAF
        ? LAF_ACTIVE_TITLE
        : cliActiveTitle(availability)
    : undefined;

  useEffect(() => {
    if (!availability) return;
    const nextMode = reconciledMode(
      availability,
      value,
      !appliedDefaultRef.current,
    );
    appliedDefaultRef.current = true;
    if (nextMode) onChange(nextMode);
  }, [availability, onChange, value]);

  function handleToggle(nextChecked: boolean) {
    if (!availability) return;
    if (nextChecked) {
      if (lafAvailable) onChange("laf_model");
      return;
    }
    if (hasCLI) onChange(cliMode(availability));
  }

  return (
    <fieldset
      className={cn(
        "model-mode-toggle",
        "model-mode-switch",
        disabled && "is-disabled",
        className,
      )}
      aria-describedby={title ? tooltipId : undefined}
    >
      <legend className="sr-only">Model execution mode</legend>
      <label className="model-mode-switch-control">
        <input
          type="checkbox"
          checked={selectedIsLAF}
          disabled={disabled}
          aria-label="LAF model mode"
          onChange={(event) => handleToggle(event.currentTarget.checked)}
        />
        <span
          className="model-mode-switch-track"
          aria-hidden="true"
          data-laf-available={lafAvailable ? "true" : "false"}
          data-cli-available={hasCLI ? "true" : "false"}
        >
          <span className="model-mode-switch-option model-mode-switch-option-cli">
            CLI
          </span>
          <span className="model-mode-switch-option model-mode-switch-option-laf">
            LAF
          </span>
          <span className="model-mode-switch-thumb" />
        </span>
      </label>
      {title ? (
        <span className="model-mode-tooltip" id={tooltipId} role="tooltip">
          {title}
        </span>
      ) : null}
    </fieldset>
  );
}
