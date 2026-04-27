package main

// memory.go keeps the historical `laf-office memory` entry point, but the
// current product surface uses the git-native team wiki only.

import (
	"fmt"
	"os"
)

// runMemory dispatches `laf-office memory <verb>`. Called from main.go when
// args[0] == "memory".
func runMemory(args []string) {
	if len(args) == 0 || subcommandWantsHelp(args) {
		printMemoryHelp()
		return
	}
	fmt.Fprintln(os.Stderr, "laf-office memory: legacy memory migration is not available in this build.")
	os.Exit(1)
}

func printMemoryHelp() {
	fmt.Fprintln(os.Stderr, "laf-office memory - team wiki only")
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "LAF-Office now stores shared memory in the local markdown team wiki.")
	fmt.Fprintln(os.Stderr, "Legacy memory migration is not available in this build.")
}
