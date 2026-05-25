async function recordStartupOfficeRunOutcome({
  membership,
  objectValue,
  result,
  safeStartupOfficeRest,
}) {
  const cost = objectValue(result?.run?.metadata?.cost);
  await safeStartupOfficeRest("startup_office_usage_events", {
    method: "POST",
    body: {
      cost_cents: Number(cost.estimated_cents || 0),
      created_by: membership.user_id,
      event_type: "model_run",
      input_tokens: Number(cost.input_tokens || 0),
      metadata: {
        status: result?.status || "",
      },
      model: cost.model || result?.run?.metadata?.model || "",
      output_tokens: Number(cost.output_tokens || 0),
      provider: cost.provider || result?.run?.metadata?.provider || "",
      run_id: result?.run?.id || null,
      team_id: membership.team_id,
      total_tokens: Number(cost.total_tokens || 0),
    },
  });
  await safeStartupOfficeRest("startup_office_notifications", {
    method: "POST",
    body: {
      event_type: result?.status === "failed" ? "run_failed" : "approval_waiting",
      payload: {
        run_id: result?.run?.id || null,
        status: result?.status || "",
      },
      recipient_user_id: membership.user_id,
      status: "pending",
      team_id: membership.team_id,
    },
  });
}

module.exports = {
  recordStartupOfficeRunOutcome,
};
