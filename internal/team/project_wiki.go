package team

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
	"unicode"
)

const maxProjectMemoryPacketChars = 2400

type AgentMemoryPacket struct {
	Version       string                     `json:"version"`
	Task          AgentMemoryTask            `json:"task"`
	Project       *AgentMemoryProject        `json:"project,omitempty"`
	MustRead      []AgentMemoryReference     `json:"must_read,omitempty"`
	LoadedContext []AgentMemoryLoadedContext `json:"loaded_context,omitempty"`
	Decisions     []AgentMemoryItem          `json:"decisions,omitempty"`
	Risks         []AgentMemoryItem          `json:"risks,omitempty"`
	OpenQuestions []AgentMemoryItem          `json:"open_questions,omitempty"`
	RecentWork    []AgentMemoryWorkReceipt   `json:"recent_work,omitempty"`
	MustObey      []string                   `json:"must_obey,omitempty"`
	StartHere     []string                   `json:"start_here,omitempty"`
	WriteBack     []string                   `json:"write_back,omitempty"`
	Unavailable   []string                   `json:"unavailable,omitempty"`
}

type AgentMemoryTask struct {
	ID             string `json:"id"`
	Title          string `json:"title"`
	Status         string `json:"status,omitempty"`
	Owner          string `json:"owner,omitempty"`
	Channel        string `json:"channel,omitempty"`
	TaskType       string `json:"task_type,omitempty"`
	ExecutionMode  string `json:"execution_mode,omitempty"`
	WorktreePath   string `json:"worktree_path,omitempty"`
	WorktreeBranch string `json:"worktree_branch,omitempty"`
}

type AgentMemoryProject struct {
	ID          string `json:"id"`
	Code        string `json:"code,omitempty"`
	Name        string `json:"name"`
	WikiPath    string `json:"wiki_path"`
	GitHubRepo  string `json:"github_repo,omitempty"`
	LeadAgent   string `json:"lead_agent,omitempty"`
	Description string `json:"description,omitempty"`
}

type AgentMemoryReference struct {
	Kind   string `json:"kind"`
	Path   string `json:"path"`
	Reason string `json:"reason"`
	Status string `json:"status,omitempty"`
}

type AgentMemoryLoadedContext struct {
	Kind      string `json:"kind"`
	Path      string `json:"path"`
	Status    string `json:"status"`
	Chars     int    `json:"chars,omitempty"`
	Truncated bool   `json:"truncated,omitempty"`
	Note      string `json:"note,omitempty"`
}

type AgentMemoryItem struct {
	Text   string `json:"text"`
	Source string `json:"source"`
}

type AgentMemoryWorkReceipt struct {
	TaskID          string `json:"task_id"`
	Title           string `json:"title"`
	Status          string `json:"status"`
	Owner           string `json:"owner,omitempty"`
	DeliveryURL     string `json:"delivery_url,omitempty"`
	DeliverySummary string `json:"delivery_summary,omitempty"`
	Blocker         string `json:"blocker,omitempty"`
	UpdatedAt       string `json:"updated_at,omitempty"`
}

type projectMemoryPacket struct {
	Path              string
	Excerpt           string
	Truncated         bool
	Unavailable       string
	Signals           projectMemorySignals
	OmittedRecentWork int
}

type projectMemorySignals struct {
	Decisions            []AgentMemoryItem
	Risks                []AgentMemoryItem
	OpenQuestions        []AgentMemoryItem
	OmittedDecisions     int
	OmittedRisks         int
	OmittedOpenQuestions int
}

func (b *Broker) materializeProjectWiki(ctx context.Context, project teamProject) error {
	worker := b.WikiWorker()
	if worker == nil {
		return nil
	}

	path := projectWikiArticlePath(project.ID)
	if _, err := worker.ReadArticle(path); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}

	author := strings.TrimSpace(project.CreatedBy)
	if author == "" {
		author = "human"
	}
	_, _, err := worker.Enqueue(
		ctx,
		author,
		path,
		renderProjectWikiArticle(project),
		"create",
		"project: create wiki "+project.ID,
	)
	return err
}

func (b *Broker) syncProjectWikiGitHubRepo(ctx context.Context, project teamProject) error {
	worker := b.WikiWorker()
	if worker == nil {
		return nil
	}

	path := projectWikiArticlePath(project.ID)
	raw, err := worker.ReadArticle(path)
	if os.IsNotExist(err) {
		return b.materializeProjectWiki(ctx, project)
	}
	if err != nil {
		return err
	}

	next, changed := replaceProjectWikiGitHubRepoLine(string(raw), project)
	if !changed {
		return nil
	}

	author := strings.TrimSpace(project.CreatedBy)
	if author == "" {
		author = "human"
	}
	_, _, err = worker.Enqueue(
		ctx,
		author,
		path,
		next,
		"replace",
		"project: update github repo "+project.ID,
	)
	return err
}

func (b *Broker) syncProjectWikiLeadAgent(ctx context.Context, project teamProject) error {
	worker := b.WikiWorker()
	if worker == nil {
		return nil
	}

	path := projectWikiArticlePath(project.ID)
	raw, err := worker.ReadArticle(path)
	if os.IsNotExist(err) {
		return b.materializeProjectWiki(ctx, project)
	}
	if err != nil {
		return err
	}

	next, changed := replaceProjectWikiLeadAgentLine(string(raw), project)
	if !changed {
		return nil
	}

	author := strings.TrimSpace(project.CreatedBy)
	if author == "" {
		author = "human"
	}
	_, _, err = worker.Enqueue(
		ctx,
		author,
		path,
		next,
		"replace",
		"project: update lead agent "+project.ID,
	)
	return err
}

