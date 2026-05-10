//go:build windows

package team

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"syscall"
)

const (
	windowsCreateNoWindow  = 0x08000000
	windowsDetachedProcess = 0x00000008
)

func startRunnerConnectBackground(stdout io.Writer) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	logFile, err := openRunnerBackgroundLog()
	if err != nil {
		return err
	}
	cmd := exec.Command(exe, "connect")
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Stdin = nil
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: windowsCreateNoWindow | windowsDetachedProcess,
		HideWindow:    true,
	}
	if err := cmd.Start(); err != nil {
		_ = logFile.Close()
		return err
	}
	if stdout != nil {
		fmt.Fprintf(stdout, "Runner background log: %s\n", logFile.Name())
	}
	err = cmd.Process.Release()
	_ = logFile.Close()
	return err
}
