package team

import (
	"os"
	"path/filepath"

	"github.com/LAF-labs/LAF-Agents-Office/internal/config"
	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

func openRunnerBackgroundLog() (*os.File, error) {
	home := config.RuntimeHomeDir()
	path := product.RuntimePath(home, "runner-background.log")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	return os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
}