func (b *Broker) syncProjectWikiSnapshot(ctx context.Context, project teamProject) error {
	worker := b.WikiWorker()
	if worker == nil {
		return nil
	}

	path := projectWikiArticlePath(project.ID)
	raw, err := worker.ReadArticle(path)
	if os.IsNotExist(err) {
		return b.materializeProjectWiki(ctx, project)
	}
	if err != nil {
		return err
	}

	next, changed := replaceProjectWikiProjectInfoSections(string(raw), project)
	if !changed {
		return nil
	}

	author := strings.TrimSpace(project.CreatedBy)
	if author == "" {
		author = "human"
	}
	_, _, err = worker.Enqueue(
		ctx,
		author,
		path,
		next,
		"replace",
		"project: update snapshot "+project.ID,
	)
	return err
}

func (b *Broker) projectMemoryForTaskPacket(task teamTask) projectMemoryPacket {
	projectID := normalizeProjectID(task.ProjectID)
	if projectID == "" {
		return projectMemoryPacket{}
	}
	path := projectWikiArticlePath(projectID)
	packet := projectMemoryPacket{Path: path}
	if b == nil {
		packet.Unavailable = "wiki backend is not active"
		return packet
	}
	worker := b.WikiWorker()
	if worker == nil {
		packet.Unavailable = fmt.Sprintf("wiki backend is not active for %s", path)
		return packet
	}

	raw, err := worker.ReadArticle(path)
	if os.IsNotExist(err) {
		project := b.projectSnapshot(projectID)
		if project.ID == "" {
			packet.Unavailable = fmt.Sprintf("%s is missing and project %q was not found", path, projectID)
			return packet
		}
		if err := b.materializeProjectWiki(context.Background(), project); err != nil {
			packet.Unavailable = fmt.Sprintf("failed to materialize %s: %v", path, err)
			return packet
		}
		raw, err = worker.ReadArticle(path)
	}
	if err != nil {
		packet.Unavailable = fmt.Sprintf("failed to read %s: %v", path, err)
		return packet
	}

	project := b.projectSnapshot(projectID)
	liveMemory := renderProjectLiveMemory(project)
	combined := strings.TrimSpace(strings.Join(nonEmptyStrings(liveMemory, string(raw)), "\n\n"))
	packet.Signals = extractProjectMemorySignalsForTask(path, combined, task)
	excerpt := strings.TrimSpace(
		combined,
	)
	if excerpt == "" {
		packet.Unavailable = fmt.Sprintf("%s is empty", path)
		return packet
	}
	runes := []rune(excerpt)
	if len(runes) > maxProjectMemoryPacketChars {
		excerpt = string(runes[:maxProjectMemoryPacketChars])
		packet.Truncated = true
	}
	packet.Excerpt = excerpt
	return packet
}

// agentMemoryPacketForTaskLocked builds the same canonical agent-memory/v1
// packet as AgentMemoryPacketForTask, but uses already-locked broker state.
// Callers must hold b.mu.
func (b *Broker) agentMemoryPacketForTaskLocked(task teamTask) AgentMemoryPacket {
	projectID := normalizeProjectID(task.ProjectID)
	if projectID == "" {
		return buildAgentMemoryPacketForTask(task, projectMemoryPacket{}, teamProject{}, nil)
	}
	project := teamProject{ID: projectID}
	if b != nil {
		if snapshot := b.findProjectLocked(projectID); snapshot != nil {
			project = *snapshot
		}
	}
	memory := b.projectMemoryForTaskPacketLocked(task, project)
	recentWork, omittedRecentWork := b.recentProjectWorkReceiptsForTaskLocked(projectID, task, 5)
	memory.OmittedRecentWork = omittedRecentWork
	packet := buildAgentMemoryPacketForTask(task, memory, project, recentWork)
	b.recordAgentMemoryPacketDiagnosticsLocked(packet, memory, recentWork)
	return packet
}

// projectMemoryForTaskPacketLocked reads the canonical project wiki for a task
// without taking b.mu again. Callers must hold b.mu.
func (b *Broker) projectMemoryForTaskPacketLocked(task teamTask, project teamProject) projectMemoryPacket {
	projectID := normalizeProjectID(task.ProjectID)
	if projectID == "" {
		return projectMemoryPacket{}
	}
	path := projectWikiArticlePath(projectID)
	packet := projectMemoryPacket{Path: path}
	if b == nil {
		packet.Unavailable = "wiki backend is not active"
		return packet
	}
	worker := b.wikiWorker
	if worker == nil {
		packet.Unavailable = fmt.Sprintf("wiki backend is not active for %s", path)
		return packet
	}

	raw, err := worker.ReadArticle(path)
	if os.IsNotExist(err) && project.ID != "" {
		raw = []byte(renderProjectWikiArticle(project))
		err = nil
	}
	if os.IsNotExist(err) {
		packet.Unavailable = fmt.Sprintf("%s is missing and project %q was not found", path, projectID)
		return packet
	}
	if err != nil {
		packet.Unavailable = fmt.Sprintf("failed to read %s: %v", path, err)
		return packet
	}

	liveMemory := renderProjectLiveMemory(project)
	combined := strings.TrimSpace(strings.Join(nonEmptyStrings(liveMemory, string(raw)), "\n\n"))
	packet.Signals = extractProjectMemorySignalsForTask(path, combined, task)
	excerpt := strings.TrimSpace(combined)
	if excerpt == "" {
		packet.Unavailable = fmt.Sprintf("%s is empty", path)
		return packet
	}
	runes := []rune(excerpt)
	if len(runes) > maxProjectMemoryPacketChars {
		excerpt = string(runes[:maxProjectMemoryPacketChars])
		packet.Truncated = true
	}
	packet.Excerpt = excerpt
	return packet
}

func (b *Broker) AgentMemoryPacketForTask(task teamTask) AgentMemoryPacket {
	return b.agentMemoryPacketForTask(task, b.projectMemoryForTaskPacket(task))
}

