import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  listPamActions,
  type PamActionDescriptor,
  type PamActionEvent,
  subscribePamEvents,
} from "../../api/pam";
import { buildPamMenu, type PamMenuEntry } from "../../lib/pamActions";
import { useUiText } from "../../lib/uiText";
import { PixelAvatar } from "../ui/PixelAvatar";
import "../../styles/pam.css";

interface PamProps {
  /**
   * The article Pam should act on. `null` means we're outside an article
   * view (catalog, audit) — Pam still renders as part of the wiki chrome
   * but article-scoped actions are disabled.
   */
  articlePath: string | null;
  /**
   * Called once Pam finishes an action (SSE `done`). The Wiki shell uses
   * this to bump an article refresh nonce so the enriched article +
   * history reload without a full navigation.
   */
  onActionDone?: () => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "running"; label: string }
  | { kind: "done"; label: string }
  | { kind: "failed"; message: string };

const STATUS_CLEAR_MS = 4000;

/**
 * Pam — the wiki archivist, perched on the divider line at the top of the
 * wiki shell so she's visible across catalog, article, and audit views.
 * Click Pam to open her desk menu (served from GET /pam/actions so the
 * registry stays server-defined). Selecting an action POSTs to /pam/action;
 * the dispatcher spawns Pam's sub-process and fans results back via /events
 * so we update the status line without polling. Article-scoped actions
 * disable themselves when no article is open.
 */
export default function Pam({ articlePath, onActionDone }: PamProps) {
  const { wiki: copy } = useUiText();
  const [menu, setMenu] = useState<PamMenuEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [activeJobId, setActiveJobId] = useState<number | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuElRef = useRef<HTMLDivElement>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs mirror the state the SSE handler reads. The handler subscribes
  // once on mount (empty deps) — we keep the subscription stable and read
  // the latest activeJobId / menu through refs, rather than resubscribing on
  // every state change (which caused the handler to miss the `started`
  // event landing between trigger and effect re-run).
  const activeJobIdRef = useRef<number | null>(null);
  const menuRef = useRef<PamMenuEntry[] | null>(menu);
  const onActionDoneRef = useRef<(() => void) | undefined>(onActionDone);
  useEffect(() => {
    activeJobIdRef.current = activeJobId;
  }, [activeJobId]);
  useEffect(() => {
    menuRef.current = menu;
  }, [menu]);
  useEffect(() => {
    onActionDoneRef.current = onActionDone;
  }, [onActionDone]);

  const scheduleClear = useCallback(() => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => {
      setStatus({ kind: "idle" });
    }, STATUS_CLEAR_MS);
  }, []);

  // Fetch the action registry once on mount. A fetch failure surfaces a
  // distinct error state in the menu so it's not silently indistinguishable
  // from "no actions available".
  useEffect(() => {
    let cancelled = false;
    listPamActions()
      .then((res) => {
        if (cancelled) return;
        const descriptors: PamActionDescriptor[] = res.actions ?? [];
        setMenu(buildPamMenu(descriptors));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("pam: failed to load action registry", err);
        setLoadError(
          err instanceof Error ? err.message : copy.pamMenuLoadFailed,
        );
        setMenu([]);
      });
    return () => {
      cancelled = true;
    };
  }, [copy]);

  // Subscribe to Pam's SSE progress events exactly once. The handler reads
  // the latest activeJobId / menu / onActionDone via refs so the
  // subscription does not churn on every state change and does not miss a
  // `started` event fired between POST and the next effect pass.
  useEffect(() => {
    const unsub = subscribePamEvents((evt: PamActionEvent) => {
      handlePamEvent(evt, activeJobIdRef.current, menuRef.current, {
        setStatus,
        setActiveJobId,
        scheduleClear,
        onActionDone: onActionDoneRef.current,
        finishFailed: copy.pamFinishFailed,
      });
    });
    return () => {
      unsub();
    };
  }, [scheduleClear, copy]);

  // Close menu on outside click so it doesn't linger when the user moves
  // on. Keep it simple: single global listener, cleaned up on unmount.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  // When the menu opens, focus the first menuitem so keyboard users can
  // immediately arrow through the list. Runs after paint so the button
  // exists in the DOM.
  useEffect(() => {
    if (!menuOpen) return;
    const firstItem =
      menuElRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    firstItem?.focus();
  }, [menuOpen]);

  const closeMenuAndRefocus = useCallback(() => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  const runAction = useCallback(
    async (entry: PamMenuEntry) => {
      if (!articlePath) return;
      setMenuOpen(false);
      setStatus({ kind: "running", label: entry.label });
      try {
        const { job_id } = await entry.run({ articlePath });
        setActiveJobId(job_id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : copy.pamStartFailed;
        setStatus({ kind: "failed", message: msg });
        setActiveJobId(null);
        scheduleClear();
      }
    },
    [articlePath, scheduleClear, copy],
  );

  const onMenuKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      handlePamMenuKeyDown(e, menuElRef.current, closeMenuAndRefocus);
    },
    [closeMenuAndRefocus],
  );

  const busy = status.kind === "running";

  return (
    <div ref={wrapRef} className="pam-wrap" data-testid="pam-wrap">
      <button
        type="button"
        ref={triggerRef}
        className="pam-button"
        data-busy={busy ? "true" : "false"}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={copy.pamAria}
        title={copy.pamTitle}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <PixelAvatar slug="pam" size={18} className="pam-avatar" />
      </button>
      <div className="pam-desk" aria-hidden="true" />

      {menuOpen ? (
        <PamMenu
          menuElRef={menuElRef}
          onMenuKeyDown={onMenuKeyDown}
          menu={menu}
          loadError={loadError}
          articlePath={articlePath}
          busy={busy}
          runAction={runAction}
          copy={copy}
        />
      ) : null}

      {status.kind !== "idle" && (
        <div
          className={`pam-status${menuOpen ? " is-behind-menu" : ""}`}
          role="status"
          aria-live="polite"
          aria-hidden={menuOpen}
        >
          {renderStatus(status, copy)}
        </div>
      )}
    </div>
  );
}

