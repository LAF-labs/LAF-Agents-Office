package team

import (
	"context"
	"fmt"
	"os"
	"strings"
)

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

func projectWikiArticlePath(projectID string) string {
	return fmt.Sprintf("team/projects/%s.md", normalizeProjectID(projectID))
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
	if repo := strings.TrimSpace(project.GitHubRepoURL); repo != "" {
		fmt.Fprintf(&sb, "- GitHub repo: %s\n", repo)
	} else {
		sb.WriteString("- GitHub repo: _not connected_\n")
	}
	if status := strings.TrimSpace(project.Status); status != "" {
		fmt.Fprintf(&sb, "- Status: `%s`\n", status)
	}

	sb.WriteString("\n## Goals\n\n")
	sb.WriteString("- TODO: Capture the project goal.\n")
	sb.WriteString("\n## Decisions\n\n")
	sb.WriteString("- TODO: Record durable project decisions here.\n")
	sb.WriteString("\n## Agent work\n\n")
	sb.WriteString("- TODO: Link tasks, branches, handoffs, and shipped changes.\n")
	return sb.String()
}
