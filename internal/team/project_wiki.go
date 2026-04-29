package team

import (
	"context"
	"fmt"
	"os"
	"strings"
)

const maxProjectMemoryPacketChars = 2400

type projectMemoryPacket struct {
	Path        string
	Excerpt     string
	Truncated   bool
	Unavailable string
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

	excerpt := strings.TrimSpace(string(raw))
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

func replaceProjectWikiGitHubRepoLine(content string, project teamProject) (string, bool) {
	nextLine := renderProjectWikiGitHubRepoLine(project)
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "- GitHub repo:") {
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
	sb.WriteString("## Snapshot\n\n")
	fmt.Fprintf(&sb, "- Project ID: `%s`\n", project.ID)
	if description := strings.TrimSpace(project.Description); description != "" {
		fmt.Fprintf(&sb, "- Description: %s\n", description)
	}
	if channel := strings.TrimSpace(project.Channel); channel != "" {
		fmt.Fprintf(&sb, "- Channel: `#%s`\n", channel)
	}
	sb.WriteString(renderProjectWikiGitHubRepoLine(project) + "\n")
	if status := strings.TrimSpace(project.Status); status != "" {
		fmt.Fprintf(&sb, "- Status: `%s`\n", status)
	}

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

	sb.WriteString("\n## Agent work\n\n")
	sb.WriteString("- Before work: read this page or the project memory excerpt in the task packet.\n")
	sb.WriteString("- During work: keep task status, blockers, and ownership visible on the project board.\n")
	sb.WriteString("- After work: append meaningful changes, delivery receipts, and follow-up decisions here.\n")
	return sb.String()
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
	return line + "\n"
}

func oneLineTaskWikiText(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	return strings.Join(strings.Fields(value), " ")
}
