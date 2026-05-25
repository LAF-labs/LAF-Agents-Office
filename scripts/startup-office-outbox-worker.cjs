#!/usr/bin/env node

const {
  createStartupOfficeOutboxDeliveryProvider,
  createStartupOfficeOutboxWorker,
} = require("../workers/startup-office/outboxWorker");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function supabaseURL(path) {
  return `${requiredEnv("SUPABASE_URL").replace(/\/+$/, "")}${path}`;
}

function serviceHeaders(extra = {}) {
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(supabaseURL(path), {
    method: options.method || "GET",
    headers: serviceHeaders(options.headers),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || response.statusText);
  }
  return text ? JSON.parse(text) : null;
}

async function claimOutboxEvent() {
  return supabaseFetch("/rest/v1/rpc/claim_startup_office_outbox_event", {
    method: "POST",
    body: {
      p_lock_ms: Number(process.env.LAF_OUTBOX_LOCK_MS || 300000),
      p_worker_id: process.env.LAF_OUTBOX_WORKER_ID || "startup-office-outbox-worker",
    },
  });
}

async function updateOutboxEvent(id, patch) {
  return supabaseFetch(`/rest/v1/startup_office_outbox_events?id=eq.${encodeURIComponent(id)}`, {
    headers: { Prefer: "return=minimal" },
    method: "PATCH",
    body: patch,
  });
}

async function updateNotification(id, patch) {
  return supabaseFetch(`/rest/v1/startup_office_notifications?id=eq.${encodeURIComponent(id)}`, {
    headers: { Prefer: "return=minimal" },
    method: "PATCH",
    body: patch,
  });
}

async function main() {
  const worker = createStartupOfficeOutboxWorker({
    claimOutboxEvent,
    deliverOutboxEvent: createStartupOfficeOutboxDeliveryProvider({
      updateNotification,
    }),
    updateOutboxEvent,
  });
  const result = await worker.processBatch({
    limit: Number(process.env.LAF_OUTBOX_BATCH_SIZE || 25),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
