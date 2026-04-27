// Package product centralizes LAF-Office identity and filesystem metadata.
package product

import (
	"path/filepath"
	"strings"
)

const (
	BrandName      = "LAF-Office"
	CLIName        = "laf-office"
	NpmPackageName = "laf-office"
	EnvPrefix      = "LAF_OFFICE"
	RuntimeDirName = ".laf-office"
	TaskPrefix     = CLIName + "-task-"
	TaskRootName   = CLIName + "-task-worktrees"

	RepositoryOwner = "LAF-labs"
	RepositoryName  = "LAF-Agents-Office"
	GoModulePath    = "github.com/LAF-labs/LAF-Agents-Office"
)

func Env(name string) string {
	name = strings.Trim(strings.TrimSpace(name), "_")
	if name == "" {
		return EnvPrefix
	}
	return EnvPrefix + "_" + name
}

func RepositorySlug() string {
	return RepositoryOwner + "/" + RepositoryName
}

func RepositoryURL() string {
	return "https://github.com/" + RepositorySlug()
}

func IssuesURL() string {
	return RepositoryURL() + "/issues"
}

func RuntimePath(home string, elems ...string) string {
	parts := make([]string, 0, len(elems)+2)
	if strings.TrimSpace(home) != "" {
		parts = append(parts, home)
	}
	parts = append(parts, RuntimeDirName)
	parts = append(parts, elems...)
	return filepath.Join(parts...)
}
