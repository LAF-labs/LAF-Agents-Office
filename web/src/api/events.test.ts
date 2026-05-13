import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeBrokerEvent } from "./events";

vi.mock("./client", () => ({
  sseURL: () => "/events",
}));

type Listener = EventListenerOrEventListenerObject;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  listeners = new Map<string, Set<Listener>>();
  close = vi.fn();
  readyState = 1;
  static CLOSED = 2;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: Listener) {
    const listeners = this.listeners.get(name) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: Listener) {
    this.listeners.get(name)?.delete(listener);
  }

  emit(name: string, data: unknown = {}) {
    const event = new MessageEvent(name, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(name) ?? []) {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }
}

describe("broker event bus", () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    FakeEventSource.instances = [];
    (globalThis as { EventSource?: typeof EventSource }).EventSource =
      FakeEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    (globalThis as { EventSource?: typeof EventSource }).EventSource =
      originalEventSource;
  });

  it("shares one /events EventSource across named subscriptions", () => {
    const onMessage = vi.fn();
    const onAction = vi.fn();

    const unsubMessage = subscribeBrokerEvent("message", onMessage);
    const unsubAction = subscribeBrokerEvent("action", onAction);

    expect(FakeEventSource.instances).toHaveLength(1);
    const [source] = FakeEventSource.instances;
    expect(source.url).toBe("/events");

    source.emit("message", { id: "m1" });
    source.emit("action", { id: "a1" });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(1);

    unsubMessage();
    expect(source.close).not.toHaveBeenCalled();
    unsubAction();
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  it("recreates a terminally closed EventSource for new subscriptions", () => {
    const onMessage = vi.fn();
    const onAction = vi.fn();

    const unsubMessage = subscribeBrokerEvent("message", onMessage);
    const [closedSource] = FakeEventSource.instances;
    closedSource.readyState = FakeEventSource.CLOSED;

    const unsubAction = subscribeBrokerEvent("action", onAction);

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(closedSource.close).toHaveBeenCalledTimes(1);
    const [, reopenedSource] = FakeEventSource.instances;

    reopenedSource.emit("message", { id: "m1" });
    reopenedSource.emit("action", { id: "a1" });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(1);

    unsubMessage();
    unsubAction();
  });
});
