package bridge

import (
	"context"
	"os/exec"
	"regexp"
	"strings"
)

var githubPullRequestURLPattern = regexp.MustCompile(`https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+`)

type ChangedFile struct {
	Path   string `json:"path"`
	Status string `json:"status"`
}

type Artifact struct {
	Type  string `json:"type"`
	URL   string `json:"url,omitempty"`
	Title string `json:"title,omitempty"`
}

func CaptureChangedFiles(ctx context.Context, dir string) ([]ChangedFile, error) {
	if strings.TrimSpace(dir) == "" {
		return nil, nil
	}
	cmd := exec.CommandContext(ctx, "git", "-C", dir, "status", "--porcelain")
	out, err := cmd.CombinedOutput()
	if err != nil {
		if strings.Contains(string(out), "not a git repository") {
			return nil, nil
		}
		return nil, err
	}
	var files []ChangedFile
	for _, line := range strings.Split(strings.TrimRight(string(out), "\n"), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		if len(line) < 4 {
			continue
		}
		status := strings.TrimSpace(line[:2])
		path := strings.TrimSpace(line[3:])
		if idx := strings.LastIndex(path, " -> "); idx >= 0 {
			path = strings.TrimSpace(path[idx+4:])
		}
		files = append(files, ChangedFile{Path: path, Status: status})
	}
	return files, nil
}

func ExtractExecutionArtifacts(summary string, events []ProviderEvent) []Artifact {
	seen := map[string]struct{}{}
	artifacts := []Artifact{}
	addPRs := func(text string) {
		for _, url := range githubPullRequestURLPattern.FindAllString(text, -1) {
			if _, ok := seen[url]; ok {
				continue
			}
			seen[url] = struct{}{}
			artifacts = append(artifacts, Artifact{
				Type:  "pull_request",
				URL:   url,
				Title: "GitHub pull request",
			})
		}
	}
	addPRs(summary)
	for _, event := range events {
		for _, value := range event.Payload {
			if text, ok := value.(string); ok {
				addPRs(text)
			}
		}
	}
	return artifacts
}
