function createHostedSkillHandlers(deps) {
  const {
    createHTTPError,
    nowISO,
    readBody,
    requirePermission,
    requireUser,
    rest,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleSkills(req, res) {
    const { membership } = await requireUser(req);
    if (req.method === "GET") {
      requirePermission(membership, "skill:read");
      const rows = await rest("skills", {
        query: {
          order: "updated_at.desc",
          select: "*",
          status: "neq.archived",
          team_id: `eq.${membership.team_id}`,
        },
      });
      writeJSON(res, 200, { skills: rows || [] });
      return;
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const action = String(body.action || "propose").trim();
      if (action === "create") {
        requirePermission(membership, "skill:create_active");
      } else {
        requirePermission(membership, "skill:propose");
      }
      const status = action === "create" ? "active" : "proposed";
      const [skill] = await rest("skills", {
        method: "POST",
        body: {
          channel: body.channel || "general",
          content: String(body.content || ""),
          created_by: body.created_by || membership.user_id,
          created_by_user_id: membership.user_id,
          description: body.description || "",
          name: String(body.name || "").trim(),
          risk: body.risk || "low",
          required_permissions: permissionRequirementList(body.required_permissions),
          status,
          tags: Array.isArray(body.tags) ? body.tags : [],
          team_id: membership.team_id,
          title: body.title || body.name || "",
          trigger: body.trigger || "",
          workflow_definition: body.workflow_definition || "",
          workflow_key: body.workflow_key || "",
          workflow_provider: body.workflow_provider || "",
          workflow_schedule: body.workflow_schedule || "",
        },
      });
      await writeAuditEvent(membership, "skill.created", "skill", skill.id, {
        name: skill.name,
        status,
      });
      writeJSON(res, 200, { skill });
      return;
    }
    if (req.method === "PUT") {
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      if (!name) throw createHTTPError(400, "name is required");
      const [existing] = await rest("skills", {
        query: {
          limit: "1",
          name: `eq.${name}`,
          select: "*",
          team_id: `eq.${membership.team_id}`,
        },
      });
      if (!existing) throw createHTTPError(404, "skill not found");
      const patch = { updated_at: nowISO() };
      for (const key of [
        "title",
        "description",
        "content",
        "channel",
        "trigger",
        "workflow_provider",
        "workflow_key",
        "workflow_definition",
        "workflow_schedule",
        "risk",
      ]) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags : [];
      if (body.required_permissions !== undefined) {
        patch.required_permissions = permissionRequirementList(body.required_permissions);
      }
      if (body.status !== undefined) {
        const nextStatus = String(body.status || "").trim();
        if (nextStatus === "active" && existing.status !== "active") {
          requirePermission(membership, "skill:approve");
          patch.approved_at = nowISO();
          patch.approved_by = membership.user_id;
        } else if (nextStatus === "rejected") {
          requirePermission(membership, "skill:approve");
          patch.rejected_at = nowISO();
          patch.rejected_by = membership.user_id;
        } else {
          requirePermission(membership, "skill:update");
        }
        patch.status = nextStatus;
      } else {
        requirePermission(membership, "skill:update");
      }
      const [skill] = await rest("skills", {
        method: "PATCH",
        query: { id: `eq.${existing.id}`, team_id: `eq.${membership.team_id}` },
        body: patch,
      });
      await writeAuditEvent(membership, "skill.updated", "skill", skill.id, {
        name: skill.name,
        status: skill.status,
      });
      writeJSON(res, 200, { skill });
      return;
    }
    if (req.method === "DELETE") {
      requirePermission(membership, "skill:archive");
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      if (!name) throw createHTTPError(400, "name is required");
      await rest("skills", {
        method: "PATCH",
        query: { name: `eq.${name}`, team_id: `eq.${membership.team_id}` },
        body: { status: "archived", updated_at: nowISO() },
      });
      await writeAuditEvent(membership, "skill.archived", "skill", name);
      writeJSON(res, 200, { ok: true });
      return;
    }
    throw createHTTPError(405, "method not allowed");
  }

  async function handleSkillInvoke(req, res, name) {
    const { membership } = await requireUser(req);
    requirePermission(membership, "skill:read");
    requirePermission(membership, "skill:invoke");
    const [skill] = await rest("skills", {
      query: {
        limit: "1",
        name: `eq.${name}`,
        select: "*",
        status: "eq.active",
        team_id: `eq.${membership.team_id}`,
      },
    });
    if (!skill) throw createHTTPError(404, "skill not found");
    for (const permission of skillRequiredPermissions(skill)) {
      requirePermission(membership, permission);
    }
    const [updated] = await rest("skills", {
      method: "PATCH",
      query: { id: `eq.${skill.id}` },
      body: {
        last_execution_at: nowISO(),
        last_execution_status: "invoked",
        usage_count: Number(skill.usage_count || 0) + 1,
        updated_at: nowISO(),
      },
    });
    await writeAuditEvent(membership, "skill.invoked", "skill", updated.id, {
      name: updated.name,
    });
    writeJSON(res, 200, { skill: updated });
  }

  return {
    skillInvoke: handleSkillInvoke,
    skills: handleSkills,
  };
}

function skillRequiredPermissions(skill) {
  const out = [];
  const add = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) add(item);
      return;
    }
    const permission = String(value || "").trim();
    if (permission) out.push(permission);
  };
  add(skill?.required_permissions);
  for (const key of ["workflow_definition", "content"]) {
    const raw = skill?.[key];
    if (typeof raw !== "string" || !raw.trim().startsWith("{")) continue;
    try {
      const parsed = JSON.parse(raw);
      add(parsed?.required_permissions);
      add(parsed?.manifest?.required_permissions);
    } catch {
      // Plain-text skills are expected; JSON manifests are optional.
    }
  }
  return [...new Set(out)];
}

function permissionRequirementList(raw) {
  return [
    ...new Set(
      (Array.isArray(raw) ? raw : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ];
}

module.exports = {
  createHostedSkillHandlers,
  permissionRequirementList,
  skillRequiredPermissions,
};
