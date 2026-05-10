package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"

	"github.com/LAF-labs/LAF-Agents-Office/internal/buildinfo"
	"github.com/LAF-labs/LAF-Agents-Office/internal/team"
)

func main() {
	args := os.Args[1:]
	if len(args) > 0 {
		switch args[0] {
		case "--version", "-version", "version":
			fmt.Printf("laf-runner v%s\n", buildinfo.Current().Version)
			return
		case "--help", "-h", "help":
			args = nil
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	if err := team.RunRunnerCommand(ctx, args, os.Stdout, os.Stderr); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}
