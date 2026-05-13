import { sseURL } from "./client";

type Listener = EventListenerOrEventListenerObject;

const brokerEventListeners = new Map<string, Set<Listener>>();

let brokerEventSource: EventSource | null = null;
let brokerEventSourceURL = "";

function eventSourceConstructor(): typeof EventSource | null {
  return (
    (globalThis as { EventSource?: typeof EventSource }).EventSource ?? null
  );
}

function hasListeners(): boolean {
  for (const listeners of brokerEventListeners.values()) {
    if (listeners.size > 0) return true;
  }
  return false;
}

function attachRegisteredListeners(source: EventSource) {
  for (const [name, listeners] of brokerEventListeners.entries()) {
    for (const listener of listeners) {
      source.addEventListener(name, listener);
    }
  }
}

function eventSourceIsClosed(
  source: EventSource,
  ES: typeof EventSource,
): boolean {
  return typeof ES.CLOSED === "number" && source.readyState === ES.CLOSED;
}

function ensureBrokerEventSource(): EventSource | null {
  const ES = eventSourceConstructor();
  if (!ES) return null;

  const url = sseURL("/events");
  if (
    brokerEventSource &&
    brokerEventSourceURL === url &&
    !eventSourceIsClosed(brokerEventSource, ES)
  ) {
    return brokerEventSource;
  }

  if (brokerEventSource) {
    brokerEventSource.close();
  }
  try {
    brokerEventSource = new ES(url);
  } catch {
    brokerEventSource = null;
    brokerEventSourceURL = "";
    return null;
  }
  brokerEventSourceURL = url;
  attachRegisteredListeners(brokerEventSource);
  return brokerEventSource;
}

function closeBrokerEventSourceIfIdle() {
  if (hasListeners()) return;
  if (brokerEventSource) {
    brokerEventSource.close();
    brokerEventSource = null;
    brokerEventSourceURL = "";
  }
}

export function subscribeBrokerEvent(
  name: string,
  listener: Listener,
): () => void {
  const source = ensureBrokerEventSource();
  if (!source) return () => {};

  const listeners = brokerEventListeners.get(name) ?? new Set<Listener>();
  listeners.add(listener);
  brokerEventListeners.set(name, listeners);
  source.addEventListener(name, listener);

  return () => {
    const current = brokerEventListeners.get(name);
    if (current) {
      current.delete(listener);
      if (current.size === 0) brokerEventListeners.delete(name);
    }
    if (brokerEventSource) {
      brokerEventSource.removeEventListener(name, listener);
    }
    closeBrokerEventSourceIfIdle();
  };
}

export function brokerEventSourceIsClosed(): boolean {
  const ES = eventSourceConstructor();
  return !!(
    ES &&
    brokerEventSource &&
    eventSourceIsClosed(brokerEventSource, ES)
  );
}
