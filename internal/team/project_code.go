package team

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

const maxProjectCodeLength = 12

var projectTaskIDPattern = regexp.MustCompile(`^([A-Z]+)-([0-9]+)$`)

func normalizeProjectCode(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	var out strings.Builder
	for _, r := range raw {
		switch {
		case r >= 'a' && r <= 'z':
			out.WriteRune(r - 'a' + 'A')
		case r >= 'A' && r <= 'Z':
			out.WriteRune(r)
		default:
			return ""
		}
		if out.Len() > maxProjectCodeLength {
			return ""
		}
	}
	return out.String()
}

func validProjectCodeInput(raw string) bool {
	return normalizeProjectCode(raw) != ""
}

func deriveProjectCode(project teamProject, used map[string]struct{}) string {
	source := firstNonEmptyString(project.Name, project.ID, "PROJECT")
	letters := make([]rune, 0, maxProjectCodeLength)
	for _, r := range source {
		switch {
		case r >= 'a' && r <= 'z':
			letters = append(letters, r-'a'+'A')
		case r >= 'A' && r <= 'Z':
			letters = append(letters, r)
		}
		if len(letters) >= 4 {
			break
		}
	}
	if len(letters) == 0 {
		letters = []rune("PROJ")
	}
	base := string(letters)
	if len(base) > maxProjectCodeLength {
		base = base[:maxProjectCodeLength]
	}
	if _, exists := used[base]; !exists {
		return base
	}
	for suffix := 'A'; suffix <= 'Z'; suffix++ {
		stem := base
		if len(stem) >= maxProjectCodeLength {
			stem = stem[:maxProjectCodeLength-1]
		}
		candidate := stem + string(suffix)
		if _, exists := used[candidate]; !exists {
			return candidate
		}
	}
	for i := 0; i < 26*26; i++ {
		first := rune('A' + (i / 26))
		second := rune('A' + (i % 26))
		stem := base
		if len(stem) >= maxProjectCodeLength-1 {
			stem = stem[:maxProjectCodeLength-2]
		}
		candidate := stem + string([]rune{first, second})
		if _, exists := used[candidate]; !exists {
			return candidate
		}
	}
	return ""
}

func parseProjectTaskID(id string) (string, int, bool) {
	matches := projectTaskIDPattern.FindStringSubmatch(strings.TrimSpace(id))
	if len(matches) != 3 {
		return "", 0, false
	}
	n, err := strconv.Atoi(matches[2])
	if err != nil || n <= 0 {
		return "", 0, false
	}
	return matches[1], n, true
}

func projectTaskIDHasCode(id string, code string) bool {
	gotCode, _, ok := parseProjectTaskID(id)
	return ok && gotCode == normalizeProjectCode(code)
}

func isTaskIdentifier(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	if strings.HasPrefix(value, "task-") || strings.HasPrefix(value, "blank-slate-") {
		return true
	}
	_, _, ok := parseProjectTaskID(value)
	return ok
}

func (b *Broker) projectCodeInUseLocked(code string, exceptProjectID string) bool {
	code = normalizeProjectCode(code)
	exceptProjectID = normalizeProjectID(exceptProjectID)
	if code == "" {
		return false
	}
	for _, project := range b.projects {
		if normalizeProjectID(project.ID) == exceptProjectID {
			continue
		}
		if normalizeProjectCode(project.Code) == code {
			return true
		}
	}
	return false
}

func (b *Broker) projectHasTasksLocked(projectID string) bool {
	projectID = normalizeProjectID(projectID)
	if projectID == "" {
		return false
	}
	for _, task := range b.tasks {
		if normalizeProjectID(task.ProjectID) == projectID {
			return true
		}
	}
	return false
}

func (b *Broker) suggestProjectCodeLocked(name, id string) string {
	usedCodes := make(map[string]struct{}, len(b.projects))
	for _, project := range b.projects {
		if code := normalizeProjectCode(project.Code); code != "" {
			usedCodes[code] = struct{}{}
		}
	}
	return deriveProjectCode(teamProject{
		ID:   id,
		Name: name,
	}, usedCodes)
}

func (b *Broker) nextTaskIDForProjectLocked(projectID string) (string, error) {
	project := b.findProjectLocked(projectID)
	if project == nil {
		return "", fmt.Errorf("project not found")
	}
	code := normalizeProjectCode(project.Code)
	if code == "" {
		return "", fmt.Errorf("project code required")
	}
	used := make(map[string]struct{}, len(b.tasks))
	next := 1
	for _, task := range b.tasks {
		id := strings.TrimSpace(task.ID)
		if id != "" {
			used[id] = struct{}{}
		}
		if normalizeProjectID(task.ProjectID) != normalizeProjectID(project.ID) {
			continue
		}
		taskCode, seq, ok := parseProjectTaskID(id)
		if ok && taskCode == code && seq >= next {
			next = seq + 1
		}
	}
	for {
		id := fmt.Sprintf("%s-%d", code, next)
		if _, exists := used[id]; !exists {
			return id, nil
		}
		next++
	}
}

func (b *Broker) nextLegacyTaskIDLocked() string {
	for {
		b.counter++
		id := fmt.Sprintf("task-%d", b.counter)
		if b.findTaskLocked(id) == nil {
			return id
		}
	}
}

func (b *Broker) nextTaskIDLocked(projectID string) (string, error) {
	if normalizeProjectID(projectID) != "" {
		return b.nextTaskIDForProjectLocked(projectID)
	}
	return b.nextLegacyTaskIDLocked(), nil
}