func (b *Broker) agentMemoryPacketForTask(task teamTask, memory projectMemoryPacket) AgentMemoryPacket {
	projectID := normalizeProjectID(task.ProjectID)
	project := teamProject{}
	if projectID != "" {
		project = teamProject{ID: projectID}
		if b != nil {
			if snapshot := b.projectSnapshot(projectID); snapshot.ID != "" {
				project = snapshot
			}
		}
	}
	var recentWork []AgentMemoryWorkReceipt
	omittedRecentWork := 0
	if b != nil && projectID != "" {
		recentWork, omittedRecentWork = b.recentProjectWorkReceiptsForTask(projectID, task, 5)
	}
	memory.OmittedRecentWork = omittedRecentWork
	packet := buildAgentMemoryPacketForTask(task, memory, project, recentWork)
	if b != nil {
		b.recordAgentMemoryPacketDiagnostics(packet, memory, recentWork)
	}
	return packet
}

func buildAgentMemoryPacketForTask(task teamTask, memory projectMemoryPacket, project teamProject, recentWork []AgentMemoryWorkReceipt) AgentMemoryPacket {
	channel := normalizeChannelSlug(task.Channel)
	if channel == "" {
		channel = "general"
	}
	packet := AgentMemoryPacket{
		Version: "agent-memory/v1",
		Task: AgentMemoryTask{
			ID:             strings.TrimSpace(task.ID),
			Title:          strings.TrimSpace(task.Title),
			Status:         strings.TrimSpace(task.Status),
			Owner:          strings.TrimSpace(task.Owner),
			Channel:        channel,
			TaskType:       strings.TrimSpace(task.TaskType),
			ExecutionMode:  strings.TrimSpace(task.ExecutionMode),
			WorktreePath:   strings.TrimSpace(task.WorktreePath),
			WorktreeBranch: strings.TrimSpace(task.WorktreeBranch),
		},
		MustObey: []string{
			"Treat this packet as the first memory read for the task; do not re-ask for context that is already loaded here.",
			"Use sourced wiki/notebook memory before guessing about prior decisions, project state, or completion rules.",
		},
		StartHere: []string{
			"Use this task packet before team_poll or team_tasks; it is scoped to the pushed work item.",
		},
		WriteBack: []string{
			"Put fresh working notes in notebook_write first; promote durable conclusions with notebook_promote unless the task explicitly calls for a canonical wiki edit.",
			"Do not claim canonical memory was updated unless notebook_promote or team_wiki_write actually succeeded.",
		},
	}

	projectID := normalizeProjectID(task.ProjectID)
	if projectID == "" {
		return packet
	}
	path := projectWikiArticlePath(projectID)
	if project.ID == "" {
		project = teamProject{ID: projectID}
	}
	repo := strings.TrimSpace(project.GitHubRepoURL)
	packet.Project = &AgentMemoryProject{
		ID:          projectID,
		Code:        normalizeProjectCode(project.Code),
		Name:        projectPacketName(project),
		WikiPath:    path,
		GitHubRepo:  repo,
		LeadAgent:   strings.TrimSpace(project.LeadAgent),
		Description: strings.TrimSpace(project.Description),
	}
	status := "loaded"
	if memory.Unavailable != "" {
		status = "unavailable"
		packet.Unavailable = append(packet.Unavailable, memory.Unavailable)
	}
	packet.MustRead = append(packet.MustRead, AgentMemoryReference{
		Kind:   "project_wiki",
		Path:   path,
		Reason: "canonical shared memory for this project",
		Status: status,
	})
	loaded := AgentMemoryLoadedContext{
		Kind:      "project_wiki_excerpt",
		Path:      path,
		Status:    status,
		Chars:     len([]rune(memory.Excerpt)),
		Truncated: memory.Truncated,
	}
	if memory.Unavailable == "" {
		loaded.Note = "Excerpt is injected below this contract; call team_wiki_read only if truncated or missing a needed section."
		if omitted := projectMemoryOmittedCount(memory); omitted > 0 {
			loaded.Note += fmt.Sprintf(" Context budget omitted %d lower-relevance memory item(s); call team_task_context or team_wiki_read only if a missing section is needed.", omitted)
		}
	} else {
		loaded.Note = memory.Unavailable
	}
	packet.LoadedContext = append(packet.LoadedContext, loaded)
	packet.Decisions = append(packet.Decisions, memory.Signals.Decisions...)
	packet.Risks = append(packet.Risks, memory.Signals.Risks...)
	packet.OpenQuestions = append(packet.OpenQuestions, memory.Signals.OpenQuestions...)
	packet.RecentWork = append(packet.RecentWork, recentWork...)
	packet.MustObey = append(packet.MustObey,
		"Project memory is the shared agent memory for this task; keep planning, blockers, receipts, and durable decisions tied back to the project page.",
		projectPacketRepoRule(project),
	)
	if deliveryRule := projectPacketDeliveryRule(project, task); deliveryRule != "" {
		packet.MustObey = append(packet.MustObey, deliveryRule)
	}
	packet.StartHere = append(packet.StartHere,
		"Read the loaded project memory excerpt before broad repository search or new architecture planning.",
	)
	packet.WriteBack = append(packet.WriteBack,
		"Use team_task status changes for lifecycle state; project task events are appended to the project wiki by the broker.",
		"After meaningful delivery, include the concrete receipt or follow-up decision so later agents inherit the real state.",
	)
	if isLocalWorktreeExecutionMode(task.ExecutionMode) {
		packet.StartHere = append(packet.StartHere,
			"For local_worktree work, begin inside the assigned working_directory and ship the smallest runnable slice.",
		)
	}
	if len(packet.Decisions) > 0 {
		packet.StartHere = append(packet.StartHere, "Apply the decisions array before inventing new architecture or workflow policy.")
	}
	if len(packet.Risks) > 0 || len(packet.OpenQuestions) > 0 {
		packet.StartHere = append(packet.StartHere, "Check risks and open_questions before changing task status to review or done.")
	}
	if len(packet.RecentWork) > 0 {
		packet.StartHere = append(packet.StartHere, "Use recent_work receipts to avoid duplicating already-delivered project work.")
	}
	return packet
}

