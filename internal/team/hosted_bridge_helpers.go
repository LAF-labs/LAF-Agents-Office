package team

import (
	"os"
	"os/exec"
	"strings"

	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

type hostedWikiWriteRequest struct {
	ID          string `json:"id"`
	TeamID      string `json:"team_id"`
	ProjectID   string `json:"project_id,omitempty"`
	ArticlePath string `json:"article_path"`
	Status      string `json:"status"`
	RequestedBy string `json:"requested_by,omitempty"`
	CommitSHA   string `json:"commit_sha,omitempty"`
	Error       string `json:"error,omitempty"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at,omitempty"`
	CompletedAt string `json:"completed_at,omitempty"`
}

type hostedWikiArticleIndex struct {
	ID            string   `json:"id"`
	TeamID        string   `json:"team_id"`
	ProjectID     string   `json:"project_id,omitempty"`
	ArticlePath   string   `json:"article_path"`
	Title         string   `json:"title,omitempty"`
	LastCommit    string   `json:"last_commit,omitempty"`
	Excerpt       string   `json:"excerpt,omitempty"`
	Decisions     []string `json:"decisions,omitempty"`
	Risks         []string `json:"risks,omitempty"`
	OpenQuestions []string `json:"open_questions,omitempty"`
	UpdatedAt     string   `json:"updated_at,omitempty"`
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func commandExists(names ...string) bool {
	for _, name := range names {
		if path, err := exec.LookPath(name); err == nil && strings.TrimSpace(path) != "" {
			return true
		}
	}
	return false
}

func hostedExecutionBoundaryEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(product.Env("EXECUTION_BOUNDARY")))) {
	case "bridge", "hosted", "web":
		return true
	}
	raw := strings.ToLower(strings.TrimSpace(os.Getenv(product.Env("HOSTED_CONTROL_PLANE"))))
	return raw == "1" || raw == "true" || raw == "yes"
}
