package team

import (
	"fmt"
	"strings"
)

type agentReplyTransport string

const (
	agentReplyTransportBroadcast agentReplyTransport = "broadcast"
	agentReplyTransportFinal     agentReplyTransport = "final"
)

func (l *Launcher) replyTransportForTarget(target notificationTarget) agentReplyTransport {
	if l.shouldUseHeadlessDispatchForTarget(target) {
		return agentReplyTransportFinal
	}
	return agentReplyTransportBroadcast
}

func publicReplyInstruction(transport agentReplyTransport, slug string, channel string, replyToID string) string {
	switch transport {
	case agentReplyTransportFinal:
		return headlessFinalReplyInstruction(slug, channel, replyToID)
	default:
		return broadcastReplyInstruction(slug, channel, replyToID)
	}
}

func taskChatReplyInstruction(transport agentReplyTransport, slug string, channel string, replyToID string) string {
	switch transport {
	case agentReplyTransportFinal:
		return "Task chat reply: for human-visible progress and blockers, write the update as your final answer text. " + headlessFinalReplyInstruction(slug, channel, replyToID)
	default:
		return fmt.Sprintf("Task chat reply: use team_broadcast with my_slug %q, channel %q, reply_to_id %q for human-visible progress and blockers.", slug, channel, replyToID)
	}
}

func broadcastReplyInstruction(slug string, channel string, replyToID string) string {
	if strings.TrimSpace(replyToID) == "" {
		return fmt.Sprintf("Post exactly one human-visible answer with team_broadcast using my_slug %q, channel %q, new_topic true. Once you have posted the needed update, STOP and wait for the next pushed notification.", slug, channel)
	}
	return fmt.Sprintf("Reply using team_broadcast with my_slug %q, channel %q, reply_to_id %q. Once you have posted the needed update, STOP and wait for the next pushed notification.", slug, channel, replyToID)
}

func broadcastReplyInstructionForShownTargets(slug string) string {
	return fmt.Sprintf("Reply using team_broadcast with my_slug %q and the channel and reply_to_id shown above. Once you have posted the needed update, STOP and wait for the next pushed notification.", slug)
}

func headlessFinalReplyInstruction(slug string, channel string, replyToID string) string {
	target := fmt.Sprintf("to channel %q as a new topic", channel)
	if strings.TrimSpace(replyToID) != "" {
		target = fmt.Sprintf("to channel %q with reply_to_id %q", channel, replyToID)
	}
	return fmt.Sprintf(
		"Headless reply transport: for this normal human-visible chat reply, write the reply as your final answer text. LAF-Office will post that final answer as @%s %s after the turn. Use office tools only for durable task/memory/delegation changes or deliberate extra posts; the normal chat reply itself does not need an office tool. After the final answer, STOP and wait for the next pushed notification.",
		slug, target,
	)
}

func headlessHiddenWorkResultInstruction(slug string, channel string, requestID string) string {
	return fmt.Sprintf(
		"Hidden result transport: prefer team_work_result with my_slug %q, channel %q, request_id %q. If that tool surface is unavailable, write the hidden work result as your final answer text; LAF-Office will store that final answer as an internal work_result for the requester. Do not post a human-visible answer for this internal request. After the hidden result, STOP and wait for the next pushed notification.",
		slug, channel, requestID,
	)
}

func headlessCollaborationRequestID(notification string) string {
	const marker = `request_id "`
	idx := strings.LastIndex(notification, marker)
	if idx == -1 {
		return ""
	}
	start := idx + len(marker)
	end := strings.Index(notification[start:], `"`)
	if end == -1 {
		return ""
	}
	return strings.TrimSpace(notification[start : start+end])
}
