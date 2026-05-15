import { subscribeBrokerEvent } from "./events";

export type ExecutionPlanEventPayload = Record<string, unknown>;

const EXECUTION_EVENT_NAMES = [
  "execution.plan.created",
  "execution.event",
  "execution.completed",
  "execution.cancelled",
  "execution:plan_updated",
  "execution:event_recorded",
  "execution:completed",
  "execution:cancelled",
] as const;

export function executionPlanIDFromEvent(
  payload: ExecutionPlanEventPayload,
): string {
  return (
    stringField(payload, "plan_id", "execution_plan_id", "id") ||
    stringField(recordField(payload, "plan") ?? {}, "id", "plan_id") ||
    stringField(
      recordField(payload, "event") ?? {},
      "plan_id",
      "execution_plan_id",
    ) ||
    stringField(
      recordField(payload, "receipt") ?? {},
      "plan_id",
      "execution_plan_id",
    )
  );
}

export function subscribeExecutionPlanEvents(
  planID: string,
  handler: (event: ExecutionPlanEventPayload) => void,
): () => void {
  const targetPlanID = planID.trim();
  if (!targetPlanID) return () => {};

  let closed = false;
  const onEvent = (ev: MessageEvent) => {
    if (closed) return;
    try {
      const data = JSON.parse(String(ev.data)) as ExecutionPlanEventPayload;
      if (data && executionPlanIDFromEvent(data) === targetPlanID) {
        handler(data);
      }
    } catch {
      // ignore malformed broker events
    }
  };

  const unsubscribes = EXECUTION_EVENT_NAMES.map((name) =>
    subscribeBrokerEvent(name, onEvent as EventListener),
  );

  return () => {
    closed = true;
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}

function recordField(
  payload: ExecutionPlanEventPayload,
  name: string,
): Record<string, unknown> | null {
  const value = payload[name];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(
  payload: Record<string, unknown>,
  ...names: string[]
): string {
  for (const name of names) {
    const value = payload[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
