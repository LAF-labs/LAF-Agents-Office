//go:build !windows

package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "laf-runner-installer is Windows-only. Use the macOS PKG builder or install-runner-protocol.sh on this platform.")
	os.Exit(1)
}
