function createHostedAgentLogHandlers(deps) {
  const {
    requirePermission,
    requireUser,
    startupOfficeReceipts,
    writeJSON,
  } = deps;

  async function handleHostedAgentLogs(req, res) {
    const { membership } = await requireUser(req);
    requirePermission(membership, "workspace:read");
    const receipts = await startupOfficeReceipts(membership.team_id, {
      limit: Number(req.query?.limit) || 100,
      run_id: req.query?.task || req.query?.run_id || "",
    });
    writeJSON(res, 200, {
      logs: receipts.map(receiptLog).filter(Boolean),
    });
  }

  return {
    agentLogs: handleHostedAgentLogs,
  };
}

function receiptLog(receipt) {
  if (!receipt) return null;
  const trace = objectValue(receipt.trace);
  const cost = objectValue(trace.cost);
  return {
    action: receipt.event_type || "",
    agent: receipt.actor_slug || "",
    content: receipt.summary || "",
    id: receipt.id || "",
    task: receipt.run_id || undefined,
    timestamp: receipt.created_at || undefined,
    usage: usageFromCost(cost),
  };
}

function usageFromCost(cost) {
  return {
    cost_usd: numberValue(cost.estimated_usd),
    input_tokens: numberValue(cost.input_tokens),
    output_tokens: numberValue(cost.output_tokens),
    total_tokens: numberValue(cost.total_tokens),
  };
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

module.exports = {
  createHostedAgentLogHandlers,
};
