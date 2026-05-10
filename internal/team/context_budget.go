package team

import (
	"encoding/json"
	"strings"
	"unicode"
)

type contextBudgetSectionUsage struct {
	ID       string `json:"id"`
	Chars    int    `json:"chars"`
	Required bool   `json:"required,omitempty"`
}

type usageOptimizationStats struct {
	PromptBuilds        int                         `json:"prompt_builds,omitempty"`
	PromptChars         int                         `json:"prompt_chars,omitempty"`
	MaxPromptChars      int                         `json:"max_prompt_chars,omitempty"`
	PacketBuilds        int                         `json:"packet_builds,omitempty"`
	PacketChars         int                         `json:"packet_chars,omitempty"`
	MaxPacketChars      int                         `json:"max_packet_chars,omitempty"`
	MemoryItemsIncluded int                         `json:"memory_items_included,omitempty"`
	MemoryItemsOmitted  int                         `json:"memory_items_omitted,omitempty"`
	BroadPollReads      int                         `json:"broad_poll_reads,omitempty"`
	BroadTaskReads      int                         `json:"broad_task_reads,omitempty"`
	WakeDecisions       int                         `json:"wake_decisions,omitempty"`
	WakeTargets         int                         `json:"wake_targets,omitempty"`
	WakeReasons         map[string]int              `json:"wake_reasons,omitempty"`
	WakeSuppressions    map[string]int              `json:"wake_suppressions,omitempty"`
	ToolCalls           int                         `json:"tool_calls,omitempty"`
	LastPromptSections  []contextBudgetSectionUsage `json:"last_prompt_sections,omitempty"`
	LastPacketSections  []contextBudgetSectionUsage `json:"last_packet_sections,omitempty"`
}

type contextOptimizationEvent struct {
	PromptChars    int
	PromptSections []contextBudgetSectionUsage
	PacketChars    int
	PacketSections []contextBudgetSectionUsage
	MemoryIncluded int
	MemoryOmitted  int
	BroadPollRead  bool
	BroadTaskRead  bool
	WakeDecision   bool
	WakeTargets    int
	WakeReason     string
	WakeSuppressed string
	ToolCall       bool
}

func (b *Broker) recordContextOptimization(event contextOptimizationEvent) {
	if b == nil || event.isZero() {
		return
	}
	b.mu.Lock()
	b.recordContextOptimizationLocked(event)
	b.mu.Unlock()
}

func (b *Broker) recordContextOptimizationLocked(event contextOptimizationEvent) {
	if b == nil || event.isZero() {
		return
	}
	opt := b.usage.Optimization
	if event.PromptChars > 0 {
		opt.PromptBuilds++
		opt.PromptChars += event.PromptChars
		if event.PromptChars > opt.MaxPromptChars {
			opt.MaxPromptChars = event.PromptChars
		}
		opt.LastPromptSections = copyContextBudgetSections(event.PromptSections)
	}
	if event.PacketChars > 0 {
		opt.PacketBuilds++
		opt.PacketChars += event.PacketChars
		if event.PacketChars > opt.MaxPacketChars {
			opt.MaxPacketChars = event.PacketChars
		}
		opt.LastPacketSections = copyContextBudgetSections(event.PacketSections)
	}
	opt.MemoryItemsIncluded += event.MemoryIncluded
	opt.MemoryItemsOmitted += event.MemoryOmitted
	if event.BroadPollRead {
		opt.BroadPollReads++
	}
	if event.BroadTaskRead {
		opt.BroadTaskReads++
	}
	if event.WakeDecision {
		opt.WakeDecisions++
		opt.WakeTargets += event.WakeTargets
		if reason := strings.TrimSpace(event.WakeReason); reason != "" {
			if opt.WakeReasons == nil {
				opt.WakeReasons = make(map[string]int)
			}
			opt.WakeReasons[reason]++
		}
		if suppressed := strings.TrimSpace(event.WakeSuppressed); suppressed != "" {
			if opt.WakeSuppressions == nil {
				opt.WakeSuppressions = make(map[string]int)
			}
			opt.WakeSuppressions[suppressed]++
		}
	}
	if event.ToolCall {
		opt.ToolCalls++
	}
	b.usage.Optimization = opt
}

