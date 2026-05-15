import { describe, expect, it, vi } from "vitest";

const broker = vi.hoisted(() => ({
  listeners: new Map<string, Set<EventListener>>(),
}));

vi.mock("./events", () => ({
  subscribeBrokerEvent: vi.fn((name: string, listener: EventListener) => {
    const listeners = broker.listeners.get(name) ?? new Set<EventListener>();
    listeners.add(listener);
    broker.listeners.set(name, listeners);
    return () => listeners.delete(listener);
  }),
}));

import {
  executionPlanIDFromEvent,
  subscribeExecutionPlanEvents,
} from "./executionEvents";

function emit(name: string, payload: unknown) {
  const event = { data: JSON.stringify(payload) } as MessageEvent;
  for (const listener of broker.listeners.get(name) ?? []) {
    listener(event);
  }
}

describe("execution plan broker events", () => {
  it("extracts plan ids from direct and nested payloads", () => {
    expect(executionPlanIDFromEvent({ plan_id: "plan-1" })).toBe("plan-1");
    expect(executionPlanIDFromEvent({ plan: { id: "plan-2" } })).toBe("plan-2");
    expect(
      executionPlanIDFromEvent({
        event: { execution_plan_id: "plan-3" },
      }),
    ).toBe("plan-3");
    expect(executionPlanIDFromEvent({ receipt: { plan_id: "plan-4" } })).toBe(
      "plan-4",
    );
  });

  it("subscribes to execution events and filters by plan id", () => {
    broker.listeners.clear();
    const onEvent = vi.fn();
    const unsubscribe = subscribeExecutionPlanEvents("plan-1", onEvent);

    expect(broker.listeners.has("execution.plan.created")).toBe(true);
    expect(broker.listeners.has("execution:event_recorded")).toBe(true);

    emit("execution.plan.created", { plan_id: "other-plan" });
    emit("execution:event_recorded", {
      event: { execution_plan_id: "plan-1" },
      line: "Running tests",
    });
    emit("execution.completed", { receipt: { plan_id: "plan-1" } });

    expect(onEvent).toHaveBeenCalledTimes(2);
    unsubscribe();
    emit("execution.completed", { plan_id: "plan-1" });
    expect(onEvent).toHaveBeenCalledTimes(2);
  });
});
