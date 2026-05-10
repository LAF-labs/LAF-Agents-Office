package team

import (
	"os"
	"path/filepath"

	"github.com/LAF-labs/LAF-Agents-Office/internal/config"
	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

const runnerBackgroundLogMaxBytes int64 = 5 * 1024 * 1024

func openRunnerBackgroundLog() (*os.File, error) {
	home := config.RuntimeHomeDir()
	path := product.RuntimePath(home, "runner-background.log")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	_ = rotateRunnerBackgroundLog(path)
	return os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
}

func rotateRunnerBackgroundLog(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if info.Size() < runnerBackgroundLogMaxBytes {
		return nil
	}
	rotated := path + ".1"
	if err := os.Remove(rotated); err != nil && !os.IsNotExist(err) {
		return err
	}
	return os.Rename(path, rotated)
}
