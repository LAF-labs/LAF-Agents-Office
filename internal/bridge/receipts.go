package bridge

import (
	"context"
	"os/exec"
	"strings"
)

type ChangedFile struct {
	Path   string `json:"path"`
	Status string `json:"status"`
}

func CaptureChangedFiles(ctx context.Context, dir string) ([]ChangedFile, error) {
	if strings.TrimSpace(dir) == "" {
		return nil, nil
	}
	cmd := exec.CommandContext(ctx, "git", "-C", dir, "status", "--porcelain")
	out, err := cmd.Output()
	if err != nil {
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
