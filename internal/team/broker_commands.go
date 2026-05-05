package team

// broker_commands.go exposes the slash-command registry (the TUI source of
// truth at internal/commands) over HTTP so the web composer can render its
// autocomplete from the same list as the TUI. Before this endpoint the web
// had its own hardcoded SLASH_COMMANDS constant which drifted the moment a
// TUI command was added or renamed.
//
// Route: GET /commands
//
// Payload shape:
//
//	[
//	  { "name": "ask", "description": "...", "webSupported": true },
//	  { "name": "object", "description": "...", "webSupported": false },
//	  ...
//	]
//
// Sorted alphabetically (matches commands.Registry.List). The web filters
// for webSupported=true; the TUI ignores this endpoint entirely.

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/LAF-labs/LAF-Agents-Office/internal/commands"
)

// commandDescriptor is the JSON shape returned by GET /commands. JSON tags
// are camelCase to match the web's existing API conventions.
type commandDescriptor struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	WebSupported bool   `json:"webSupported"`
}

type commandRunRequest struct {
	Input   string `json:"input"`
	Channel string `json:"channel"`
}

type commandRunResponse struct {
	Output  string         `json:"output"`
	Message channelMessage `json:"message"`
}

// registryLister is the narrow interface GET /commands depends on. Tests
// substitute a fake so the handler can be exercised without touching the
// global registry.
type registryLister interface {
	List() []commands.SlashCommand
}

// newCommandsRegistry builds the canonical registry. Overridable so tests
// can inject a smaller, deterministic command set.
var newCommandsRegistry = func() registryLister {
	r := commands.NewRegistry()
	commands.RegisterAllCommands(r)
	return r
}

// handleCommands answers GET /commands. Non-GET requests get 405 — we do
// not accept writes to the registry over HTTP; the TUI registry is the
// source of truth and mutating it at runtime would make the web/TUI parity
// guarantee meaningless.
func (b *Broker) handleCommands(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	registry := newCommandsRegistry()
	list := registry.List()

	out := make([]commandDescriptor, 0, len(list))
	for _, cmd := range list {
		out = append(out, commandDescriptor{
			Name:         cmd.Name,
			Description:  cmd.Description,
			WebSupported: cmd.WebSupported,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	// Small, stable payload — cache for a minute so rapid reloads don't
	// thrash the broker. The only way the list changes is a rebuild.
	w.Header().Set("Cache-Control", "private, max-age=60")
	_ = json.NewEncoder(w).Encode(out)
}

var webRunnableCommands = map[string]struct{}{
	"hire-agent":        {},
	"assign-task":       {},
	"daily-standup":     {},
	"review-office":     {},
	"promote-to-wiki":   {},
	"fix-bug":           {},
	"deploy-simulation": {},
}

// handleCommandRun executes a small allowlist of web-safe workflow commands
// through the canonical slash-command dispatcher, then posts the result back
// into the active channel as an automation message. It intentionally does not
// expose arbitrary slash dispatch over HTTP: commands such as /init, /quit, and
// future mutating commands belong in the TUI/CLI unless explicitly reviewed for
// web execution.
func (b *Broker) handleCommandRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req commandRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	input := strings.TrimSpace(req.Input)
	if input == "" {
		http.Error(w, "input required", http.StatusBadRequest)
		return
	}
	if !strings.HasPrefix(input, "/") {
		input = "/" + input
	}
	name, _, ok := commands.ParseSlashInput(input)
	if !ok {
		http.Error(w, "slash command required", http.StatusBadRequest)
		return
	}
	if _, allowed := webRunnableCommands[name]; !allowed {
		http.Error(w, "command is not web-runnable", http.StatusForbidden)
		return
	}

	result := commands.Dispatch(input, "", "text", 0)
	if result.Error != "" {
		http.Error(w, result.Error, http.StatusInternalServerError)
		return
	}
	output := strings.TrimSpace(result.Output)
	if output == "" {
		output = "/" + name + " completed."
	}

	channel := normalizeChannelSlug(req.Channel)
	if channel == "" {
		channel = "general"
	}
	msg, _, err := b.PostAutomationMessage(
		"laf-office",
		channel,
		"/"+name,
		output,
		"",
		"slash-command",
		"Slash Command",
		nil,
		"",
	)
	if err != nil {
		http.Error(w, "failed to post command output", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(commandRunResponse{Output: output, Message: msg})
}
