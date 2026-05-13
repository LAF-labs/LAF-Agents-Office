package team

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	workspaceSearchDefaultLimit = 30
	workspaceSearchMaxLimit     = 60
	workspaceSearchMaxLineBytes = 16 * 1024
	workspaceSearchWikiTimeout  = 2 * time.Second
)

type workspaceSearchHit struct {
	ID        string            `json:"id"`
	Scope     string            `json:"scope"`
	Source    string            `json:"source"`
	Title     string            `json:"title"`
	Path      string            `json:"path,omitempty"`
	Line      int               `json:"line,omitempty"`
	Snippet   string            `json:"snippet"`
	UpdatedAt string            `json:"updated_at,omitempty"`
	ProjectID string            `json:"project_id,omitempty"`
	TaskID    string            `json:"task_id,omitempty"`
	AgentSlug string            `json:"agent_slug,omitempty"`
	Channel   string            `json:"channel,omitempty"`
	Meta      map[string]string `json:"meta,omitempty"`
	Score     int               `json:"score,omitempty"`
}

type workspaceSearchRequest struct {
	Query  string
	Limit  int
	Scopes map[string]bool
}

type taskThreadRef struct {
	TaskID    string
	ProjectID string
	Channel   string
	Title     string
}

var workspaceSearchSecretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\b(api[_-]?key|token|secret|password|authorization|bearer)\b\s*[:=]\s*["']?[^"',}\s]+`),
	regexp.MustCompile(`\bsk-[A-Za-z0-9_-]{12,}\b`),
}

// handleWorkspaceSearch is intentionally narrow. It searches only the LAF
// surfaces people actually need during work: canonical wiki articles, projects
// and tasks, and messages inside task threads. It does not walk worktrees,
// dependency folders, notebooks, runner logs, or arbitrary local files.
func (b *Broker) handleWorkspaceSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	req, err := parseWorkspaceSearchRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	hits, omitted := b.workspaceSearch(r.Context().Done(), req)
	if len(hits) > req.Limit {
		hits = hits[:req.Limit]
	}
	counts := map[string]int{}
	for _, hit := range hits {
		counts[hit.Scope]++
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"query":   req.Query,
		"hits":    hits,
		"counts":  counts,
		"omitted": omitted,
	})
}

func parseWorkspaceSearchRequest(r *http.Request) (workspaceSearchRequest, error) {
	q := strings.TrimSpace(firstNonEmptyString(r.URL.Query().Get("q"), r.URL.Query().Get("query")))
	if len([]rune(q)) < 2 {
		return workspaceSearchRequest{}, fmt.Errorf("q must be at least 2 characters")
	}
	limit := workspaceSearchDefaultLimit
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > workspaceSearchMaxLimit {
		limit = workspaceSearchMaxLimit
	}
	scopes := map[string]bool{"wiki": true, "project": true, "chat": true}
	if raw := strings.TrimSpace(r.URL.Query().Get("scopes")); raw != "" {
		scopes = map[string]bool{}
		for _, part := range strings.Split(raw, ",") {
			switch scope := strings.ToLower(strings.TrimSpace(part)); scope {
			case "wiki", "project", "chat":
				scopes[scope] = true
			case "canonical":
				scopes["wiki"] = true
			case "work":
				scopes["project"] = true
				scopes["chat"] = true
			case "":
			default:
				return workspaceSearchRequest{}, fmt.Errorf("unsupported scope %q", scope)
			}
		}
	}
	return workspaceSearchRequest{Query: q, Limit: limit, Scopes: scopes}, nil
}

func (b *Broker) workspaceSearch(done <-chan struct{}, req workspaceSearchRequest) ([]workspaceSearchHit, []string) {
	b.mu.Lock()
	projects := append([]teamProject(nil), b.projects...)
	tasks := append([]teamTask(nil), b.tasks...)
	messages := append([]channelMessage(nil), b.messages...)
	worker := b.wikiWorker
	b.mu.Unlock()

	var hits []workspaceSearchHit
	var omitted []string
	if req.Scopes["project"] {
		hits = append(hits, searchWorkspaceProjects(projects, tasks, req.Query, perWorkspaceScopeLimit(req.Limit))...)
	}
	if req.Scopes["chat"] {
		hits = append(hits, searchWorkspaceTaskChats(messages, tasks, req.Query, perWorkspaceScopeLimit(req.Limit))...)
	}
	if req.Scopes["wiki"] && worker != nil {
		wikiHits, wikiOmitted := searchWorkspaceWiki(done, worker.Repo().Root(), req.Query, perWorkspaceScopeLimit(req.Limit))
		hits = append(hits, wikiHits...)
		omitted = append(omitted, wikiOmitted...)
	}

	rankWorkspaceHits(hits, req.Query)
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].Scope != hits[j].Scope {
			return workspaceScopeRank(hits[i].Scope) > workspaceScopeRank(hits[j].Scope)
		}
		if hits[i].Score != hits[j].Score {
			return hits[i].Score > hits[j].Score
		}
		if hits[i].UpdatedAt != hits[j].UpdatedAt {
			return hits[i].UpdatedAt > hits[j].UpdatedAt
		}
		return hits[i].ID < hits[j].ID
	})
	return dedupeWorkspaceHits(hits), omitted
}

