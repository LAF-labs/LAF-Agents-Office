//go:build windows

package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const (
	messageBoxOK          = 0x00000000
	messageBoxIconError   = 0x00000010
	messageBoxIconInfo    = 0x00000040
	windowsProtocolScheme = `Software\Classes\laf-runner`
	windowsRunKey         = `Software\Microsoft\Windows\CurrentVersion\Run`
	windowsRunValue       = `LAF Office Runner`
)

func main() {
	if err := installRunner(); err != nil {
		showMessage("LAF Runner Installer", err.Error(), messageBoxOK|messageBoxIconError)
		os.Exit(1)
	}

	showMessage(
		"LAF Runner Installer",
		"LAF Runner is installed and will start when you sign in. Return to the browser and click Connect this computer.",
		messageBoxOK|messageBoxIconInfo,
	)
}

func installRunner() error {
	installerPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve installer path: %w", err)
	}

	sourceRunner := filepath.Join(filepath.Dir(installerPath), "laf-runner.exe")
	if _, err := os.Stat(sourceRunner); err != nil {
		return fmt.Errorf("laf-runner.exe must be next to this installer: %w", err)
	}

	installDir, err := runnerInstallDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		return fmt.Errorf("create install directory: %w", err)
	}

	installedRunner := filepath.Join(installDir, "laf-runner.exe")
	if err := copyFile(sourceRunner, installedRunner); err != nil {
		return err
	}
	if err := registerRunnerURLHandler(installedRunner); err != nil {
		return err
	}
	if err := registerRunnerRunAtLogin(installedRunner); err != nil {
		return err
	}

	return nil
}

func runnerInstallDir() (string, error) {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		configDir, err := os.UserConfigDir()
		if err != nil {
			return "", fmt.Errorf("resolve user config directory: %w", err)
		}
		base = configDir
	}
	return filepath.Join(base, "LAF-Office", "Runner"), nil
}

func copyFile(sourcePath, destPath string) error {
	source, err := os.Open(sourcePath)
	if err != nil {
		return fmt.Errorf("open runner binary: %w", err)
	}
	defer source.Close()

	dest, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return fmt.Errorf("write runner binary: %w", err)
	}
	defer dest.Close()

	if _, err := io.Copy(dest, source); err != nil {
		return fmt.Errorf("copy runner binary: %w", err)
	}
	return nil
}

func registerRunnerURLHandler(runnerPath string) error {
	schemeKey, _, err := registry.CreateKey(registry.CURRENT_USER, windowsProtocolScheme, registry.SET_VALUE|registry.CREATE_SUB_KEY)
	if err != nil {
		return fmt.Errorf("create URL scheme registry key: %w", err)
	}
	defer schemeKey.Close()

	if err := schemeKey.SetStringValue("", "URL:LAF Runner"); err != nil {
		return fmt.Errorf("write URL scheme label: %w", err)
	}
	if err := schemeKey.SetStringValue("URL Protocol", ""); err != nil {
		return fmt.Errorf("write URL protocol marker: %w", err)
	}

	commandKey, _, err := registry.CreateKey(registry.CURRENT_USER, windowsProtocolScheme+`\shell\open\command`, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("create URL command registry key: %w", err)
	}
	defer commandKey.Close()

	command := fmt.Sprintf(`"%s" pair-url "%%1"`, runnerPath)
	if err := commandKey.SetStringValue("", command); err != nil {
		return fmt.Errorf("write URL command: %w", err)
	}
	return nil
}

func registerRunnerRunAtLogin(runnerPath string) error {
	runKey, _, err := registry.CreateKey(registry.CURRENT_USER, windowsRunKey, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("create run-at-login registry key: %w", err)
	}
	defer runKey.Close()

	command := fmt.Sprintf(`"%s" connect`, runnerPath)
	if err := runKey.SetStringValue(windowsRunValue, command); err != nil {
		return fmt.Errorf("write run-at-login command: %w", err)
	}
	return nil
}

func showMessage(title, body string, flags uint32) {
	titlePtr, _ := windows.UTF16PtrFromString(title)
	bodyPtr, _ := windows.UTF16PtrFromString(body)
	windows.MessageBox(0, bodyPtr, titlePtr, flags)
}
