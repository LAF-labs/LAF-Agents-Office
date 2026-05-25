async function writeStartupOfficeRunReceipt(repository, membership, body) {
  const receipt = await repository.createReceipt(membership, {
    actor_slug: body.actor_slug || "agent",
    approval_id: body.approval_id || null,
    event_type: body.event_type,
    run_id: body.run_id || null,
    summary: body.summary || "",
    trace: body.trace || {},
  });
  if (typeof repository.createAuditEvent === "function") {
    await repository.createAuditEvent(membership, {
      action: "startup_office.receipt.created",
      metadata: {
        approval_id: body.approval_id || "",
        event_type: body.event_type || "",
        run_id: body.run_id || "",
      },
      target_id: receipt?.id || "",
      target_type: "receipt",
    });
  }
  return receipt;
}

module.exports = {
  writeStartupOfficeRunReceipt,
};
