function createHostedUsageHandlers(deps) {
  const {
    requirePermission,
    requireUser,
    startupOfficeBetaOpsSnapshot,
    writeJSON,
  } = deps;

  async function handleHostedUsage(req, res) {
    const { membership } = await requireUser(req);
    requirePermission(membership, "workspace:read");
    const snapshot = await startupOfficeBetaOpsSnapshot(membership.team_id);
    const usage = snapshot.usage || {};
    const billing = snapshot.billing || {};
    const limits = snapshot.limits || {};
    const modelSpendCents = numberValue(usage.model_spend_cents);
    const totalTokens = numberValue(usage.total_tokens);
    const toolCalls = numberValue(usage.tool_calls);
    const runs = numberValue(usage.runs);
    const modelSpendPercent = numberValue(usage.model_spend_percent);
    const runPercent = numberValue(usage.run_percent);
    const monthlyModelSpendCents = numberValue(
      limits.monthly_model_spend_cents ?? billing.monthly_model_spend_cents,
    );
    const monthlyRunLimit = numberValue(
      limits.monthly_run_limit ?? billing.monthly_run_limit,
    );

    writeJSON(res, 200, {
      total: {
        cost_usd: centsToUSD(modelSpendCents),
        tool_calls: toolCalls,
        total_tokens: totalTokens,
      },
      session: {
        total_tokens: totalTokens,
      },
      personal_cli: {
        total_tokens: totalTokens,
      },
      laf_ai: {
        limit_percent: modelSpendPercent,
        percent: modelSpendPercent,
      },
      startup_office: {
        billing_state: billing.billing_state || "trial",
        cost_usd: centsToUSD(modelSpendCents),
        model_spend_cents: modelSpendCents,
        monthly_model_spend_cents: monthlyModelSpendCents,
        monthly_run_limit: monthlyRunLimit,
        plan: billing.plan || "trial",
        run_percent: runPercent,
        runs,
        tool_calls: toolCalls,
        total_tokens: totalTokens,
      },
    });
  }

  return {
    usage: handleHostedUsage,
  };
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function centsToUSD(cents) {
  return Math.round(numberValue(cents)) / 100;
}

module.exports = {
  createHostedUsageHandlers,
};
