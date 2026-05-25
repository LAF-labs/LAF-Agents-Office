function startupOfficeReceiptReplay({
  approval = null,
  artifact = null,
  memoryPages = [],
  receipt,
  run,
}) {
  const issues = [];
  const trace = objectValue(receipt?.trace);
  const runMetadata = objectValue(run?.metadata);
  const artifactMetadata = objectValue(artifact?.metadata);
  const approvalMetadata = objectValue(approval?.metadata);
  const promptVersion = firstObject(
    trace.prompt_version,
    runMetadata.prompt_version,
    artifactMetadata.prompt_version,
    approvalMetadata.prompt_version,
  );
  const toolPolicy = firstObject(
    trace.tool_policy,
    runMetadata.tool_policy,
    artifactMetadata.tool_policy,
    approvalMetadata.tool_policy,
  );
  const cost = firstObject(trace.cost, runMetadata.cost, artifactMetadata.cost, approvalMetadata.cost);
  const skillInvocations = firstArray(
    trace.skill_invocations,
    runMetadata.skill_invocations,
    artifactMetadata.skill_invocations,
    approvalMetadata.skill_invocations,
  );
  const structuredOutput = firstObject(
    artifactMetadata.structured_output,
    trace.structured_output,
  );
  const memoryDiff = firstObject(approvalMetadata.memory_diff, trace.memory_diff);
  const approvalRequired = Boolean(trace.approval_required ?? runMetadata.approval_required);

  requireValue(receipt?.id, "receipt id is required", issues);
  requireValue(run?.id, "run id is required", issues);
  if (receipt?.run_id && run?.id && receipt.run_id !== run.id) {
    issues.push("receipt run_id does not match run id");
  }
  if (trace.artifact_id && artifact?.id && trace.artifact_id !== artifact.id) {
    issues.push("receipt artifact_id does not match artifact id");
  }
  if (receipt?.approval_id && approval?.id && receipt.approval_id !== approval.id) {
    issues.push("receipt approval_id does not match approval id");
  }
  if (approvalRequired && !approval?.id) {
    issues.push("approval-required receipt needs approval record");
  }
  if (isAIDraftReceipt(receipt) && !artifact?.id) {
    issues.push("AI draft receipt needs artifact record");
  }
  if (isAIDraftReceipt(receipt) && !Object.keys(structuredOutput).length) {
    issues.push("AI draft replay needs structured output");
  }
  if (!promptVersion.version || !promptVersion.instructions_hash || !promptVersion.schema_hash) {
    issues.push("prompt version manifest is incomplete");
  }
  if (!toolPolicy.version || !toolPolicy.loop_slug) {
    issues.push("tool policy snapshot is incomplete");
  }
  if (!cost.provider || !cost.model || !Number(cost.total_tokens || 0)) {
    issues.push("model cost and usage metadata is incomplete");
  }
  if (!Object.keys(objectValue(run?.inputs)).length && !skillInvocations.length) {
    issues.push("replay needs run inputs or skill invocation input snapshots");
  }
  if (approvalRequired && !Object.keys(memoryDiff).length) {
    issues.push("approval-required replay needs memory diff");
  }

  return {
    issues,
    passed: issues.length === 0,
    replay: {
      approval: approval
        ? {
            approval_gates: firstArray(
              approvalMetadata.approval_gates,
              trace.approval_gates,
            ),
            id: approval.id || null,
            memory_diff: memoryDiff,
            risk_level: approval.risk_level || approvalMetadata.approval_risk_level || "",
            status: approval.status || "",
          }
        : null,
      artifact: artifact
        ? {
            id: artifact.id || null,
            kind: artifact.kind || "",
            structured_output: structuredOutput,
            title: artifact.title || "",
          }
        : null,
      cost,
      inputs: {
        run_inputs: objectValue(run?.inputs),
        skill_invocations: skillInvocations.map((item) => ({
          input_keys: firstArray(item.input_keys),
          input_snapshot: objectValue(item.input_snapshot),
          reason: item.reason || "",
          skill_name: item.skill_name || "",
        })),
      },
      memory_pages: replayMemoryPages(memoryPages, { receipt, run }),
      prompt_version: promptVersion,
      receipt: {
        event_type: receipt?.event_type || "",
        id: receipt?.id || null,
        summary: receipt?.summary || "",
      },
      run: {
        id: run?.id || null,
        objective: run?.objective || "",
        status: run?.status || "",
        summary: run?.summary || "",
      },
      tool_policy: toolPolicy,
    },
  };
}

function replayMemoryPages(memoryPages, { receipt, run }) {
  return firstArray(memoryPages)
    .filter((page) => {
      const provenance = objectValue(page.provenance);
      return (
        provenance.receipt_id === receipt?.id ||
        provenance.run_id === run?.id ||
        firstArray(page.sources).some(
          (source) => source.receipt_id === receipt?.id || source.run_id === run?.id,
        )
      );
    })
    .map((page) => ({
      id: page.id || null,
      provenance: objectValue(page.provenance),
      slug: page.slug || "",
      sources: firstArray(page.sources),
      summary: page.summary || "",
      title: page.title || page.slug || "",
    }));
}

function isAIDraftReceipt(receipt) {
  return receipt?.event_type === "run.ai_draft_ready";
}

function requireValue(value, message, issues) {
  if (!value) issues.push(message);
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value)) || [];
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  startupOfficeReceiptReplay,
};
