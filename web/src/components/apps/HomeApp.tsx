import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hashtag, Plus, SendDiagonal } from "iconoir-react";

import {
  createProject,
  getConfig,
  getProjects,
  getThreadMessages,
  type Message,
  type OfficeMember,
  type Project,
  postMessage,
} from "../../api/client";
import { useOfficeMembers } from "../../hooks/useMembers";
import { formatTime } from "../../lib/format";
import { formatMarkdown } from "../../lib/markdown";
import { extractTaggedMentions, renderMentions } from "../../lib/mentions";
import { PixelAvatar } from "../ui/PixelAvatar";

const HOME_CHANNEL = "general";
const NON_AGENT_SLUGS = new Set(["human", "you", "system"]);

function createHomeChatThreadId(): string {
  const cryptoUUID =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `home-chat-${cryptoUUID}`;
}

function projectTime(project: Project): number {
  const parsed = Date.parse(project.updated_at || project.created_at || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortProjectsByRecent(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const byTime = projectTime(b) - projectTime(a);
    if (byTime !== 0) return byTime;
    return (a.name || a.id).localeCompare(b.name || b.id);
  });
}

function projectHashtag(project: Project): string {
  return `#${project.id || project.name.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

function resolveLeadSlug(
  configured: string | undefined,
  members: OfficeMember[],
): string {
  const explicit = configured?.trim().toLowerCase();
  if (explicit && !NON_AGENT_SLUGS.has(explicit)) return explicit;
  const builtin = members.find(
    (member) =>
      member.built_in &&
      member.slug &&
      !NON_AGENT_SLUGS.has(member.slug.toLowerCase()),
  );
  return builtin?.slug || "ceo";
}

function agentMembersOnly(members: OfficeMember[]): OfficeMember[] {
  return members.filter(
    (member) =>
      member.slug && !NON_AGENT_SLUGS.has(member.slug.trim().toLowerCase()),
  );
}

function currentMentionTrigger(
  value: string,
  caret: number,
): { query: string; start: number } | null {
  const before = value.slice(0, caret);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;
  const prevChar = atIdx === 0 ? "" : before[atIdx - 1];
  if (prevChar !== "" && !/\s/.test(prevChar)) return null;
  const query = before.slice(atIdx + 1);
  if (/\s/.test(query)) return null;
  return { query, start: atIdx };
}

function mentionOptions(
  query: string,
  members: OfficeMember[],
): Array<{ insert: string; label: string; desc?: string }> {
  const q = query.toLowerCase();
  const base =
    "all".startsWith(q) && members.length > 0
      ? [{ insert: "@all", label: "@all", desc: "All agents" }]
      : [];
  const agents = members
    .filter((member) => {
      if (!q) return true;
      return [member.slug, member.name, member.role]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q));
    })
    .map((member) => ({
      insert: `@${member.slug}`,
      label: `@${member.slug}`,
      desc: member.name || member.role,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...base, ...agents].slice(0, 8);
}

function applyMentionOption(
  value: string,
  caret: number,
  option: { insert: string },
): { text: string; caret: number } {
  const trigger = currentMentionTrigger(value, caret);
  if (!trigger) return { text: value, caret };
  const before = value.slice(0, trigger.start);
  const after = value.slice(caret);
  const insert = `${option.insert} `;
  return {
    text: before + insert + after,
    caret: before.length + insert.length,
  };
}

function visibleTargets(
  text: string,
  agentSlugs: string[],
  leadSlug: string,
): string[] {
  if (/(^|\s)@all\b/i.test(text)) return ["all"];
  const explicit = extractTaggedMentions(text, agentSlugs, {
    allSlugs: agentSlugs,
  });
  return explicit.length > 0 ? explicit : [leadSlug];
}

function buildOutboundMessage(
  text: string,
  selectedProject: Project | null,
  agentSlugs: string[],
  leadSlug: string,
): { content: string; tagged: string[] } {
  const trimmed = text.trim();
  const projectPrefix = selectedProject
    ? `${projectHashtag(selectedProject)} `
    : "";
  const explicitTagged = extractTaggedMentions(trimmed, agentSlugs, {
    allSlugs: agentSlugs,
  });
  if (explicitTagged.length > 0) {
    return {
      content: `${projectPrefix}${trimmed}`,
      tagged: explicitTagged,
    };
  }
  return {
    content: `${projectPrefix}@${leadSlug} ${trimmed}`.trim(),
    tagged: [leadSlug],
  };
}

function renderHomeText(content: string, agentSlugs: string[]): ReactNode[] {
  const mentionNodes = renderMentions(content, agentSlugs);
  return mentionNodes.flatMap((node, nodeIndex) => {
    if (typeof node !== "string") return [node];
    const out: ReactNode[] = [];
    const re = /#[a-zA-Z0-9][a-zA-Z0-9-_]{1,80}\b/g;
    let last = 0;
    for (const match of node.matchAll(re)) {
      if (match.index === undefined) continue;
      if (match.index > last) out.push(node.slice(last, match.index));
      out.push(
        <span key={`hash-${nodeIndex}-${match.index}`} className="home-hash">
          {match[0]}
        </span>,
      );
      last = match.index + match[0].length;
    }
    if (last < node.length) out.push(node.slice(last));
    return out;
  });
}

function HomeProjectGrid({
  projects,
  isLoading,
  selectedProjectId,
  onSelectProject,
}: {
  projects: Project[];
  isLoading: boolean;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (!isLoading && projects.length === 0) setCreating(true);
  }, [isLoading, projects.length]);

  const createMutation = useMutation({
    mutationFn: (projectName: string) => createProject({ name: projectName }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onSelectProject(data.project.id);
      setName("");
      setCreating(false);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(
        err instanceof Error ? err.message : "프로젝트를 만들지 못했습니다.",
      );
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || createMutation.isPending) return;
    createMutation.mutate(trimmed);
  };

  return (
    <section className="home-projects" aria-label="프로젝트">
      <div className="home-projects-head">
        <h2>프로젝트</h2>
        {projects.length > 0 ? (
          <button
            type="button"
            className="home-icon-button"
            aria-label="프로젝트 만들기"
            title="프로젝트 만들기"
            onClick={() => setCreating((value) => !value)}
          >
            <Plus />
          </button>
        ) : null}
      </div>

      <div className="home-project-grid">
        {projects.map((project) => {
          const selected = selectedProjectId === project.id;
          return (
            <button
              type="button"
              key={project.id}
              className={`home-project-card${selected ? " is-selected" : ""}`}
              onClick={() => onSelectProject(selected ? null : project.id)}
            >
              <span className="home-project-name">
                {project.name || project.id}
              </span>
              <span className="home-project-tag">
                {projectHashtag(project)}
              </span>
            </button>
          );
        })}

        {creating ? (
          <form className="home-project-create" onSubmit={handleSubmit}>
            {projects.length === 0 ? (
              <span className="home-project-create-title">프로젝트 만들기</span>
            ) : null}
            <label className="sr-only" htmlFor="home-project-name">
              프로젝트 이름
            </label>
            <input
              ref={inputRef}
              id="home-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="프로젝트 이름"
            />
            <div className="home-project-create-actions">
              <button
                type="submit"
                disabled={!name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "만드는 중" : "만들기"}
              </button>
              {projects.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setError(null);
                    setName("");
                  }}
                >
                  취소
                </button>
              ) : null}
            </div>
            {error ? <p className="home-inline-error">{error}</p> : null}
          </form>
        ) : null}

        {!(creating || isLoading) && projects.length === 0 ? (
          <button
            type="button"
            className="home-project-card home-project-card-empty"
            onClick={() => setCreating(true)}
          >
            프로젝트 만들기
          </button>
        ) : null}
      </div>
    </section>
  );
}

function HomeMessageList({
  messages,
  isLoading,
  agentSlugs,
}: {
  messages: Message[];
  isLoading: boolean;
  agentSlugs: string[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (isLoading && messages.length === 0) {
    return (
      <div className="home-chat-stream" role="status" aria-live="polite">
        <span className="home-muted">대화를 불러오는 중</span>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="home-chat-stream home-chat-empty" ref={scrollRef}>
        <h1>오늘은 무슨 이야기를 할까요?</h1>
      </div>
    );
  }

  return (
    <div className="home-chat-stream" ref={scrollRef}>
      <div className="home-chat-list">
        {messages.map((message) => (
          <HomeMessage
            key={message.id}
            message={message}
            agentSlugs={agentSlugs}
          />
        ))}
      </div>
    </div>
  );
}

function HomeMessage({
  message,
  agentSlugs,
}: {
  message: Message;
  agentSlugs: string[];
}) {
  const isHuman = message.from === "you" || message.from === "human";
  return (
    <article className={`home-message${isHuman ? " is-human" : ""}`}>
      <div className="home-message-avatar">
        {isHuman ? "You" : <PixelAvatar slug={message.from} size={24} />}
      </div>
      <div className="home-message-body">
        <div className="home-message-meta">
          <span>{isHuman ? "You" : message.from}</span>
          <time dateTime={message.timestamp}>
            {formatTime(message.timestamp)}
          </time>
        </div>
        {isHuman ? (
          <p className="home-message-text">
            {renderHomeText(message.content || "", agentSlugs)}
          </p>
        ) : (
          <div
            className="home-message-text"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: formatMarkdown escapes source text before producing trusted markup for agent messages.
            dangerouslySetInnerHTML={{
              __html: formatMarkdown(message.content || ""),
            }}
          />
        )}
      </div>
    </article>
  );
}

function HomeComposer({
  selectedProject,
  agentMembers,
  leadSlug,
  threadId,
}: {
  selectedProject: Project | null;
  agentMembers: OfficeMember[];
  leadSlug: string;
  threadId: string;
}) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const agentSlugs = useMemo(
    () => agentMembers.map((member) => member.slug),
    [agentMembers],
  );
  const displayTargets = useMemo(
    () =>
      /(^|\s)@all\b/i.test(text)
        ? ["all"]
        : extractTaggedMentions(text, agentSlugs, {
            allSlugs: agentSlugs,
          }),
    [text, agentSlugs],
  );
  const trigger = currentMentionTrigger(text, caret);
  const autocompleteItems = useMemo(
    () => (trigger ? mentionOptions(trigger.query, agentMembers) : []),
    [trigger, agentMembers],
  );

  const sendMutation = useMutation({
    mutationFn: (messageText: string) => {
      const outbound = buildOutboundMessage(
        messageText,
        selectedProject,
        agentSlugs,
        leadSlug,
      );
      return postMessage(
        outbound.content,
        HOME_CHANNEL,
        threadId,
        outbound.tagged,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["home-messages", HOME_CHANNEL, threadId],
      });
      setText("");
      setSendError(null);
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      });
    },
    onError: (err: unknown) => {
      setSendError(
        err instanceof Error ? err.message : "메시지를 보내지 못했습니다.",
      );
    },
  });

  const pickAutocomplete = useCallback(
    (item: { insert: string }) => {
      const next = applyMentionOption(text, caret, item);
      setText(next.text);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
        setCaret(next.caret);
      });
    },
    [text, caret],
  );

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  }, [text, sendMutation]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (autocompleteItems.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIdx((idx) => (idx + 1) % autocompleteItems.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIdx(
          (idx) =>
            (idx - 1 + autocompleteItems.length) % autocompleteItems.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickAutocomplete(
          autocompleteItems[selectedIdx] ?? autocompleteItems[0],
        );
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedIdx(0);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (value: string, selectionStart: number) => {
    setText(value);
    setCaret(selectionStart);
    setSelectedIdx(0);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  };

  return (
    <div className="home-composer-wrap">
      <div className="home-context-chips" aria-label="대상">
        {selectedProject ? (
          <span className="home-context-chip is-project">
            <Hashtag />
            {selectedProject.id}
          </span>
        ) : null}
        {displayTargets.slice(0, 4).map((target) => (
          <span className="home-context-chip" key={target}>
            @{target}
          </span>
        ))}
        {displayTargets.length > 4 ? (
          <span className="home-context-chip">
            +{displayTargets.length - 4}
          </span>
        ) : null}
      </div>
      <div className="home-composer">
        {autocompleteItems.length > 0 ? (
          <div className="home-autocomplete" role="listbox">
            {autocompleteItems.map((item, idx) => (
              <button
                type="button"
                key={item.insert}
                className={idx === selectedIdx ? "is-selected" : ""}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickAutocomplete(item);
                }}
              >
                <span>{item.label}</span>
                {item.desc ? <small>{item.desc}</small> : null}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          value={text}
          placeholder="무엇이든 물어보세요"
          rows={1}
          onChange={(event) =>
            handleInput(event.target.value, event.target.selectionStart ?? 0)
          }
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onClick={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
        />
        <button
          type="button"
          className="home-send"
          aria-label="보내기"
          title="보내기"
          disabled={!text.trim() || sendMutation.isPending}
          onClick={handleSubmit}
        >
          <SendDiagonal />
        </button>
      </div>
      {sendError ? <p className="home-inline-error">{sendError}</p> : null}
    </div>
  );
}

export function HomeApp() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [homeThreadId] = useState(createHomeChatThreadId);
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 30_000,
  });
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ["home-messages", HOME_CHANNEL, homeThreadId],
    queryFn: () => getThreadMessages(HOME_CHANNEL, homeThreadId),
    refetchInterval:
      typeof (globalThis as { EventSource?: typeof EventSource })
        .EventSource !== "undefined"
        ? 10_000
        : 2_000,
    select: (data) => data.messages ?? [],
  });
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
    staleTime: 60_000,
  });
  const { data: members = [] } = useOfficeMembers();
  const agentMembers = useMemo(() => agentMembersOnly(members), [members]);
  const agentSlugs = useMemo(
    () => agentMembers.map((member) => member.slug),
    [agentMembers],
  );
  const projects = useMemo(
    () => sortProjectsByRecent(projectsData?.projects ?? []),
    [projectsData?.projects],
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const leadSlug = useMemo(
    () => resolveLeadSlug(config?.team_lead_slug, agentMembers),
    [config?.team_lead_slug, agentMembers],
  );
  const hasMessages = (messagesData ?? []).length > 0;

  useEffect(() => {
    if (
      selectedProjectId &&
      !projects.some((project) => project.id === selectedProjectId)
    ) {
      setSelectedProjectId(null);
    }
  }, [projects, selectedProjectId]);

  return (
    <div className={`home-app${hasMessages ? "" : " is-empty"}`}>
      <HomeProjectGrid
        projects={projects}
        isLoading={projectsLoading}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
      />
      {projectsLoading && projects.length === 0 ? (
        <span className="home-project-loading">프로젝트를 불러오는 중</span>
      ) : null}
      <HomeMessageList
        messages={messagesData ?? []}
        isLoading={messagesLoading}
        agentSlugs={agentSlugs}
      />
      <HomeComposer
        selectedProject={selectedProject}
        agentMembers={agentMembers}
        leadSlug={leadSlug}
        threadId={homeThreadId}
      />
    </div>
  );
}

export const __test__ = {
  buildOutboundMessage,
  createHomeChatThreadId,
  sortProjectsByRecent,
  visibleTargets,
};