interface PamMenuProps {
  menuElRef: RefObject<HTMLDivElement | null>;
  onMenuKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  menu: PamMenuEntry[] | null;
  loadError: string | null;
  articlePath: string | null;
  busy: boolean;
  runAction: (entry: PamMenuEntry) => Promise<void>;
  copy: ReturnType<typeof useUiText>["wiki"];
}

function PamMenu({
  menuElRef,
  onMenuKeyDown,
  menu,
  loadError,
  articlePath,
  busy,
  runAction,
  copy,
}: PamMenuProps) {
  return (
    <div
      ref={menuElRef}
      className="pam-menu"
      role="menu"
      aria-label={copy.pamActionsAria}
      onKeyDown={onMenuKeyDown}
    >
      <div className="pam-menu-header">{copy.pamMenuHeader}</div>
      <PamMenuItems
        menu={menu}
        loadError={loadError}
        articlePath={articlePath}
        busy={busy}
        runAction={runAction}
        copy={copy}
      />
    </div>
  );
}

function PamMenuItems({
  menu,
  loadError,
  articlePath,
  busy,
  runAction,
  copy,
}: Pick<
  PamMenuProps,
  "menu" | "loadError" | "articlePath" | "busy" | "runAction"
> & { copy: ReturnType<typeof useUiText>["wiki"] }) {
  if (menu === null)
    return <div className="pam-menu-empty">{copy.pamMenuLoading}</div>;
  if (loadError) {
    return (
      <div className="pam-menu-empty" role="alert">
        {copy.pamMenuLoadFailed}
      </div>
    );
  }
  if (menu.length === 0) {
    return <div className="pam-menu-empty">{copy.pamNoActions}</div>;
  }
  if (!articlePath) {
    return <div className="pam-menu-empty">{copy.pamOpenArticle}</div>;
  }
  return (
    <>
      {menu.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="menuitem"
          className="pam-menu-item"
          disabled={busy}
          onClick={() => {
            void runAction(entry);
          }}
        >
          {entry.label}
        </button>
      ))}
    </>
  );
}

function assertNever(x: never): never {
  throw new Error(`pam: unexpected status kind ${JSON.stringify(x)}`);
}

function renderStatus(
  status: Status,
  copy: ReturnType<typeof useUiText>["wiki"],
): string {
  switch (status.kind) {
    case "idle":
      return "";
    case "running":
      return copy.pamRunning(status.label);
    case "done":
      return copy.pamDone(status.label);
    case "failed":
      return copy.pamFailed(status.message);
    default:
      return assertNever(status);
  }
}

function labelFor(id: string, menu: PamMenuEntry[] | null): string {
  if (!menu) return id;
  const hit = menu.find((m) => m.id === id);
  return hit?.label ?? id;
}

function handlePamEvent(
  evt: PamActionEvent,
  currentJobId: number | null,
  menu: PamMenuEntry[] | null,
  actions: {
    setStatus: (status: Status) => void;
    setActiveJobId: (id: number | null) => void;
    scheduleClear: () => void;
    onActionDone?: () => void;
    finishFailed: string;
  },
) {
  if (currentJobId === null || evt.job_id !== currentJobId) return;
  if (evt.kind === "started") {
    actions.setStatus({
      kind: "running",
      label: labelFor(evt.action, menu),
    });
    return;
  }
  if (evt.kind === "done") {
    actions.setStatus({
      kind: "done",
      label: labelFor(evt.action, menu),
    });
    actions.setActiveJobId(null);
    actions.scheduleClear();
    actions.onActionDone?.();
    return;
  }
  if (evt.kind === "failed") {
    actions.setStatus({
      kind: "failed",
      message: evt.error || actions.finishFailed,
    });
    actions.setActiveJobId(null);
    actions.scheduleClear();
  }
}

function enabledMenuItems(menuEl: HTMLDivElement | null): HTMLButtonElement[] {
  return Array.from(
    menuEl?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
  ).filter((el) => !el.disabled);
}

function handlePamMenuKeyDown(
  e: ReactKeyboardEvent<HTMLDivElement>,
  menuEl: HTMLDivElement | null,
  closeMenuAndRefocus: () => void,
) {
  if (e.key === "Escape") {
    e.preventDefault();
    closeMenuAndRefocus();
    return;
  }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const items = enabledMenuItems(menuEl);
  if (items.length === 0) return;
  e.preventDefault();
  const activeIndex = items.indexOf(
    document.activeElement as HTMLButtonElement,
  );
  const nextIndex =
    e.key === "ArrowDown"
      ? (activeIndex + 1 + items.length) % items.length
      : (activeIndex - 1 + items.length) % items.length;
  items[nextIndex]?.focus();
}