func brokerStateNeedsProjectCodeMigration(state brokerState) bool {
	used := map[string]struct{}{}
	projectCodes := map[string]string{}
	for _, project := range state.Projects {
		project.ID = normalizeProjectID(firstNonEmptyString(project.ID, project.Name))
		if project.ID == "" {
			continue
		}
		code := normalizeProjectCode(project.Code)
		if code == "" {
			return true
		}
		if _, duplicate := used[code]; duplicate {
			return true
		}
		used[code] = struct{}{}
		projectCodes[project.ID] = code
	}
	for _, task := range state.Tasks {
		projectID := normalizeProjectID(task.ProjectID)
		if projectID == "" {
			continue
		}
		code := projectCodes[projectID]
		if code == "" {
			return true
		}
		if !projectTaskIDHasCode(task.ID, code) {
			return true
		}
	}
	return false
}

func (b *Broker) normalizeProjectCodesLocked(projects []teamProject) []teamProject {
	usedCodes := make(map[string]struct{}, len(projects))
	out := make([]teamProject, 0, len(projects))
	for _, project := range projects {
		code := normalizeProjectCode(project.Code)
		if code == "" {
			code = deriveProjectCode(project, usedCodes)
		}
		if code == "" {
			continue
		}
		if _, duplicate := usedCodes[code]; duplicate {
			code = deriveProjectCode(teamProject{ID: project.ID, Name: project.Name}, usedCodes)
		}
		if code == "" {
			continue
		}
		project.Code = code
		usedCodes[code] = struct{}{}
		out = append(out, project)
	}
	return out
}

func (b *Broker) migrateProjectTaskIDsLocked() map[string]string {
	projectCodes := make(map[string]string, len(b.projects))
	for _, project := range b.projects {
		if code := normalizeProjectCode(project.Code); code != "" {
			projectCodes[normalizeProjectID(project.ID)] = code
		}
	}
	if len(projectCodes) == 0 || len(b.tasks) == 0 {
		return nil
	}

	used := make(map[string]struct{}, len(b.tasks))
	nextByCode := make(map[string]int, len(projectCodes))
	keep := make([]bool, len(b.tasks))
	for i, task := range b.tasks {
		id := strings.TrimSpace(task.ID)
		projectID := normalizeProjectID(task.ProjectID)
		code := projectCodes[projectID]
		if code == "" {
			if id != "" {
				used[id] = struct{}{}
			}
			continue
		}
		taskCode, seq, ok := parseProjectTaskID(id)
		if ok && taskCode == code {
			if _, exists := used[id]; !exists {
				keep[i] = true
				used[id] = struct{}{}
				if seq >= nextByCode[code] {
					nextByCode[code] = seq + 1
				}
				continue
			}
		}
	}
	for code, next := range nextByCode {
		if next <= 0 {
			nextByCode[code] = 1
		}
	}

	idMap := make(map[string]string)
	for i := range b.tasks {
		if keep[i] {
			continue
		}
		projectID := normalizeProjectID(b.tasks[i].ProjectID)
		code := projectCodes[projectID]
		if code == "" {
			continue
		}
		next := nextByCode[code]
		if next <= 0 {
			next = 1
		}
		var nextID string
		for {
			nextID = fmt.Sprintf("%s-%d", code, next)
			next++
			if _, exists := used[nextID]; !exists {
				break
			}
		}
		nextByCode[code] = next
		oldID := strings.TrimSpace(b.tasks[i].ID)
		b.tasks[i].ID = nextID
		used[nextID] = struct{}{}
		if oldID != "" && oldID != nextID {
			idMap[oldID] = nextID
		}
	}
	if len(idMap) == 0 {
		return nil
	}
	b.rewriteTaskReferencesLocked(idMap)
	return idMap
}

func (b *Broker) rewriteTaskReferencesLocked(idMap map[string]string) {
	remap := func(value string) string {
		if next, ok := idMap[strings.TrimSpace(value)]; ok {
			return next
		}
		return value
	}
	remapList := func(items []string) []string {
		if len(items) == 0 {
			return items
		}
		out := make([]string, len(items))
		for i, item := range items {
			out[i] = remap(item)
		}
		return out
	}
	for i := range b.tasks {
		b.tasks[i].DependsOn = remapList(b.tasks[i].DependsOn)
		b.tasks[i].ThreadID = remap(b.tasks[i].ThreadID)
	}
	for i := range b.messages {
		b.messages[i].TaskID = remap(b.messages[i].TaskID)
		b.messages[i].ReplyTo = remap(b.messages[i].ReplyTo)
		b.messages[i].PublicReplyTo = remap(b.messages[i].PublicReplyTo)
	}
	for i := range b.runnerJobs {
		b.runnerJobs[i].TaskID = remap(b.runnerJobs[i].TaskID)
	}
	for i := range b.runnerJobEvents {
		b.runnerJobEvents[i].TaskID = remap(b.runnerJobEvents[i].TaskID)
	}
	for i := range b.requests {
		b.requests[i].ReplyTo = remap(b.requests[i].ReplyTo)
	}
	for i := range b.actions {
		b.actions[i].RelatedID = remap(b.actions[i].RelatedID)
	}
	for i := range b.watchdogs {
		if strings.TrimSpace(b.watchdogs[i].TargetType) == "task" {
			b.watchdogs[i].TargetID = remap(b.watchdogs[i].TargetID)
		}
	}
	for i := range b.scheduler {
		if strings.TrimSpace(b.scheduler[i].TargetType) == "task" {
			b.scheduler[i].TargetID = remap(b.scheduler[i].TargetID)
		}
	}
}
