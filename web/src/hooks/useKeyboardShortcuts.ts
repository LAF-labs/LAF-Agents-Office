import { useEffect } from "react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";

import { getChannels } from "../api/client";
import { useAppStore } from "../stores/app";

/**
 * `?` opens the global help/shortcut reference, but only when the user
 * is not currently typing. Returning true here means we intercept the
 * keystroke; false means let it through to the focused field.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function hasCommandModifier(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

function handleSearchShortcut(
  e: KeyboardEvent,
  setSearchOpen: (open: boolean) => void,
): boolean {
  if (!(hasCommandModifier(e) && e.key === "k")) return false;
  e.preventDefault();
  const state = useAppStore.getState();
  setSearchOpen(!state.searchOpen);
  return true;
}

function handleComposerFocusShortcut(e: KeyboardEvent): boolean {
  if (!(hasCommandModifier(e) && e.key === "/")) return false;
  e.preventDefault();
  document.querySelector<HTMLTextAreaElement>(".composer-input")?.focus();
  return true;
}

function handleChannelJumpShortcut(
  e: KeyboardEvent,
  queryClient: QueryClient,
  setCurrentApp: (app: string | null) => void,
  setCurrentChannel: (channel: string) => void,
  setLastMessageId: (id: string | null) => void,
): boolean {
  if (!(hasCommandModifier(e) && e.key >= "1" && e.key <= "9")) return false;
  const cached = queryClient.getQueryData<{ channels: { slug: string }[] }>([
    "channels",
  ]);
  const channels = cached?.channels;
  if (!channels) {
    getChannels()
      .then((data) => {
        queryClient.setQueryData(["channels"], data);
      })
      .catch(() => {});
    return true;
  }
  const channel = channels[parseInt(e.key, 10) - 1];
  if (!channel) return true;
  e.preventDefault();
  setCurrentApp(null);
  setCurrentChannel(channel.slug);
  setLastMessageId(null);
  return true;
}

function handleHelpShortcut(
  e: KeyboardEvent,
  setComposerHelpOpen: (open: boolean) => void,
): boolean {
  if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return false;
  if (isTypingTarget(e.target)) return true;
  const state = useAppStore.getState();
  if (!state.onboardingComplete) return true;
  e.preventDefault();
  setComposerHelpOpen(!state.composerHelpOpen);
  return true;
}

function handleEscapeShortcut(
  e: KeyboardEvent,
  setComposerHelpOpen: (open: boolean) => void,
  setSearchOpen: (open: boolean) => void,
  setActiveAgentSlug: (slug: string | null) => void,
  setActiveThreadId: (id: string | null) => void,
): boolean {
  if (e.key !== "Escape") return false;
  const state = useAppStore.getState();
  if (state.composerHelpOpen) {
    setComposerHelpOpen(false);
    return true;
  }
  if (state.searchOpen) {
    setSearchOpen(false);
    return true;
  }
  if (state.activeAgentSlug) {
    setActiveAgentSlug(null);
    return true;
  }
  if (state.activeThreadId) {
    setActiveThreadId(null);
    return true;
  }
  return false;
}

/** Global keyboard shortcuts matching legacy behavior. */
export function useKeyboardShortcuts() {
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const setActiveAgentSlug = useAppStore((s) => s.setActiveAgentSlug);
  const setActiveThreadId = useAppStore((s) => s.setActiveThreadId);
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const setCurrentChannel = useAppStore((s) => s.setCurrentChannel);
  const setLastMessageId = useAppStore((s) => s.setLastMessageId);
  const setComposerHelpOpen = useAppStore((s) => s.setComposerHelpOpen);
  const queryClient = useQueryClient();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K or Ctrl+K → command palette
      if (handleSearchShortcut(e, setSearchOpen)) return;

      // Cmd+/ or Ctrl+/ → focus composer
      if (handleComposerFocusShortcut(e)) return;

      // Cmd+1..9 → quick-jump to nth channel
      if (
        handleChannelJumpShortcut(
          e,
          queryClient,
          setCurrentApp,
          setCurrentChannel,
          setLastMessageId,
        )
      )
        return;

      // `?` → open keyboard + command reference. Only when not typing,
      // since `?` is a plain character inside inputs. Shift+/ also
      // produces `?` on US layouts, so we match on e.key rather than
      // juggling modifier state. Skip during onboarding since the
      // HelpModalHost lives in Shell — toggling composerHelpOpen there
      // would set hidden state and then surprise the user after the
      // wizard completes.
      if (handleHelpShortcut(e, setComposerHelpOpen)) return;

      // Escape → close panels in priority order
      handleEscapeShortcut(
        e,
        setComposerHelpOpen,
        setSearchOpen,
        setActiveAgentSlug,
        setActiveThreadId,
      );
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    setSearchOpen,
    setActiveAgentSlug,
    setActiveThreadId,
    setCurrentApp,
    setCurrentChannel,
    setLastMessageId,
    setComposerHelpOpen,
    queryClient,
  ]);
}
