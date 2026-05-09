import { useEffect, useMemo, useRef } from "react";

import { useAgentStream } from "../../hooks/useAgentStream";
import { useDefaultHarness } from "../../hooks/useConfig";
import { useMentionTargets } from "../../hooks/useMentionTargets";
import { useMessages } from "../../hooks/useMessages";
import { isDMChannel, useAppStore } from "../../stores/app";
import { Composer } from "./Composer";
import { InterviewBar } from "./InterviewBar";
import { MessageBubbleView } from "./MessageBubble";
import { StreamLineView } from "./StreamLineView";
import { TypingIndicator } from "./TypingIndicator";

export function DMView() {
  const currentChannel = useAppStore((s) => s.currentChannel);
  const channelMeta = useAppStore((s) => s.channelMeta);
  const dm = isDMChannel(currentChannel, channelMeta);
  const dmAgentSlug = dm?.agentSlug ?? null;
  const { data: messages = [] } = useMessages(currentChannel);
  const { agentMembers: members, mentionSlugs: knownSlugs } =
    useMentionTargets();
  const defaultHarness = useDefaultHarness();
  const membersBySlug = useMemo(
    () => new Map(members.map((m) => [m.slug, m])),
    [members],
  );
  const dmAgent = dmAgentSlug ? membersBySlug.get(dmAgentSlug) : null;
  const { lines, connected } = useAgentStream(dmAgentSlug);
  const messagesRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  // Auto-scroll messages
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, []);

  // Auto-scroll stream
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, []);

  return (
    <>
      {/* Split layout: messages left, live stream right */}
      <div className="dm-split">
        {/* Left: Messages + Composer */}
        <div className="dm-message-pane">
          <div className="dm-header">
            <div className="dm-header-title">
              <span>{dmAgent?.name || dmAgentSlug || "Agent"}</span>
              <span className="dm-header-dot" />
              <span>1:1</span>
            </div>
            <div className="dm-header-subtitle">
              @{dmAgentSlug || "agent"} direct thread
            </div>
          </div>
          <div ref={messagesRef} className="messages">
            {messages.map((msg) => (
              <MessageBubbleView
                key={msg.id}
                currentChannel={currentChannel}
                defaultHarness={defaultHarness}
                knownSlugs={knownSlugs}
                membersBySlug={membersBySlug}
                message={msg}
              />
            ))}
          </div>
          <TypingIndicator />
          <InterviewBar />
          <Composer />
        </div>

        {/* Right: Live stream */}
        <div className="dm-live-stream">
          <div className="dm-live-stream-header">
            <span
              className={`status-dot ${connected ? "active pulse" : "lurking"}`}
            />
            <span>Live output</span>
          </div>
          <div ref={streamRef} className="dm-live-stream-body">
            {lines.length === 0 ? (
              <div className="dm-live-stream-empty">
                {connected ? "Waiting for output..." : "Stream idle"}
              </div>
            ) : (
              lines.map((line) => (
                <StreamLineView key={line.id} line={line} compact={true} />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
