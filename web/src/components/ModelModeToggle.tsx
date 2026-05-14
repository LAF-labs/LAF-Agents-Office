import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getModelAvailability,
  type ModelAvailability,
  type ModelMode,
} from "../api/client";
import { cn } from "../lib/utils";

const MODEL_MODE_LABELS: Record<ModelMode, string> = {
  laf_model: "LAF",
  my_bridge: "Bridge",
  team_bridge: "Team",
  record_only: "Record",
};

const MODEL_MODE_ORDER: ModelMode[] = ["laf_model", "my_bridge", "record_only"];

function modeReason(
  availability: ModelAvailability | undefined,
  mode: ModelMode,
): string {
  if (!availability) return "Checking availability";
  return availability[mode]?.reason || "";
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
  const availabilityQuery = useQuery({
    queryKey: ["model-availability"],
    queryFn: getModelAvailability,
    staleTime: 30_000,
  });
  const availability = availabilityQuery.data;
  const allowedModes = availability?.allowed_modes ?? ["record_only"];

  useEffect(() => {
    if (!availability) return;
    if (!appliedDefaultRef.current) {
      appliedDefaultRef.current = true;
      if (
        allowedModes.includes(availability.default_mode) &&
        value !== availability.default_mode
      ) {
        onChange(availability.default_mode);
        return;
      }
    }
    if (!allowedModes.includes(value)) {
      onChange(availability.default_mode);
    }
  }, [allowedModes, availability, onChange, value]);

  return (
    <fieldset className={cn("model-mode-toggle", className)}>
      <legend className="sr-only">Model execution mode</legend>
      {MODEL_MODE_ORDER.map((mode) => {
        const allowed = allowedModes.includes(mode);
        const active = value === mode;
        const reason = modeReason(availability, mode);
        return (
          <button
            type="button"
            key={mode}
            className={active ? "is-active" : ""}
            disabled={!allowed}
            title={allowed ? MODEL_MODE_LABELS[mode] : reason}
            aria-pressed={active}
            onClick={() => onChange(mode)}
          >
            {MODEL_MODE_LABELS[mode]}
          </button>
        );
      })}
      {availability?.reason ? <span>{availability.reason}</span> : null}
    </fieldset>
  );
}
