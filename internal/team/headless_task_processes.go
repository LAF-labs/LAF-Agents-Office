package team

import (
	"bytes"
	"os/exec"
	"strconv"
	"strings"

	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

var listHeadlessTaskProcesses = func() ([]byte, error) {
	return exec.Command("ps", "-axo", "pid=,command=").Output()
}

var killHeadlessTaskProcess = func(pid int) {
	terminateHeadlessProcessPID(pid)
}

type headlessTaskProcess struct {
	PID     int
	Command string
}

func killStaleHeadlessTaskProcesses() {
	output, err := listHeadlessTaskProcesses()
	if err != nil {
		return
	}
	seen := map[int]struct{}{}
	for _, proc := range parseHeadlessTaskProcesses(output) {
		if !isHeadlessTaskProcessCommand(proc.Command) {
			continue
		}
		if _, ok := seen[proc.PID]; ok {
			continue
		}
		seen[proc.PID] = struct{}{}
		killHeadlessTaskProcess(proc.PID)
	}
}

func parseHeadlessTaskProcesses(output []byte) []headlessTaskProcess {
	lines := bytes.Split(output, []byte{'\n'})
	processes := make([]headlessTaskProcess, 0, len(lines))
	for _, raw := range lines {
		line := strings.TrimSpace(string(raw))
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		pid, err := strconv.Atoi(fields[0])
		if err != nil || pid <= 0 {
			continue
		}
		command := strings.TrimSpace(strings.TrimPrefix(line, fields[0]))
		if command == "" {
			continue
		}
		processes = append(processes, headlessTaskProcess{
			PID:     pid,
			Command: command,
		})
	}
	return processes
}

func isHeadlessTaskProcessCommand(command string) bool {
	command = strings.TrimSpace(command)
	if command == "" {
		return false
	}
	return strings.Contains(command, "codex") &&
		strings.Contains(command, product.TaskPrefix) &&
		strings.Contains(command, "mcp_servers."+product.CLIName+".command=")
}