func extractProjectMemorySignalsForTask(source, markdown string, task teamTask) projectMemorySignals {
	decisions, omittedDecisions := selectProjectMemoryItemsForTask(extractProjectSectionBullets(source, markdown, 24, "Decisions", "Decision log"), task, 6)
	risks, omittedRisks := selectProjectMemoryItemsForTask(extractProjectSectionBullets(source, markdown, 24, "Risks", "Risk log", "Blockers", "Known risks"), task, 6)
	openQuestions, omittedOpenQuestions := selectProjectMemoryItemsForTask(extractProjectSectionBullets(source, markdown, 24, "Open questions", "Questions", "Unknowns"), task, 6)
	return projectMemorySignals{
		Decisions:            decisions,
		Risks:                risks,
		OpenQuestions:        openQuestions,
		OmittedDecisions:     omittedDecisions,
		OmittedRisks:         omittedRisks,
		OmittedOpenQuestions: omittedOpenQuestions,
	}
}

func extractProjectSectionBullets(source, markdown string, limit int, headings ...string) []AgentMemoryItem {
	if strings.TrimSpace(markdown) == "" || limit <= 0 {
		return nil
	}
	section := markdownSection(markdown, headings...)
	if section == "" {
		return nil
	}
	items := make([]AgentMemoryItem, 0, limit)
	for _, line := range strings.Split(section, "\n") {
		text := strings.TrimSpace(line)
		text = strings.TrimPrefix(text, "- [ ] ")
		text = strings.TrimPrefix(text, "- [x] ")
		text = strings.TrimPrefix(text, "- [X] ")
		if strings.HasPrefix(text, "- ") || strings.HasPrefix(text, "* ") {
			text = strings.TrimSpace(text[2:])
		} else {
			continue
		}
		if text == "" || isProjectMemoryBoilerplate(text) || isProjectTaskEventBullet(text) {
			continue
		}
		items = append(items, AgentMemoryItem{
			Text:   truncateSummary(oneLineTaskWikiText(text), 280),
			Source: source,
		})
		if len(items) >= limit {
			break
		}
	}
	return items
}

func selectProjectMemoryItemsForTask(items []AgentMemoryItem, task teamTask, limit int) ([]AgentMemoryItem, int) {
	if len(items) <= limit || limit <= 0 {
		if limit <= 0 {
			return nil, len(items)
		}
		return items, 0
	}
	selectedIndexes := map[int]struct{}{0: {}}
	type scoredItem struct {
		item  AgentMemoryItem
		score int
		index int
	}
	scored := make([]scoredItem, 0, len(items))
	for i, item := range items {
		if _, selected := selectedIndexes[i]; selected {
			continue
		}
		scored = append(scored, scoredItem{item: item, score: scoreProjectMemoryItemForTask(item, task), index: i})
	}
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		return scored[i].index < scored[j].index
	})
	for _, item := range scored {
		if len(selectedIndexes) >= limit {
			break
		}
		selectedIndexes[item.index] = struct{}{}
	}
	selected := make([]scoredItem, 0, limit)
	for index := range selectedIndexes {
		selected = append(selected, scoredItem{item: items[index], index: index})
	}
	sort.SliceStable(selected, func(i, j int) bool { return selected[i].index < selected[j].index })
	out := make([]AgentMemoryItem, 0, limit)
	for _, scored := range selected {
		out = append(out, scored.item)
	}
	return out, len(items) - len(out)
}

func scoreProjectMemoryItemForTask(item AgentMemoryItem, task teamTask) int {
	score := 0
	text := strings.ToLower(item.Text)
	for _, token := range projectMemoryRelevanceTokens(task) {
		if strings.Contains(text, token) {
			score += 10
		}
	}
	if strings.Contains(text, "block") || strings.Contains(text, "risk") || strings.Contains(text, "must") || strings.Contains(text, "do not") {
		score += 8
	}
	if strings.Contains(text, "delivery") || strings.Contains(text, "receipt") || strings.Contains(text, "pr") {
		score += 6
	}
	return score
}

func projectMemoryRelevanceTokens(task teamTask) []string {
	raw := strings.Join([]string{
		task.Title,
		task.Details,
		task.HumanDetails,
		task.Owner,
		task.TaskType,
		task.ExecutionMode,
		task.PipelineStage,
		task.ReviewState,
	}, " ")
	seen := map[string]struct{}{}
	tokens := make([]string, 0, 16)
	for _, token := range strings.FieldsFunc(strings.ToLower(raw), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	}) {
		if len(token) < 4 || isProjectMemoryRelevanceStopWord(token) {
			continue
		}
		if _, ok := seen[token]; ok {
			continue
		}
		seen[token] = struct{}{}
		tokens = append(tokens, token)
	}
	return tokens
}

func isProjectMemoryRelevanceStopWord(token string) bool {
	switch token {
	case "task", "work", "with", "this", "that", "from", "have", "will", "into", "make", "ship", "build", "project":
		return true
	default:
		return false
	}
}

func markdownSection(markdown string, headings ...string) string {
	lines := strings.Split(markdown, "\n")
	inSection := false
	var section []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "## ") {
			title := strings.TrimSpace(strings.TrimPrefix(trimmed, "## "))
			title = strings.Trim(title, "# ")
			if inSection {
				break
			}
			for _, heading := range headings {
				if strings.EqualFold(title, strings.TrimSpace(heading)) {
					inSection = true
					break
				}
			}
			continue
		}
		if inSection {
			section = append(section, line)
		}
	}
	return strings.TrimSpace(strings.Join(section, "\n"))
}

func isProjectTaskEventBullet(text string) bool {
	lower := strings.ToLower(strings.TrimSpace(text))
	return strings.Contains(lower, "task `") && strings.Contains(lower, "status `")
}

func isProjectMemoryBoilerplate(text string) bool {
	lower := strings.ToLower(strings.TrimSpace(text))
	boilerplate := []string{
		"record durable product, technical, and workflow decisions here as they are made",
		"include the reason for each decision",
		"before work: read this page",
		"during work: keep task status",
		"after work: append meaningful changes",
		"define the smallest useful project outcome",
		"keep planning, implementation, and automation work tied",
		"record active blockers, delivery risks, stale assumptions",
		"remove or rewrite risk bullets after they are resolved",
		"record unresolved product, technical, workflow, or ownership questions",
		"turn answered questions into decisions or agent work receipts",
	}
	for _, phrase := range boilerplate {
		if strings.Contains(lower, phrase) {
			return true
		}
	}
	return false
}

