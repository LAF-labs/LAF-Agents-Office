function createHostedConversationHandlers(deps) {
  const {
    clamp,
    createHTTPError,
    isHuman,
    normalizeModelMode,
    nowISO,
    objectValue,
    readBody,
    requireUser,
    rest,
    rpc,
    shortID,
    slugify,
    truncateText,
    writeJSON,
  } = deps;

  async function handleHostedChannels(req, res) {
    await requireUser(req);
    if (req.method === "GET") {
      writeJSON(res, 200, {
        channels: [hostedChannel("general", "General", "Workspace home")],
      });
      return;
    }
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    const body = await readBody(req);
    const slug = slugify(body.slug || body.name || "channel") || `channel-${shortID()}`;
    writeJSON(res, 200, hostedChannel(slug, body.name || slug, body.description || ""));
  }

  async function handleHostedChannelGenerate(req, res) {
    await requireUser(req);
    const body = await readBody(req);
    const name = truncateText(body.prompt || "Generated channel", 80);
    const slug = slugify(name) || `channel-${shortID()}`;
    writeJSON(res, 200, hostedChannel(slug, name, ""));
  }

  async function handleHostedDMChannel(req, res) {
    await requireUser(req);
    const body = await readBody(req);
    const members = Array.isArray(body.members) ? body.members.map((item) => String(item || "")) : [];
    const agent = members.find((member) => !["human", "you"].includes(member)) || "agent";
    writeJSON(res, 200, {
      ...hostedChannel(`dm-${slugify(agent) || "agent"}`, `@${agent}`, ""),
      created: false,
      members,
      type: "direct",
    });
  }

  async function handleHostedMessages(req, res) {
    const { membership } = await requireUser(req);
    if (req.method === "GET") {
      writeJSON(res, 200, await listHostedChannelMessages(membership, req.query || {}));
      return;
    }
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    const body = await readBody(req);
    const message = await createHostedChannelMessage(membership, body);
    writeJSON(res, 200, message);
  }

  async function handleHostedMessageReaction(req, res) {
    const { membership } = await requireUser(req);
    const body = await readBody(req);
    const messageID = String(body.message_id || body.id || "").trim();
    const emoji = String(body.emoji || "").trim();
    const channel = String(body.channel || "general").trim() || "general";
    if (!messageID) throw createHTTPError(400, "message_id is required");
    if (!isUUID(messageID)) throw createHTTPError(400, "message_id must be a uuid");
    if (!isSafeEmojiToken(emoji)) throw createHTTPError(400, "emoji is required");

    const rows = await rpc("toggle_channel_message_reaction", {
      p_channel: channel,
      p_emoji: emoji,
      p_message_id: messageID,
      p_team_id: membership.team_id,
      p_user_id: membership.user_id,
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || row.deleted_at) throw createHTTPError(404, "message not found");
    const userID = String(membership.user_id || "user").trim() || "user";
    const reactions = normalizeReactionMap(row.reactions);
    const active = (reactions[emoji] || []).includes(userID);
    writeJSON(res, 200, {
      message: publicChannelMessage(row),
      ok: true,
      reaction: {
        active,
        count: (reactions[emoji] || []).length,
        emoji,
      },
    });
  }

  async function handleHostedHomeSessions(req, res) {
    const { membership } = await requireUser(req);
    if (req.method === "GET") {
      writeJSON(res, 200, await listHostedHomeSessions(membership, req.query || {}));
      return;
    }
    if (req.method === "DELETE") {
      const threadID = String(req.query?.thread_id || "").trim();
      if (!threadID) throw createHTTPError(400, "thread_id is required");
      const now = nowISO();
      const rows = await rest("channel_messages", {
        method: "PATCH",
        query: {
          home_session_thread_id: `eq.${threadID}`,
          team_id: `eq.${membership.team_id}`,
        },
        body: { deleted_at: now, updated_at: now },
      }).catch((err) => {
        if (isMissingChannelMessagesError(err)) return [];
        throw err;
      });
      writeJSON(res, 200, { deleted: (rows || []).length > 0, ok: true });
      return;
    }
    throw createHTTPError(405, "method not allowed");
  }

  async function listHostedChannelMessages(membership, query = {}) {
    const channel = String(query.channel || "general").trim() || "general";
    const limit = clamp(Number(query.limit) || 100, 1, 500);
    const threadID = String(query.thread_id || "").trim();
    const sinceID = String(query.since_id || "").trim();
    const rows = await rest("channel_messages", {
      query: {
        channel: `eq.${channel}`,
        order: "created_at.asc",
        select: "*",
        team_id: `eq.${membership.team_id}`,
        limit: String(threadID ? 500 : limit),
      },
    }).catch((err) => {
      if (isMissingChannelMessagesError(err)) return [];
      throw err;
    });
    let messages = (rows || []).filter((row) => !row.deleted_at);
    if (threadID) {
      messages = messages.filter((row) => hostedMessageBelongsToThread(row, threadID));
    }
    if (sinceID) {
      const index = messages.findIndex((row) => String(row.id || "") === sinceID);
      if (index >= 0) messages = messages.slice(index + 1);
    }
    if (messages.length > limit) messages = messages.slice(-limit);
    return { messages: messages.map(publicChannelMessage) };
  }

  async function listHostedHomeSessions(membership, query = {}) {
    const baseThreadID = String(query.base_thread_id || "").trim();
    if (!baseThreadID) return { sessions: [] };
    const rows = await rest("channel_messages", {
      query: {
        channel: "eq.general",
        limit: "500",
        order: "created_at.asc",
        select: "*",
        team_id: `eq.${membership.team_id}`,
      },
    }).catch((err) => {
      if (isMissingChannelMessagesError(err)) return [];
      throw err;
    });
    const sessions = new Map();
    for (const row of rows || []) {
      if (row.deleted_at) continue;
      const threadID = String(row.home_session_thread_id || row.thread_id || "").trim();
      if (!threadID || !(threadID === baseThreadID || threadID.startsWith(`${baseThreadID}:`))) {
        continue;
      }
      const current = sessions.get(threadID) || {
        created_at: row.created_at || nowISO(),
        id: threadID,
        message_count: 0,
        thread_id: threadID,
        title: "",
        updated_at: row.created_at || nowISO(),
      };
      current.message_count += 1;
      current.updated_at = row.created_at || current.updated_at;
      if (!current.title && isHuman(row.sender_slug)) {
        current.title = sessionTitleFromContent(row.content);
      }
      sessions.set(threadID, current);
    }
    return {
      sessions: [...sessions.values()]
        .map((session) => ({
          ...session,
          title: session.title || "새 대화",
        }))
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .slice(0, 30),
    };
  }

  async function createHostedChannelMessage(membership, body = {}) {
    const now = nowISO();
    const content = String(body.content || "").trim();
    if (!content) throw createHTTPError(400, "content is required");
    const channel = String(body.channel || "general").trim() || "general";
    const homeSessionThreadID = String(body.home_session_thread_id || "").trim();
    const threadID = String(body.thread_id || homeSessionThreadID || body.reply_to || "").trim();
    const [row] = await rest("channel_messages", {
      method: "POST",
      body: {
        audience: normalizeStringList(body.audience || []),
        channel,
        content,
        created_at: now,
        home_session_thread_id: homeSessionThreadID || null,
        kind: String(body.kind || "message").trim() || "message",
        metadata: objectValue(body.metadata),
        model_mode: normalizeModelMode(body.model_mode),
        project_id: body.project_id ? String(body.project_id) : null,
        public_reply_to: body.public_reply_to ? String(body.public_reply_to) : null,
        reply_to: body.reply_to ? String(body.reply_to) : null,
        run_id: body.run_id ? String(body.run_id) : null,
        scope: body.scope ? String(body.scope) : null,
        sender_slug: String(body.from || body.sender_slug || "you").trim() || "you",
        tagged: normalizeStringList(body.tagged || []),
        task_id: body.task_id ? String(body.task_id) : null,
        team_id: membership.team_id,
        thread_id: threadID || null,
        updated_at: now,
        visibility: body.visibility ? String(body.visibility) : null,
      },
    });
    return publicChannelMessage(row);
  }

  function publicChannelMessage(row = {}) {
    const threadID = row.thread_id || row.home_session_thread_id || row.reply_to || "";
    return {
      audience: normalizeStringList(row.audience || []),
      channel: row.channel || "general",
      content: row.content || "",
      from: row.sender_slug || row.from || "system",
      home_session_thread_id: row.home_session_thread_id || "",
      id: row.id || `msg-${shortID()}`,
      kind: row.kind || "message",
      model_mode: row.model_mode || "record_only",
      project_id: row.project_id || "",
      public_reply_to: row.public_reply_to || row.reply_to || "",
      reactions: normalizeReactionMap(row.reactions),
      reply_to: row.reply_to || "",
      run_id: row.run_id || "",
      scope: row.scope || "",
      tagged: normalizeStringList(row.tagged || []),
      task_id: row.task_id || "",
      team_id: row.team_id || "",
      thread_id: threadID,
      timestamp: row.created_at || row.timestamp || nowISO(),
      visibility: row.visibility || "",
    };
  }

  function sessionTitleFromContent(content) {
    return truncateText(String(content || "").replace(/^@\S+\s*/, ""), 48) || "새 대화";
  }

  return {
    channelGenerate: handleHostedChannelGenerate,
    channels: handleHostedChannels,
    dmChannel: handleHostedDMChannel,
    homeSessions: handleHostedHomeSessions,
    messageReaction: handleHostedMessageReaction,
    messages: handleHostedMessages,
  };
}

function hostedChannel(slug, name, description) {
  return {
    created_by: "system",
    description: String(description || ""),
    members: ["human", "ceo", "pm", "fe", "be", "reviewer"],
    name: String(name || slug),
    slug: String(slug || "general"),
    type: "public",
  };
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function hostedMessageBelongsToThread(row, threadID) {
  return [
    row.thread_id,
    row.home_session_thread_id,
    row.reply_to,
    row.public_reply_to,
  ].some((value) => String(value || "").trim() === threadID);
}

function normalizeReactionMap(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  for (const [emoji, users] of Object.entries(raw)) {
    const key = String(emoji || "").trim();
    if (!isSafeEmojiToken(key)) continue;
    const list = Array.isArray(users)
      ? users.map((user) => String(user || "").trim()).filter(Boolean)
      : [];
    if (list.length) out[key] = [...new Set(list)].sort();
  }
  return out;
}

function isSafeEmojiToken(value) {
  const token = String(value || "").trim();
  return token.length > 0 && token.length <= 32 && !/[\s<>]/.test(token);
}

function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function isMissingChannelMessagesError(err) {
  return (
    err?.status === 404 &&
    String(err.message || "").includes("channel_messages")
  );
}

module.exports = {
  createHostedConversationHandlers,
};
