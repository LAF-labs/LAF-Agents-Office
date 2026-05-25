import { post } from "../api/client";

export type ClientErrorSource =
  | "window.error"
  | "unhandledrejection"
  | "react_mount"
  | "manual";

export type ClientErrorReportInput = {
  column?: number;
  error?: unknown;
  filename?: string;
  line?: number;
  message?: string;
  source?: ClientErrorSource;
};

type BrowserLike = Pick<
  Window,
  "addEventListener" | "innerHeight" | "innerWidth" | "location"
>;

let installed = false;

export function installClientErrorReporter(win: BrowserLike = window): void {
  if (installed) return;
  installed = true;
  win.addEventListener("error", (event) => {
    void reportClientError(
      {
        column: event.colno,
        error: event.error,
        filename: event.filename,
        line: event.lineno,
        message: event.message,
        source: "window.error",
      },
      win,
    );
  });
  win.addEventListener("unhandledrejection", (event) => {
    void reportClientError(
      {
        error: event.reason,
        message: errorMessage(event.reason),
        source: "unhandledrejection",
      },
      win,
    );
  });
}

export async function reportClientError(
  input: ClientErrorReportInput,
  win: BrowserLike = window,
): Promise<void> {
  try {
    await post("/client-errors", clientErrorPayload(input, win));
  } catch {
    // Telemetry must never create another visible app failure.
  }
}

export function clientErrorPayload(
  input: ClientErrorReportInput,
  win: BrowserLike = window,
) {
  const message = cleanClientText(
    input.message || errorMessage(input.error),
    300,
  );
  const name = cleanClientText(errorName(input.error), 80);
  const route = currentClientTelemetryRoute(win);
  const filename = safeFilename(input.filename);
  const line = safePositiveInt(input.line);
  const column = safePositiveInt(input.column);
  return {
    column,
    filename,
    fingerprint: fingerprint(
      [
        input.source || "manual",
        name,
        message,
        route,
        filename,
        line,
        column,
      ].join("|"),
    ),
    line,
    message,
    name,
    release: cleanClientText(import.meta.env.VITE_LAF_RELEASE || "", 80),
    route,
    source: input.source || "manual",
    viewport: {
      height: safePositiveInt(win.innerHeight),
      width: safePositiveInt(win.innerWidth),
    },
  };
}

export function currentClientTelemetryRoute(
  win: Pick<Window, "location"> = window,
): string {
  const pathname = win.location?.pathname || "/";
  const hash = String(win.location?.hash || "")
    .replace(/^#\/?/, "")
    .split(/[/?#]/)[0];
  const safeHash = /^[a-z0-9_-]{1,40}$/i.test(hash)
    ? `#${hash.toLowerCase()}`
    : "";
  return `${pathname.split(/[?#]/)[0] || "/"}${safeHash}`;
}

export function cleanClientText(value: string, maxLength: number): string {
  const redacted = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/[^\s)]+/gi, "[url]")
    .replace(/\b(token|secret|password|key)=([^&\s]+)/gi, "$1=[redacted]")
    .trim();
  return redacted.length > maxLength ? redacted.slice(0, maxLength) : redacted;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "client error";
}

function errorName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  return "Error";
}

function safeFilename(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, window.location.origin);
    return cleanClientText(
      url.pathname.split("/").filter(Boolean).pop() || "",
      120,
    );
  } catch {
    return cleanClientText(raw.split(/[\\/]/).pop() || "", 120);
  }
}

function safePositiveInt(value: unknown): number {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(1_000_000, Math.floor(number));
}

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(16, "0");
}
