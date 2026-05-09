package team

import (
	"net/http"
	"strings"
)

// handleTaskContext returns the task-scoped memory packet agents can request
// when a pushed notification was lost, compacted, or needs to be reloaded.
//
//	GET /tasks/context?id=task-1
//	resp: { "packet": AgentMemoryPacket, "text": "..." }
func (b *Broker) handleTaskContext(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id is required"})
		return
	}

	viewerSlug := strings.TrimSpace(r.URL.Query().Get("viewer_slug"))
	task, ok := b.taskSnapshotByID(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "task not found"})
		return
	}
	channel := normalizeChannelSlug(task.Channel)
	if channel == "" {
		channel = "general"
	}
	b.mu.Lock()
	canAccess := b.canAccessChannelLocked(viewerSlug, channel)
	b.mu.Unlock()
	if !canAccess {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "channel access denied"})
		return
	}

	memory := b.projectMemoryForTaskPacket(task)
	packet := b.agentMemoryPacketForTask(task, memory)
	lines := renderAgentMemoryPacket(packet)
	lines = append(lines, renderProjectMemoryPacket(memory)...)
	writeJSON(w, http.StatusOK, map[string]any{
		"packet": packet,
		"text":   strings.Join(lines, "\n"),
	})
}

func (b *Broker) taskSnapshotByID(id string) (teamTask, bool) {
	id = strings.TrimSpace(id)
	if id == "" || b == nil {
		return teamTask{}, false
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, task := range b.tasks {
		if task.ID == id {
			return task, true
		}
	}
	return teamTask{}, false
}
