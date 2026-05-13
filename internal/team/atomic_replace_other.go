//go:build !windows

package team

import "os"

func atomicReplaceFile(tmpName string, path string) error {
	return os.Rename(tmpName, path)
}