func perWorkspaceScopeLimit(limit int) int {
	n := limit / 2
	if n < 10 {
		return 10
	}
	return n
}

func searchWorkspaceProjects(projects []teamProject, tasks []teamTask, query string, limit int) []workspaceSearchHit {
	needle := normalizeSearchText(query)
	var hits []workspaceSearchHit
	for _, project := range projects {
		if len(hits) >= limit {
			break
		}
		text := strings.Join([]string{
			project.ID,
			project.Name,
			project.Description,
			project.AdditionalInfo,
			project.LeadAgent,
			project.GitHubRepoURL,
			project.RecipeFileName,
			project.Status,
		}, "\n")
		if !strings.Contains(normalizeSearchText(text), needle) {
			continue
		}
		hits = append(hits, workspaceSearchHit{
			ID:        "project:" + project.ID,
			Scope:     "project",
			Source:    "project",
			Title:     firstNonEmptyString(project.Name, project.ID),
			Path:      project.ID,
			Snippet:   snippetForQuery(text, query),
			UpdatedAt: firstNonEmptyString(project.UpdatedAt, project.CreatedAt),
			ProjectID: normalizeProjectID(project.ID),
			Channel:   project.Channel,
			AgentSlug: project.LeadAgent,
			Meta: map[string]string{
				"status": project.Status,
			},
		})
	}
	for _, task := range tasks {
		if len(hits) >= limit {
			break
		}
		text := strings.Join([]string{
			task.ID,
			task.ProjectID,
			task.Title,
			task.Details,
			task.HumanDetails,
			task.Owner,
			task.Status,
			task.DeliveryURL,
			task.DeliverySummary,
			task.DeliveryStatus,
			task.WorktreeBranch,
		}, "\n")
		if !strings.Contains(normalizeSearchText(text), needle) {
			continue
		}
		hits = append(hits, workspaceSearchHit{
			ID:        "task:" + task.ID,
			Scope:     "project",
			Source:    "task",
			Title:     firstNonEmptyString(task.Title, task.ID),
			Path:      task.ID,
			Snippet:   snippetForQuery(text, query),
			UpdatedAt: firstNonEmptyString(task.UpdatedAt, task.CreatedAt),
			ProjectID: normalizeProjectID(task.ProjectID),
			TaskID:    task.ID,
			AgentSlug: task.Owner,
			Channel:   task.Channel,
			Meta: map[string]string{
				"status": task.Status,
			},
		})
	}
	return hits
}

func searchWorkspaceTaskChats(messages []channelMessage, tasks []teamTask, query string, limit int) []workspaceSearchHit {
	needle := normalizeSearchText(query)
	messageTasks := taskMessageIndex(messages, tasks)
	hits := make([]workspaceSearchHit, 0, minInt(limit, 16))
	for i := len(messages) - 1; i >= 0 && len(hits) < limit; i-- {
		msg := messages[i]
		ref, ok := messageTasks[strings.TrimSpace(msg.ID)]
		if !ok {
			continue
		}
		text := strings.Join([]string{msg.Title, msg.Content, msg.From}, "\n")
		if !strings.Contains(normalizeSearchText(text), needle) {
			continue
		}
		hits = append(hits, workspaceSearchHit{
			ID:        "chat:" + msg.ID,
			Scope:     "chat",
			Source:    "chat",
			Title:     firstNonEmptyString(msg.Title, ref.Title, "Task conversation"),
			Path:      msg.ID,
			Snippet:   snippetForQuery(text, query),
			UpdatedAt: msg.Timestamp,
			ProjectID: normalizeProjectID(ref.ProjectID),
			TaskID:    ref.TaskID,
			AgentSlug: msg.From,
			Channel:   firstNonEmptyString(msg.Channel, ref.Channel),
			Meta: map[string]string{
				"task": ref.Title,
			},
		})
	}
	return hits
}