func (b *Broker) recentProjectWorkReceipts(projectID, currentTaskID string, limit int) []AgentMemoryWorkReceipt {
	receipts, _ := b.recentProjectWorkReceiptsForTask(projectID, teamTask{ID: currentTaskID}, limit)
	return receipts
}

func (b *Broker) recentProjectWorkReceiptsForTask(projectID string, currentTask teamTask, limit int) ([]AgentMemoryWorkReceipt, int) {
	projectID = normalizeProjectID(projectID)
	if b == nil || projectID == "" || limit <= 0 {
		return nil, 0
	}
	b.mu.Lock()
	tasks := make([]teamTask, 0, len(b.tasks))
	for _, task := range b.tasks {
		if normalizeProjectID(task.ProjectID) == projectID && strings.TrimSpace(task.ID) != strings.TrimSpace(currentTask.ID) {
			tasks = append(tasks, task)
		}
	}
	b.mu.Unlock()
	return buildRecentProjectWorkReceiptsForTask(tasks, currentTask, limit)
}

// recentProjectWorkReceiptsLocked returns recent work without taking b.mu again.
// Callers must hold b.mu.
func (b *Broker) recentProjectWorkReceiptsLocked(projectID, currentTaskID string, limit int) []AgentMemoryWorkReceipt {
	receipts, _ := b.recentProjectWorkReceiptsForTaskLocked(projectID, teamTask{ID: currentTaskID}, limit)
	return receipts
}

func (b *Broker) recentProjectWorkReceiptsForTaskLocked(projectID string, currentTask teamTask, limit int) ([]AgentMemoryWorkReceipt, int) {
	projectID = normalizeProjectID(projectID)
	if b == nil || projectID == "" || limit <= 0 {
		return nil, 0
	}
	tasks := make([]teamTask, 0, len(b.tasks))
	for _, task := range b.tasks {
		if normalizeProjectID(task.ProjectID) == projectID && strings.TrimSpace(task.ID) != strings.TrimSpace(currentTask.ID) {
			tasks = append(tasks, task)
		}
	}
	return buildRecentProjectWorkReceiptsForTask(tasks, currentTask, limit)
}

func buildRecentProjectWorkReceipts(tasks []teamTask, limit int) []AgentMemoryWorkReceipt {
	receipts, _ := buildRecentProjectWorkReceiptsForTask(tasks, teamTask{}, limit)
	return receipts
}

func buildRecentProjectWorkReceiptsForTask(tasks []teamTask, currentTask teamTask, limit int) ([]AgentMemoryWorkReceipt, int) {
	fallbackTaskID := latestMeaningfulProjectWorkTaskID(tasks)
	selected := map[string]struct{}{}
	sort.SliceStable(tasks, func(i, j int) bool {
		left := scoreRecentProjectWorkForTask(tasks[i], currentTask)
		right := scoreRecentProjectWorkForTask(tasks[j], currentTask)
		if left != right {
			return left > right
		}
		return latestTaskTimestamp(tasks[i]).After(latestTaskTimestamp(tasks[j]))
	})
	receipts := make([]AgentMemoryWorkReceipt, 0, limit)
	meaningful := 0
	for _, task := range tasks {
		receipt := AgentMemoryWorkReceipt{
			TaskID:          strings.TrimSpace(task.ID),
			Title:           truncateSummary(oneLineTaskWikiText(task.Title), 140),
			Status:          strings.TrimSpace(task.Status),
			Owner:           strings.TrimSpace(task.Owner),
			DeliveryURL:     strings.TrimSpace(task.DeliveryURL),
			DeliverySummary: truncateSummary(oneLineTaskWikiText(task.DeliverySummary), 220),
			UpdatedAt:       latestTaskTimestampString(task),
		}
		if strings.EqualFold(strings.TrimSpace(task.Status), taskStatusBlocked) || task.Blocked {
			receipt.Blocker = truncateSummary(oneLineTaskWikiText(nonEmptyTaskDetails(task)), 220)
		}
		if !projectWorkReceiptIsMeaningful(task) {
			continue
		}
		if receipt.Status == "" && receipt.DeliveryURL == "" && receipt.DeliverySummary == "" && receipt.Blocker == "" {
			continue
		}
		meaningful++
		if len(receipts) < limit {
			if fallbackTaskID != "" && strings.TrimSpace(task.ID) != fallbackTaskID && len(receipts) == limit-1 {
				if _, ok := selected[fallbackTaskID]; !ok {
					continue
				}
			}
			receipts = append(receipts, receipt)
			selected[receipt.TaskID] = struct{}{}
		}
	}
	return receipts, maxInt(0, meaningful-len(receipts))
}

func latestMeaningfulProjectWorkTaskID(tasks []teamTask) string {
	var latest teamTask
	var latestAt time.Time
	for _, task := range tasks {
		if !projectWorkReceiptIsMeaningful(task) {
			continue
		}
		ts := latestTaskTimestamp(task)
		if latest.ID == "" || ts.After(latestAt) {
			latest = task
			latestAt = ts
		}
	}
	return strings.TrimSpace(latest.ID)
}

func projectWorkReceiptIsMeaningful(task teamTask) bool {
	status := strings.TrimSpace(task.Status)
	if strings.EqualFold(status, taskStatusBlocked) || task.Blocked ||
		strings.EqualFold(status, taskStatusReview) ||
		strings.EqualFold(status, taskStatusInProgress) ||
		strings.EqualFold(status, taskStatusDone) ||
		strings.EqualFold(status, taskStatusCompleted) {
		return true
	}
	return strings.TrimSpace(task.DeliveryURL) != "" ||
		strings.TrimSpace(task.DeliverySummary) != "" ||
		strings.TrimSpace(nonEmptyTaskDetails(task)) != ""
}

