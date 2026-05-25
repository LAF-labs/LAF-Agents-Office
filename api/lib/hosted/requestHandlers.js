function createHostedRequestHandlers(deps) {
  const {
    approvalAction,
    createHTTPError,
    readBody,
    requirePermission,
    requireUser,
    startupOfficeApprovals,
    writeJSON,
  } = deps;

  async function handleHostedRequests(req, res) {
    const { membership } = await requireUser(req);
    requirePermission(membership, "workspace:read");
    const approvals = await startupOfficeApprovals(membership.team_id, {
      limit: Number(req.query?.limit) || 100,
      status: req.query?.status,
    });
    writeJSON(res, 200, {
      requests: approvals.map(requestFromApproval).filter(Boolean),
    });
  }

  async function handleHostedRequestAnswer(req, res) {
    const body = objectValue(await readBody(req));
    const id = String(body.id || "").trim();
    const choiceID = String(body.choice_id || body.choiceId || "").trim();
    if (!id) throw createHTTPError(400, "request id is required");
    const action = actionFromChoice(choiceID);
    if (!action) throw createHTTPError(400, "unsupported request answer");
    const note = String(body.custom_text || body.note || body.reason || "").trim();
    await approvalAction(
      {
        ...req,
        body: { note, reason: note, revision_note: note },
      },
      res,
      id,
      action,
    );
  }

  return {
    requestAnswer: handleHostedRequestAnswer,
    requests: handleHostedRequests,
  };
}

function requestFromApproval(approval) {
  if (!approval) return null;
  const status = approval.status || "pending";
  const pending = status === "pending";
  return {
    blocking: pending,
    channel: "startup-office",
    context: approval.details || approval.action || "",
    created_at: approval.requested_at || "",
    from: approval.requested_by ? "founder" : "agent",
    id: approval.id || "",
    kind: "approval",
    options: pending ? requestOptions(approval) : [],
    question: approval.details || approval.title || "Review this Startup Office approval.",
    recommended_id: "approve",
    required: pending,
    status,
    timestamp: approval.requested_at || "",
    title: approval.title || "Startup Office approval",
    updated_at: approval.decided_at || approval.requested_at || "",
  };
}

function requestOptions(approval) {
  const risk = approval.risk_level || "medium";
  return [
    {
      description: "Approve this Startup Office action and record the decision.",
      id: "approve",
      label: risk === "high" ? "Approve high-risk action" : "Approve",
    },
    {
      description: "Reject this action and close the pending run.",
      id: "reject",
      label: "Reject",
    },
    {
      description: "Ask the AI office to revise the draft before approval.",
      id: "revise",
      label: "Request revision",
      requires_text: true,
      text_hint: "What should change?",
    },
  ];
}

function actionFromChoice(choiceID) {
  const normalized = String(choiceID || "").trim().toLowerCase();
  if (["approve", "approved", "yes"].includes(normalized)) return "approve";
  if (["reject", "rejected", "no"].includes(normalized)) return "reject";
  if (["revise", "revision", "request_revision"].includes(normalized)) return "revise";
  return "";
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  createHostedRequestHandlers,
};