func taskMessageIndex(messages []channelMessage, tasks []teamTask) map[string]taskThreadRef {
	byChannel := map[string][]channelMessage{}
	for _, msg := range messages {
		channel := normalizeChannelSlug(msg.Channel)
		byChannel[channel] = append(byChannel[channel], msg)
	}
	tasksByChannel := map[string][]teamTask{}
	for _, task := range tasks {
		channel := normalizeChannelSlug(task.Channel)
		if channel == "" {
			channel = "general"
		}
		tasksByChannel[channel] = append(tasksByChannel[channel], task)
	}

	out := map[string]taskThreadRef{}
	for channel, channelTasks := range tasksByChannel {
		channelMessages := byChannel[channel]
		byParent := map[string][]string{}
		for _, msg := range channelMessages {
			id := strings.TrimSpace(msg.ID)
			parent := strings.TrimSpace(msg.ReplyTo)
			if id != "" && parent != "" {
				byParent[parent] = append(byParent[parent], id)
			}
		}
		for _, task := range channelTasks {
			root := strings.TrimSpace(firstNonEmptyString(task.ThreadID, task.ID))
			if root == "" {
				continue
			}
			ref := taskThreadRef{
				TaskID:    task.ID,
				ProjectID: task.ProjectID,
				Channel:   channel,
				Title:     firstNonEmptyString(task.Title, task.ID),
			}
			queue := []string{root}
			for len(queue) > 0 {
				id := queue[0]
				queue = queue[1:]
				if _, seen := out[id]; !seen {
					out[id] = ref
				}
				for _, child := range byParent[id] {
					if _, seen := out[child]; seen {
						continue
					}
					queue = append(queue, child)
				}
			}
		}
	}
	return out
}

func searchWorkspaceWiki(done <-chan struct{}, repoRoot, query string, limit int) ([]workspaceSearchHit, []string) {
	hits, omitted, ok := searchWorkspaceWikiGit(done, repoRoot, query, limit)
	if ok {
		return hits, omitted
	}
	return searchWorkspaceWikiWalk(done, repoRoot, query, limit)
}

func searchWorkspaceWikiGit(done <-chan struct{}, repoRoot, query string, limit int) ([]workspaceSearchHit, []string, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), workspaceSearchWikiTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "-C", repoRoot, "grep", "-n", "-I", "--fixed-strings", "--ignore-case", "-e", query, "--", "team")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, false
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return nil, nil, false
	}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), workspaceSearchMaxLineBytes)
	var hits []workspaceSearchHit
	for scanner.Scan() {
		select {
		case <-done:
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
			return hits, []string{"search cancelled"}, true
		default:
		}
		hit, ok := workspaceWikiHitFromGrepLine(scanner.Text(), query)
		if ok {
			hits = append(hits, hit)
		}
		if len(hits) >= limit {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
			return hits, nil, true
		}
	}
	waitErr := cmd.Wait()
	if ctx.Err() != nil {
		return hits, []string{"wiki search timed out"}, true
	}
	if waitErr != nil {
		if exitErr, ok := waitErr.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
			return hits, nil, true
		}
		return nil, []string{strings.TrimSpace(stderr.String())}, false
	}
	return hits, nil, true
}

func workspaceWikiHitFromGrepLine(line, query string) (workspaceSearchHit, bool) {
	parts := strings.SplitN(line, ":", 3)
	if len(parts) < 3 {
		return workspaceSearchHit{}, false
	}
	lineNo, err := strconv.Atoi(parts[1])
	if err != nil {
		return workspaceSearchHit{}, false
	}
	path := filepath.ToSlash(parts[0])
	if !strings.HasPrefix(path, "team/") || !strings.HasSuffix(strings.ToLower(path), ".md") {
		return workspaceSearchHit{}, false
	}
	return workspaceSearchHit{
		ID:      fmt.Sprintf("wiki:%s:%d", path, lineNo),
		Scope:   "wiki",
		Source:  "wiki",
		Title:   workspaceSearchTitle(path),
		Path:    path,
		Line:    lineNo,
		Snippet: snippetForQuery(parts[2], query),
	}, true
}

