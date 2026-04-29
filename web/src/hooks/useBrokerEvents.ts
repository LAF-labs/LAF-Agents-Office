import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { sseURL } from "../api/client";
import { useAppStore } from "../stores/app";

type QueryKey = readonly unknown[];

const INVALIDATE_DEBOUNCE_MS = 250;

function queryKeyId(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

export function useBrokerEvents(enabled: boolean) {
  const queryClient = useQueryClient();
  const setBrokerConnected = useAppStore((s) => s.setBrokerConnected);

  useEffect(() => {
    if (!enabled) return;

    const ES = (globalThis as { EventSource?: typeof EventSource }).EventSource;
    if (!ES) return;

    const pending = new Map<string, QueryKey>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const keys = Array.from(pending.values());
      pending.clear();
      for (const queryKey of keys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };
    const scheduleInvalidate = (queryKey: QueryKey) => {
      pending.set(queryKeyId(queryKey), queryKey);
      if (timer) return;
      timer = setTimeout(flush, INVALIDATE_DEBOUNCE_MS);
    };

    const source = new ES(sseURL("/events"));
    source.addEventListener("ready", () => setBrokerConnected(true));
    source.addEventListener("message", () => {
      scheduleInvalidate(["messages"]);
      scheduleInvalidate(["thread-messages"]);
      scheduleInvalidate(["office-members"]);
      scheduleInvalidate(["channel-members"]);
    });
    source.addEventListener("activity", () => {
      scheduleInvalidate(["activity-members"]);
      scheduleInvalidate(["office-members"]);
      scheduleInvalidate(["channel-members"]);
    });
    source.addEventListener("office_changed", () => {
      scheduleInvalidate(["activity-members"]);
      scheduleInvalidate(["channels"]);
      scheduleInvalidate(["office-members"]);
      scheduleInvalidate(["channel-members"]);
    });
    source.addEventListener("action", () => {
      scheduleInvalidate(["actions"]);
      scheduleInvalidate(["activity-actions"]);
      scheduleInvalidate(["activity-tasks"]);
      scheduleInvalidate(["office-tasks"]);
      scheduleInvalidate(["requests"]);
      scheduleInvalidate(["requests-badge"]);
      scheduleInvalidate(["task-actions"]);
    });
    source.addEventListener("review:state_change", () => {
      scheduleInvalidate(["reviews-badge"]);
      scheduleInvalidate(["reviews-tab-badge"]);
    });
    source.onerror = () => setBrokerConnected(false);

    return () => {
      if (timer) clearTimeout(timer);
      source.close();
    };
  }, [enabled, queryClient, setBrokerConnected]);
}
