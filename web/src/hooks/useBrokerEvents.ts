import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { subscribeBrokerEvent } from "../api/events";
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

    const unsubscribes = [
      subscribeBrokerEvent("ready", () => setBrokerConnected(true)),
      subscribeBrokerEvent("message", () => {
        scheduleInvalidate(["messages"]);
        scheduleInvalidate(["thread-messages"]);
        scheduleInvalidate(["office-members"]);
        scheduleInvalidate(["channel-members"]);
      }),
      subscribeBrokerEvent("activity", () => {
        scheduleInvalidate(["activity-members"]);
        scheduleInvalidate(["office-members"]);
        scheduleInvalidate(["channel-members"]);
      }),
      subscribeBrokerEvent("office_changed", () => {
        scheduleInvalidate(["activity-members"]);
        scheduleInvalidate(["channels"]);
        scheduleInvalidate(["office-members"]);
        scheduleInvalidate(["channel-members"]);
      }),
      subscribeBrokerEvent("action", () => {
        scheduleInvalidate(["actions"]);
        scheduleInvalidate(["activity-actions"]);
        scheduleInvalidate(["activity-tasks"]);
        scheduleInvalidate(["office-tasks"]);
        scheduleInvalidate(["requests"]);
        scheduleInvalidate(["requests-badge"]);
        scheduleInvalidate(["task-actions"]);
      }),
      subscribeBrokerEvent("review:state_change", () => {
        scheduleInvalidate(["reviews-badge"]);
        scheduleInvalidate(["reviews-tab-badge"]);
      }),
      subscribeBrokerEvent("error", () => setBrokerConnected(false)),
    ];

    return () => {
      if (timer) clearTimeout(timer);
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [enabled, queryClient, setBrokerConnected]);
}