func searchWorkspaceWikiWalk(done <-chan struct{}, repoRoot, query string, limit int) ([]workspaceSearchHit, []string) {
	teamDir := filepath.Join(repoRoot, "team")
	info, err := os.Stat(teamDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, []string{err.Error()}
	}
	if !info.IsDir() {
		return nil, nil
	}
	needle := normalizeSearchText(query)
	var hits []workspaceSearchHit
	var omitted []string
	err = filepath.WalkDir(teamDir, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			omitted = append(omitted, walkErr.Error())
			return nil
		}
		if d.IsDir() {
			if d.Name() == ".git" {
				return filepath.SkipDir
			}
			return nil
		}
		select {
		case <-done:
			return fs.SkipAll
		default:
		}
		if len(hits) >= limit || !strings.HasSuffix(strings.ToLower(path), ".md") {
			return nil
		}
		fileHits := searchWorkspaceWikiFile(repoRoot, path, needle, query, limit-len(hits))
		hits = append(hits, fileHits...)
		return nil
	})
	if err != nil {
		omitted = append(omitted, err.Error())
	}
	return hits, omitted
}

func searchWorkspaceWikiFile(repoRoot, fullPath, needle, query string, limit int) []workspaceSearchHit {
	f, err := os.Open(fullPath)
	if err != nil {
		return nil
	}
	defer func() { _ = f.Close() }()
	rel, _ := filepath.Rel(repoRoot, fullPath)
	rel = filepath.ToSlash(rel)
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), workspaceSearchMaxLineBytes)
	lineNo := 0
	var hits []workspaceSearchHit
	for scanner.Scan() {
		lineNo++
		line := scanner.Text()
		if !strings.Contains(normalizeSearchText(line), needle) {
			continue
		}
		hits = append(hits, workspaceSearchHit{
			ID:      fmt.Sprintf("wiki:%s:%d", rel, lineNo),
			Scope:   "wiki",
			Source:  "wiki",
			Title:   workspaceSearchTitle(rel),
			Path:    rel,
			Line:    lineNo,
			Snippet: snippetForQuery(line, query),
		})
		if len(hits) >= limit {
			break
		}
	}
	return hits
}

func workspaceSearchTitle(path string) string {
	base := filepath.Base(path)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	base = strings.ReplaceAll(base, "-", " ")
	base = strings.ReplaceAll(base, "_", " ")
	if strings.TrimSpace(base) == "" {
		return path
	}
	return base
}

func snippetForQuery(text, query string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	needle := normalizeSearchText(query)
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.Contains(normalizeSearchText(line), needle) {
			return truncateWorkspaceSnippet(redactSensitiveSnippet(line), 220)
		}
	}
	return truncateWorkspaceSnippet(redactSensitiveSnippet(strings.TrimSpace(text)), 220)
}

func truncateWorkspaceSnippet(text string, limit int) string {
	text = strings.Join(strings.Fields(text), " ")
	if len([]rune(text)) <= limit {
		return text
	}
	runes := []rune(text)
	if limit <= 3 {
		return string(runes[:limit])
	}
	return string(runes[:limit-3]) + "..."
}

func redactSensitiveSnippet(text string) string {
	out := text
	for _, pattern := range workspaceSearchSecretPatterns {
		out = pattern.ReplaceAllStringFunc(out, func(match string) string {
			if strings.HasPrefix(match, "sk-") {
				return "[redacted-key]"
			}
			if idx := strings.IndexAny(match, ":="); idx > 0 {
				return strings.TrimSpace(match[:idx]) + ": [redacted]"
			}
			return "[redacted]"
		})
	}
	return out
}

func normalizeSearchText(text string) string {
	return strings.ToLower(strings.TrimSpace(text))
}

func rankWorkspaceHits(hits []workspaceSearchHit, query string) {
	needle := normalizeSearchText(query)
	terms := strings.Fields(needle)
	for i := range hits {
		hayTitle := normalizeSearchText(hits[i].Title + " " + hits[i].Path)
		haySnippet := normalizeSearchText(hits[i].Snippet)
		score := 0
		if strings.Contains(hayTitle, needle) {
			score += 90
		}
		if strings.Contains(haySnippet, needle) {
			score += 50
		}
		for _, term := range terms {
			if strings.Contains(hayTitle, term) {
				score += 8
			}
			if strings.Contains(haySnippet, term) {
				score += 4
			}
		}
		switch hits[i].Source {
		case "project":
			score += 24
		case "task":
			score += 22
		case "wiki":
			score += 18
		case "chat":
			score += 12
		}
		hits[i].Score = score
	}
}

func workspaceScopeRank(scope string) int {
	switch scope {
	case "project":
		return 3
	case "wiki":
		return 2
	case "chat":
		return 1
	default:
		return 0
	}
}

func dedupeWorkspaceHits(hits []workspaceSearchHit) []workspaceSearchHit {
	seen := map[string]struct{}{}
	out := make([]workspaceSearchHit, 0, len(hits))
	for _, hit := range hits {
		key := hit.Source + "\x00" + hit.Path + "\x00" + strconv.Itoa(hit.Line)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, hit)
	}
	return out
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
