package main

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LAF-labs/LAF-Agents-Office/internal/bridge"
	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

func TestRunLinkBindingsAndUnlinkProject(t *testing.T) {
	t.Setenv(product.Env("BRIDGE_CONFIG_PATH"), filepath.Join(t.TempDir(), "config.json"))
	if err := bridge.SaveConfig("", bridge.Config{DeviceID: "device-1"}); err != nil {
		t.Fatal(err)
	}
	var stdout, stderr bytes.Buffer
	if err := run([]string{
		"link-project",
		"--binding-id", "binding-1",
		"--project-id", "project-1",
		"--path", "/work/project",
		"--display-name", "Project",
	}, &stdout, &stderr); err != nil {
		t.Fatalf("link-project: %v stderr=%s", err, stderr.String())
	}
	cfg, err := bridge.LoadConfig("")
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Bindings) != 1 || cfg.Bindings[0].ID != "binding-1" || !cfg.Bindings[0].Trusted {
		t.Fatalf("binding not saved: %#v", cfg.Bindings)
	}
	stdout.Reset()
	if err := run([]string{"bindings"}, &stdout, &stderr); err != nil {
		t.Fatalf("bindings: %v", err)
	}
	if !strings.Contains(stdout.String(), "binding-1") {
		t.Fatalf("bindings output missing binding id: %s", stdout.String())
	}
	if err := run([]string{"unlink-project", "--binding-id", "binding-1"}, &stdout, &stderr); err != nil {
		t.Fatalf("unlink-project: %v", err)
	}
	cfg, err = bridge.LoadConfig("")
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Bindings) != 0 {
		t.Fatalf("binding not removed: %#v", cfg.Bindings)
	}
}
