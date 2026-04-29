import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBrokerEvents } from "./useBrokerEvents";

vi.mock("../api/client", () => ({
  sseURL: () => "/events",
}));

type Listener = EventListenerOrEventListenerObject;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  listeners = new Map<string, Listener[]>();
  close = vi.fn();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: Listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  emit(name: string) {
    const event = new MessageEvent(name, { data: "{}" });
    for (const listener of this.listeners.get(name) ?? []) {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }
}

describe("useBrokerEvents", () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    (globalThis as { EventSource?: typeof EventSource }).EventSource =
      FakeEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as { EventSource?: typeof EventSource }).EventSource =
      originalEventSource;
  });

  function renderWithClient(queryClient: QueryClient) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useBrokerEvents(true), { wrapper });
  }

  it("debounces duplicate message invalidations into one cache refresh per key", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderWithClient(queryClient);
    const [source] = FakeEventSource.instances;

    act(() => {
      source.emit("message");
      source.emit("message");
      vi.advanceTimersByTime(249);
    });

    expect(invalidateSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(4);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["messages"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["thread-messages"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["office-members"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["channel-members"],
    });
  });

  it("clears pending invalidations when the event stream unmounts", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { unmount } = renderWithClient(queryClient);
    const [source] = FakeEventSource.instances;

    act(() => {
      source.emit("action");
      unmount();
      vi.advanceTimersByTime(250);
    });

    expect(source.close).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
