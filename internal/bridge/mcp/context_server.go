package mcp

import (
	"context"
	"encoding/json"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

type ContextServer struct {
	Gateway Gateway
	Token   string
}

func (s ContextServer) NewServer() *sdk.Server {
	server := sdk.NewServer(&sdk.Implementation{
		Name:    "laf-bridge-context",
		Version: "0.1.0",
	}, nil)
	sdk.AddTool(server, readOnlyTool(ToolTaskContext, "Return the task-scoped LAF context packet."), s.handleTaskContext)
	sdk.AddTool(server, readOnlyTool(ToolWikiSearch, "Search task-scoped LAF wiki context."), s.handleWikiSearch)
	sdk.AddTool(server, writeTool(ToolExecutionReceiptWrite, "Write a task-scoped execution receipt."), s.handleReceiptWrite)
	return server
}

func (s ContextServer) RunStdio(ctx context.Context) error {
	return s.NewServer().Run(ctx, &sdk.StdioTransport{})
}

func (s ContextServer) handleTaskContext(ctx context.Context, _ *sdk.CallToolRequest, args struct{}) (*sdk.CallToolResult, any, error) {
	return s.call(ctx, ToolTaskContext, args)
}

func (s ContextServer) handleWikiSearch(ctx context.Context, _ *sdk.CallToolRequest, args WikiSearchArgs) (*sdk.CallToolResult, any, error) {
	return s.call(ctx, ToolWikiSearch, args)
}

func (s ContextServer) handleReceiptWrite(ctx context.Context, _ *sdk.CallToolRequest, args ReceiptWriteArgs) (*sdk.CallToolResult, any, error) {
	return s.call(ctx, ToolExecutionReceiptWrite, args)
}

func (s ContextServer) call(ctx context.Context, name string, args any) (*sdk.CallToolResult, any, error) {
	raw, _ := json.Marshal(args)
	result, err := s.Gateway.CallTool(ctx, s.Token, name, raw)
	if err != nil {
		return toolError(err), nil, nil
	}
	payload, _ := json.Marshal(result.Payload)
	return textResult(string(payload)), nil, nil
}

func readOnlyTool(name, description string) *sdk.Tool {
	return &sdk.Tool{
		Name:        name,
		Description: description,
		Annotations: &sdk.ToolAnnotations{
			ReadOnlyHint:  true,
			OpenWorldHint: boolPtr(false),
		},
	}
}

func writeTool(name, description string) *sdk.Tool {
	return &sdk.Tool{
		Name:        name,
		Description: description,
		Annotations: &sdk.ToolAnnotations{
			DestructiveHint: boolPtr(false),
			OpenWorldHint:   boolPtr(false),
		},
	}
}

func textResult(text string) *sdk.CallToolResult {
	return &sdk.CallToolResult{
		Content: []sdk.Content{
			&sdk.TextContent{Text: text},
		},
	}
}

func toolError(err error) *sdk.CallToolResult {
	result := textResult(err.Error())
	result.IsError = true
	return result
}

func boolPtr(v bool) *bool {
	return &v
}
