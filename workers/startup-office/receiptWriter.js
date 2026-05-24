async function writeStartupOfficeRunReceipt(repository, membership, body) {
  return repository.createReceipt(membership, {
    actor_slug: body.actor_slug || "agent",
    approval_id: body.approval_id || null,
    event_type: body.event_type,
    run_id: body.run_id || null,
    summary: body.summary || "",
    trace: body.trace || {},
  });
}

module.exports = {
  writeStartupOfficeRunReceipt,
};
