function createHostedMemberHandlers(deps) {
  const {
    WORKSPACE_PERMISSIONS,
    WORKSPACE_ROLES,
    authAdminFetch,
    createHTTPError,
    effectivePermissions,
    normalizePermissionOverride,
    normalizeRole,
    nowISO,
    publicUser,
    readBody,
    requirePermission,
    requireUser,
    rest,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function strictAdminUserByID(userID) {
    if (!userID) return null;
    return await authAdminFetch(`admin/users/${encodeURIComponent(userID)}`);
  }

  async function adminUserByID(userID) {
    if (!userID) return null;
    try {
      const user = await strictAdminUserByID(userID);
      return user && typeof user === "object" ? user : null;
    } catch {
      return null;
    }
  }

  async function adminUsersByIDs(userIDs) {
    const unique = Array.from(new Set((userIDs || []).filter(Boolean)));
    if (unique.length === 0) return {};
    const concurrency = 16;
    const result = {};
    for (let i = 0; i < unique.length; i += concurrency) {
      const slice = unique.slice(i, i + concurrency);
      const users = await Promise.all(slice.map(adminUserByID));
      for (let j = 0; j < slice.length; j += 1) {
        const user = users[j];
        if (user && user.id) result[user.id] = user;
      }
    }
    return result;
  }

  async function listTeamAuthUsers(teamID) {
    const memberships = await rest("memberships", {
      query: {
        order: "created_at.asc",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    });
    const usersByID = await adminUsersByIDs(memberships.map((row) => row.user_id));
    return memberships.map((row) => {
      const user = usersByID[row.user_id] || {
        id: row.user_id,
        email: row.user_id,
        user_metadata: {},
      };
      return publicUser(user, row);
    });
  }

  async function handleAuthUsers(req, res) {
    const { membership } = await requireUser(req);
    if (req.method === "GET") {
      writeJSON(res, 200, {
        users: await listTeamAuthUsers(membership.team_id),
      });
      return;
    }
    if (req.method !== "PATCH") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "member:manage_roles");
    const body = await readBody(req);
    const targetUserID = String(body.user_id || "").trim();
    if (!targetUserID) throw createHTTPError(400, "user_id is required");
    const nextRole = normalizeRole(body.role);
    if (targetUserID === membership.user_id && nextRole !== normalizeRole(membership.role)) {
      throw createHTTPError(403, "cannot change your own role");
    }
    const [target] = await rest("memberships", {
      query: {
        limit: "1",
        select: "*",
        team_id: `eq.${membership.team_id}`,
        user_id: `eq.${targetUserID}`,
      },
    });
    if (!target) throw createHTTPError(404, "member not found");
    if (normalizeRole(target.role) === "owner" && nextRole !== "owner") {
      const owners = await rest("memberships", {
        query: {
          role: "eq.owner",
          select: "id",
          status: "eq.active",
          team_id: `eq.${membership.team_id}`,
        },
      });
      if ((owners || []).length <= 1) {
        throw createHTTPError(409, "cannot remove the last owner");
      }
    }
    const [updated] = await rest("memberships", {
      method: "PATCH",
      query: {
        team_id: `eq.${membership.team_id}`,
        user_id: `eq.${targetUserID}`,
      },
      body: { role: nextRole, updated_at: nowISO() },
    });
    await writeAuditEvent(membership, "member.role_updated", "user", targetUserID, {
      role: nextRole,
    });
    const users = await listTeamAuthUsers(membership.team_id);
    const user = users.find((candidate) => candidate.id === updated.user_id) || null;
    writeJSON(res, 200, { user, users });
  }

  async function handlePermissions(req, res) {
    const { membership } = await requireUser(req);
    if (req.method === "GET") {
      const memberships = await rest("memberships", {
        query: {
          order: "created_at.asc",
          select: "*",
          team_id: `eq.${membership.team_id}`,
        },
      });
      const usersByID = await adminUsersByIDs(memberships.map((row) => row.user_id));
      writeJSON(res, 200, {
        roles: WORKSPACE_ROLES,
        permissions: [...WORKSPACE_PERMISSIONS].sort(),
        members: memberships.map((row) => {
          const user = usersByID[row.user_id] || {};
          return {
            user_id: row.user_id,
            email: user.email || row.user_id,
            name: user.user_metadata?.name || user.email || row.user_id,
            role: normalizeRole(row.role),
            status: row.status || "active",
            overrides: normalizePermissionOverride(row.permissions),
            effective_permissions: effectivePermissions(row),
          };
        }),
      });
      return;
    }
    if (req.method !== "PATCH") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "member:manage_permissions");
    const body = await readBody(req);
    const targetUserID = String(body.user_id || "").trim();
    if (!targetUserID) throw createHTTPError(400, "user_id is required");
    const isSelf = targetUserID === membership.user_id;
    if (isSelf && body.role !== undefined && normalizeRole(body.role) !== normalizeRole(membership.role)) {
      throw createHTTPError(403, "cannot change your own role");
    }
    if (isSelf && body.permissions !== undefined) {
      throw createHTTPError(403, "cannot change your own permissions");
    }
    const [target] = await rest("memberships", {
      query: {
        limit: "1",
        select: "*",
        team_id: `eq.${membership.team_id}`,
        user_id: `eq.${targetUserID}`,
      },
    });
    if (!target) throw createHTTPError(404, "member not found");
    const patch = { updated_at: nowISO() };
    if (body.role !== undefined) {
      patch.role = normalizeRole(body.role);
      if (normalizeRole(target.role) === "owner" && patch.role !== "owner") {
        const owners = await rest("memberships", {
          query: {
            role: "eq.owner",
            select: "id",
            status: "eq.active",
            team_id: `eq.${membership.team_id}`,
          },
        });
        if ((owners || []).length <= 1) {
          throw createHTTPError(409, "cannot remove the last owner");
        }
      }
    }
    if (body.permissions !== undefined) {
      patch.permissions = normalizePermissionOverride(body.permissions);
    }
    const [updated] = await rest("memberships", {
      method: "PATCH",
      query: {
        team_id: `eq.${membership.team_id}`,
        user_id: `eq.${targetUserID}`,
      },
      body: patch,
    });
    await writeAuditEvent(membership, "permissions.updated", "user", targetUserID, {
      role: updated.role,
    });
    writeJSON(res, 200, {
      member: {
        user_id: updated.user_id,
        role: normalizeRole(updated.role),
        status: updated.status,
        overrides: normalizePermissionOverride(updated.permissions),
        effective_permissions: effectivePermissions(updated),
      },
    });
  }

  return {
    authUsers: handleAuthUsers,
    listTeamAuthUsers,
    permissions: handlePermissions,
  };
}

module.exports = {
  createHostedMemberHandlers,
};