func scoreRecentProjectWorkForTask(task teamTask, currentTask teamTask) int {
	score := 0
	status := strings.TrimSpace(task.Status)
	switch {
	case strings.EqualFold(status, taskStatusBlocked) || task.Blocked:
		score += 130
	case strings.EqualFold(status, taskStatusReview):
		score += 80
	case strings.EqualFold(status, taskStatusInProgress):
		score += 55
	case strings.EqualFold(status, taskStatusDone) || strings.EqualFold(status, taskStatusCompleted):
		score += 45
	}
	if strings.TrimSpace(task.DeliveryURL) != "" || strings.TrimSpace(task.DeliverySummary) != "" {
		score += 35
	}
	if strings.TrimSpace(task.Owner) != "" && strings.EqualFold(strings.TrimSpace(task.Owner), strings.TrimSpace(currentTask.Owner)) {
		score += 20
	}
	if strings.TrimSpace(task.TaskType) != "" && strings.EqualFold(strings.TrimSpace(task.TaskType), strings.TrimSpace(currentTask.TaskType)) {
		score += 12
	}
	haystack := strings.ToLower(strings.Join([]string{task.Title, task.Details, task.DeliverySummary, task.Owner, task.TaskType}, " "))
	for _, token := range projectMemoryRelevanceTokens(currentTask) {
		if strings.Contains(haystack, token) {
			score += 8
		}
	}
	if latestTaskTimestamp(task).After(time.Now().Add(-14 * 24 * time.Hour)) {
		score += 5
	}
	return score
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func latestTaskTimestamp(task teamTask) time.Time {
	for _, raw := range []string{task.UpdatedAt, task.DeliveredAt, task.CreatedAt} {
		if ts, err := time.Parse(time.RFC3339, strings.TrimSpace(raw)); err == nil {
			return ts
		}
	}
	return time.Time{}
}

func latestTaskTimestampString(task teamTask) string {
	if updated := strings.TrimSpace(task.UpdatedAt); updated != "" {
		return updated
	}
	if delivered := strings.TrimSpace(task.DeliveredAt); delivered != "" {
		return delivered
	}
	return strings.TrimSpace(task.CreatedAt)
}

func nonEmptyTaskDetails(task teamTask) string {
	if details := strings.TrimSpace(task.Details); details != "" {
		return details
	}
	return strings.TrimSpace(task.HumanDetails)
}

func renderAgentMemoryPacket(packet AgentMemoryPacket) []string {
	raw, err := json.MarshalIndent(packet, "", "  ")
	if err != nil {
		return nil
	}
	return []string{
		"Agent memory packet (task-scoped contract):",
		"```json",
		string(raw),
		"```",
	}
}

func renderProjectMemoryPacket(packet projectMemoryPacket) []string {
	if packet.Path == "" {
		return nil
	}
	if packet.Unavailable != "" {
		return []string{"Project memory unavailable: " + packet.Unavailable}
	}
	lines := []string{
		"Project memory excerpt (read before work):",
		"---",
		packet.Excerpt,
		"---",
		"Project memory rule: this excerpt is already loaded; call team_wiki_read only if it is truncated or missing the section you need.",
	}
	if packet.Truncated {
		lines = append(lines, fmt.Sprintf("Project memory excerpt truncated; call team_wiki_read for full article with article_path=%q.", packet.Path))
	}
	return lines
}

func (b *Broker) recordAgentMemoryPacketDiagnostics(packet AgentMemoryPacket, memory projectMemoryPacket, recentWork []AgentMemoryWorkReceipt) {
	if b == nil {
		return
	}
	lines := renderAgentMemoryPacket(packet)
	lines = append(lines, renderProjectMemoryPacket(memory)...)
	text := strings.Join(lines, "\n")
	b.recordContextOptimization(contextOptimizationEvent{
		PacketChars:    agentPacketBudgetChars(packet, memory),
		PacketSections: packetBudgetSections(text),
		MemoryIncluded: projectMemoryIncludedCount(memory, recentWork),
		MemoryOmitted:  projectMemoryOmittedCount(memory),
	})
}

func (b *Broker) recordAgentMemoryPacketDiagnosticsLocked(packet AgentMemoryPacket, memory projectMemoryPacket, recentWork []AgentMemoryWorkReceipt) {
	if b == nil {
		return
	}
	lines := renderAgentMemoryPacket(packet)
	lines = append(lines, renderProjectMemoryPacket(memory)...)
	text := strings.Join(lines, "\n")
	b.recordContextOptimizationLocked(contextOptimizationEvent{
		PacketChars:    agentPacketBudgetChars(packet, memory),
		PacketSections: packetBudgetSections(text),
		MemoryIncluded: projectMemoryIncludedCount(memory, recentWork),
		MemoryOmitted:  projectMemoryOmittedCount(memory),
	})
}

func (b *Broker) appendProjectTaskWikiEvent(ctx context.Context, task teamTask, actor, verb string) error {
	projectID := normalizeProjectID(task.ProjectID)
	if projectID == "" {
		return nil
	}
	worker := b.WikiWorker()
	if worker == nil {
		return nil
	}

	path := projectWikiArticlePath(projectID)
	if _, err := worker.ReadArticle(path); os.IsNotExist(err) {
		if project := b.projectSnapshot(projectID); project.ID != "" {
			if err := b.materializeProjectWiki(ctx, project); err != nil {
				return err
			}
		}
	} else if err != nil {
		return err
	}

	author := strings.TrimSpace(actor)
	if author == "" {
		author = "system"
	}
	_, _, err := worker.Enqueue(
		ctx,
		author,
		path,
		renderProjectTaskWikiEvent(task, verb),
		"append_section",
		"project: record task "+task.ID,
	)
	return err
}

func (b *Broker) projectSnapshot(projectID string) teamProject {
	b.mu.Lock()
	defer b.mu.Unlock()
	project := b.findProjectLocked(projectID)
	if project == nil {
		return teamProject{}
	}
	return *project
}

func projectWikiArticlePath(projectID string) string {
	return fmt.Sprintf("team/projects/%s.md", normalizeProjectID(projectID))
}

func projectIDFromWikiArticlePath(articlePath string) string {
	articlePath = strings.TrimSpace(articlePath)
	articlePath = strings.TrimPrefix(articlePath, "/")
	if !strings.HasPrefix(articlePath, "team/projects/") || !strings.HasSuffix(articlePath, ".md") {
		return ""
	}
	projectID := strings.TrimSuffix(strings.TrimPrefix(articlePath, "team/projects/"), ".md")
	return normalizeProjectID(projectID)
}

func renderProjectWikiGitHubRepoLine(project teamProject) string {
	if repo := strings.TrimSpace(project.GitHubRepoURL); repo != "" {
		return fmt.Sprintf("- GitHub repo: %s", repo)
	}
	return "- GitHub repo: _not connected_"
}

func renderProjectWikiLeadAgentLine(project teamProject) string {
	if leadAgent := strings.TrimSpace(project.LeadAgent); leadAgent != "" {
		return fmt.Sprintf("- Lead agent: `@%s`", leadAgent)
	}
	return "- Lead agent: _not assigned_"
}

func replaceProjectWikiGitHubRepoLine(content string, project teamProject) (string, bool) {
	nextLine := renderProjectWikiGitHubRepoLine(project)
	return replaceProjectWikiSnapshotLine(content, "- GitHub repo:", nextLine)
}

func replaceProjectWikiLeadAgentLine(content string, project teamProject) (string, bool) {
	nextLine := renderProjectWikiLeadAgentLine(project)
	return replaceProjectWikiSnapshotLine(content, "- Lead agent:", nextLine)
}

func replaceProjectWikiProjectInfoSections(content string, project teamProject) (string, bool) {
	nextSection := renderProjectWikiProjectInfoSections(project)
	start := strings.Index(content, "## Snapshot")
	if start == -1 {
		next := strings.TrimRight(content, "\n")
		if next != "" {
			next += "\n\n"
		}
		next += nextSection
		return next + "\n", true
	}
	end := len(content)
	if goals := strings.Index(content[start:], "\n## Goals"); goals >= 0 {
		end = start + goals
	} else if nextHeading := strings.Index(content[start+len("## Snapshot"):], "\n## "); nextHeading >= 0 {
		end = start + len("## Snapshot") + nextHeading
	}
	next := strings.TrimRight(content[:start], "\n")
	if next != "" {
		next += "\n\n"
	}
	next += strings.TrimRight(nextSection, "\n")
	if tail := strings.TrimLeft(content[end:], "\n"); tail != "" {
		next += "\n\n" + tail
	} else {
		next += "\n"
	}
	if next == content {
		return content, false
	}
	return next, true
}

func replaceProjectWikiSnapshotLine(content, prefix, nextLine string) (string, bool) {
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), prefix) {
			if line == nextLine {
				return content, false
			}
			lines[i] = nextLine
			return strings.Join(lines, "\n"), true
		}
	}
	next := strings.TrimRight(content, "\n")
	if next != "" {
		next += "\n"
	}
	next += nextLine + "\n"
	return next, true
}