func (event contextOptimizationEvent) isZero() bool {
	return event.PromptChars == 0 &&
		event.PacketChars == 0 &&
		event.MemoryIncluded == 0 &&
		event.MemoryOmitted == 0 &&
		!event.BroadPollRead &&
		!event.BroadTaskRead &&
		!event.WakeDecision &&
		event.WakeTargets == 0 &&
		event.WakeReason == "" &&
		event.WakeSuppressed == "" &&
		!event.ToolCall
}

func copyContextBudgetSections(in []contextBudgetSectionUsage) []contextBudgetSectionUsage {
	if len(in) == 0 {
		return nil
	}
	out := make([]contextBudgetSectionUsage, len(in))
	copy(out, in)
	return out
}

func promptBudgetSections(prompt string) []contextBudgetSectionUsage {
	return contextBudgetSections(prompt, "preamble")
}

func packetBudgetSections(packetText string) []contextBudgetSectionUsage {
	return contextBudgetSections(packetText, "packet")
}

func contextBudgetSections(text, defaultID string) []contextBudgetSectionUsage {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	defaultID = contextBudgetID(defaultID)
	if defaultID == "" {
		defaultID = "context"
	}
	lines := strings.Split(text, "\n")
	sections := make([]contextBudgetSectionUsage, 0, 8)
	currentID := defaultID
	currentChars := 0
	flush := func() {
		if currentChars == 0 {
			return
		}
		sections = append(sections, contextBudgetSectionUsage{
			ID:       currentID,
			Chars:    currentChars,
			Required: contextBudgetSectionIsRequired(currentID),
		})
	}
	for _, line := range lines {
		if id, ok := contextBudgetHeadingID(line); ok {
			flush()
			currentID = id
			currentChars = len([]rune(line)) + 1
			continue
		}
		currentChars += len([]rune(line)) + 1
	}
	flush()
	return sections
}

func contextBudgetHeadingID(line string) (string, bool) {
	trimmed := strings.TrimSpace(line)
	if strings.HasPrefix(trimmed, "== ") && strings.HasSuffix(trimmed, " ==") {
		return contextBudgetID(strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(trimmed, "== "), " =="))), true
	}
	if strings.HasSuffix(trimmed, ":") && isContextBudgetAllCapsHeading(strings.TrimSuffix(trimmed, ":")) {
		return contextBudgetID(strings.TrimSuffix(trimmed, ":")), true
	}
	return "", false
}

func isContextBudgetAllCapsHeading(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" || len([]rune(text)) > 80 {
		return false
	}
	hasLetter := false
	for _, r := range text {
		if unicode.IsLetter(r) {
			hasLetter = true
			if unicode.IsLower(r) {
				return false
			}
			continue
		}
		if unicode.IsDigit(r) || unicode.IsSpace(r) || r == '-' || r == '&' || r == '/' {
			continue
		}
		return false
	}
	return hasLetter
}

func contextBudgetID(raw string) string {
	raw = strings.ToLower(strings.TrimSpace(raw))
	var sb strings.Builder
	lastDash := false
	for _, r := range raw {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			sb.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			sb.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(sb.String(), "-")
}

func contextBudgetSectionIsRequired(id string) bool {
	switch strings.TrimSpace(id) {
	case "preamble", "your-team", "team-channel", "tool-hygiene", "active-office-policies",
		"delegation-mode", "your-role-as-leader", "your-role-as-specialist",
		"skill-agent-awareness", "rules", "direct-session", "project-memory-excerpt-read-before-work",
		"agent-memory-packet-task-scoped-contract":
		return true
	default:
		return false
	}
}

func agentPacketBudgetChars(packet AgentMemoryPacket, memory projectMemoryPacket) int {
	raw, err := json.Marshal(packet)
	if err != nil {
		return len([]rune(memory.Excerpt))
	}
	return len([]rune(string(raw))) + len([]rune(memory.Excerpt))
}

func projectMemoryIncludedCount(memory projectMemoryPacket, recentWork []AgentMemoryWorkReceipt) int {
	return len(memory.Signals.Decisions) + len(memory.Signals.Risks) + len(memory.Signals.OpenQuestions) + len(recentWork)
}

func projectMemoryOmittedCount(memory projectMemoryPacket) int {
	return memory.Signals.OmittedDecisions + memory.Signals.OmittedRisks + memory.Signals.OmittedOpenQuestions + memory.OmittedRecentWork
}