func renderProjectWikiArticle(project teamProject) string {
	name := strings.TrimSpace(project.Name)
	if name == "" {
		name = project.ID
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "# %s\n\n", name)
	sb.WriteString("Project workspace memory for LAF-Office agents and humans.\n\n")
	sb.WriteString(renderProjectWikiProjectInfoSections(project))

	sb.WriteString("\n## Goals\n\n")
	if description := strings.TrimSpace(project.Description); description != "" {
		fmt.Fprintf(&sb, "- Use the project description as the current working goal: %s\n", description)
	} else {
		sb.WriteString("- Define the smallest useful project outcome before creating implementation tasks.\n")
	}
	sb.WriteString("- Keep planning, implementation, and automation work tied to this project page.\n")

	sb.WriteString("\n## Decisions\n\n")
	sb.WriteString("- Record durable product, technical, and workflow decisions here as they are made.\n")
	sb.WriteString("- Include the reason for each decision and link any task, branch, PR, or wiki page that changed because of it.\n")

	sb.WriteString("\n## Risks\n\n")
	sb.WriteString("- Record active blockers, delivery risks, stale assumptions, and integration constraints here.\n")
	sb.WriteString("- Remove or rewrite risk bullets after they are resolved so agents do not inherit stale warnings.\n")

	sb.WriteString("\n## Open questions\n\n")
	sb.WriteString("- Record unresolved product, technical, workflow, or ownership questions here.\n")
	sb.WriteString("- Turn answered questions into Decisions or Agent work receipts instead of leaving them ambiguous.\n")

	sb.WriteString("\n## Agent work\n\n")
	sb.WriteString("- Before work: read this page or the project memory excerpt in the task packet.\n")
	sb.WriteString("- During work: keep task status, blockers, and ownership visible on the project board.\n")
	sb.WriteString("- After work: append meaningful changes, delivery receipts, and follow-up decisions here.\n")
	return sb.String()
}

func renderProjectWikiProjectInfoSections(project teamProject) string {
	var sb strings.Builder
	sb.WriteString("## Snapshot\n\n")
	fmt.Fprintf(&sb, "- Project ID: `%s`\n", project.ID)
	if code := normalizeProjectCode(project.Code); code != "" {
		fmt.Fprintf(&sb, "- Project code: `%s`\n", code)
	}
	if name := strings.TrimSpace(project.Name); name != "" {
		fmt.Fprintf(&sb, "- Project name: %s\n", name)
	}
	if description := strings.TrimSpace(project.Description); description != "" {
		fmt.Fprintf(&sb, "- Description: %s\n", description)
	}
	if channel := strings.TrimSpace(project.Channel); channel != "" {
		fmt.Fprintf(&sb, "- Channel: `#%s`\n", channel)
	}
	sb.WriteString(renderProjectWikiLeadAgentLine(project) + "\n")
	sb.WriteString(renderProjectWikiGitHubRepoLine(project) + "\n")
	if status := strings.TrimSpace(project.Status); status != "" {
		fmt.Fprintf(&sb, "- Status: `%s`\n", status)
	}
	if updatedAt := strings.TrimSpace(project.UpdatedAt); updatedAt != "" {
		fmt.Fprintf(&sb, "- Updated: `%s`\n", updatedAt)
	}

	if additional := strings.TrimSpace(project.AdditionalInfo); additional != "" {
		sb.WriteString("\n## Additional information\n\n")
		sb.WriteString(additional)
		sb.WriteString("\n")
	}
	if recipe := strings.TrimSpace(project.RecipeMarkdown); recipe != "" {
		sb.WriteString("\n## Agent recipe\n\n")
		if fileName := strings.TrimSpace(project.RecipeFileName); fileName != "" {
			fmt.Fprintf(&sb, "- File: `%s`\n", fileName)
		}
		if updatedAt := strings.TrimSpace(project.RecipeUpdatedAt); updatedAt != "" {
			fmt.Fprintf(&sb, "- Updated: `%s`\n", updatedAt)
		}
		sb.WriteString("\n")
		sb.WriteString(recipe)
		sb.WriteString("\n")
	}
	return strings.TrimRight(sb.String(), "\n") + "\n"
}

func renderProjectLiveMemory(project teamProject) string {
	if strings.TrimSpace(project.ID) == "" {
		return ""
	}
	var sb strings.Builder
	sb.WriteString("Live project reference from the project detail panel:\n")
	fmt.Fprintf(&sb, "- Project ID: `%s`\n", project.ID)
	if code := normalizeProjectCode(project.Code); code != "" {
		fmt.Fprintf(&sb, "- Project code: `%s`\n", code)
	}
	if name := strings.TrimSpace(project.Name); name != "" {
		fmt.Fprintf(&sb, "- Project name: %s\n", name)
	}
	if description := strings.TrimSpace(project.Description); description != "" {
		fmt.Fprintf(&sb, "- Description: %s\n", description)
	}
	if repo := strings.TrimSpace(project.GitHubRepoURL); repo != "" {
		fmt.Fprintf(&sb, "- GitHub repo: %s\n", repo)
	}
	if additional := strings.TrimSpace(project.AdditionalInfo); additional != "" {
		fmt.Fprintf(&sb, "- Additional information: %s\n", oneLineTaskWikiText(additional))
	}
	if recipe := strings.TrimSpace(project.RecipeMarkdown); recipe != "" {
		if fileName := strings.TrimSpace(project.RecipeFileName); fileName != "" {
			fmt.Fprintf(&sb, "- Agent recipe file: `%s`\n", fileName)
		}
		sb.WriteString("\nAgent recipe markdown:\n")
		sb.WriteString(recipe)
		sb.WriteString("\n")
	}
	return strings.TrimSpace(sb.String())
}

func nonEmptyStrings(values ...string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func renderProjectTaskWikiEvent(task teamTask, verb string) string {
	verb = strings.TrimSpace(verb)
	if verb == "" {
		verb = "updated"
	}
	timestamp := strings.TrimSpace(task.UpdatedAt)
	if timestamp == "" {
		timestamp = strings.TrimSpace(task.CreatedAt)
	}
	title := oneLineTaskWikiText(task.Title)
	if title == "" {
		title = task.ID
	}

	parts := []string{fmt.Sprintf("Task `%s` %s: %s", task.ID, verb, title)}
	if status := strings.TrimSpace(task.Status); status != "" {
		parts = append(parts, fmt.Sprintf("status `%s`", status))
	}
	if owner := strings.TrimSpace(task.Owner); owner != "" {
		parts = append(parts, fmt.Sprintf("owner `@%s`", owner))
	}
	if mode := strings.TrimSpace(task.ExecutionMode); mode != "" {
		parts = append(parts, fmt.Sprintf("mode `%s`", mode))
	}
	if branch := strings.TrimSpace(task.WorktreeBranch); branch != "" {
		parts = append(parts, fmt.Sprintf("branch `%s`", branch))
	}
	if deliveryURL := strings.TrimSpace(task.DeliveryURL); deliveryURL != "" {
		parts = append(parts, fmt.Sprintf("delivery `%s`", deliveryURL))
	}
	if deliveryStatus := strings.TrimSpace(task.DeliveryStatus); deliveryStatus != "" {
		parts = append(parts, fmt.Sprintf("PR `%s`", deliveryStatus))
	}
	if review := strings.TrimSpace(task.DeliveryReviewDecision); review != "" {
		parts = append(parts, fmt.Sprintf("review `%s`", review))
	}
	if checks := strings.TrimSpace(task.DeliveryChecksStatus); checks != "" {
		parts = append(parts, fmt.Sprintf("checks `%s`", checks))
	}
	if mergeState := strings.TrimSpace(task.DeliveryMergeState); mergeState != "" {
		parts = append(parts, fmt.Sprintf("merge `%s`", mergeState))
	}
	if task.DeliveryDraft {
		parts = append(parts, "draft PR")
	}

	line := "- " + strings.Join(parts, " — ")
	if timestamp != "" {
		line = "- " + timestamp + " — " + strings.Join(parts, " — ")
	}
	if details := oneLineTaskWikiText(task.Details); details != "" {
		line += "\n  - Details: " + truncateSummary(details, 220)
	}
	if deliverySummary := oneLineTaskWikiText(task.DeliverySummary); deliverySummary != "" {
		line += "\n  - Delivery: " + truncateSummary(deliverySummary, 220)
	}
	if checkedAt := strings.TrimSpace(task.DeliveryCheckedAt); checkedAt != "" {
		line += "\n  - Delivery verified: " + checkedAt
	}
	return line + "\n"
}

func oneLineTaskWikiText(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	return strings.Join(strings.Fields(value), " ")
}
