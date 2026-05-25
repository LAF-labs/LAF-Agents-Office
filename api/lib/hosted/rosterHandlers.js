function createHostedRosterHandlers(deps) {
  const {
    createHTTPError,
    publicTeam,
    readBody,
    requireUser,
    shortID,
    slugify,
    truncateText,
    writeJSON,
  } = deps;

  async function handleHostedHumans(_req, res) {
    const { membership, user } = await requireUser(_req);
    writeJSON(res, 200, {
      humans: [
        {
          email: user.email || "",
          name: user.user_metadata?.name || user.email || "You",
          slug: "human",
          team_id: membership.team_id,
        },
      ],
    });
  }

  async function handleHostedTeams(req, res) {
    const { team } = await requireUser(req);
    writeJSON(res, 200, { teams: [publicTeam(team)] });
  }

  async function handleHostedOfficeMembers(req, res) {
    const { user } = await requireUser(req);
    if (req.method === "GET") {
      writeJSON(res, 200, { members: hostedOfficeMembers(user) });
      return;
    }
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    const body = await readBody(req);
    const member = hostedOfficeMember({
      built_in: false,
      name: body.name || body.slug || "Agent",
      role: body.role || "",
      slug: body.slug || slugify(body.name || "agent") || `agent-${shortID()}`,
    });
    writeJSON(res, 200, { member });
  }

  async function handleHostedOfficeMemberGenerate(req, res) {
    await requireUser(req);
    const body = await readBody(req);
    const prompt = truncateText(body.prompt || "", 120);
    const slug = slugify(prompt) || `agent-${shortID()}`;
    writeJSON(res, 200, {
      expertise: [],
      name: prompt || "Specialist Agent",
      personality: "",
      role: prompt || "Specialist",
      slug,
    });
  }

  async function handleHostedChannelMembers(req, res) {
    const { user } = await requireUser(req);
    writeJSON(res, 200, { members: hostedOfficeMembers(user) });
  }

  return {
    channelMembers: handleHostedChannelMembers,
    humans: handleHostedHumans,
    officeMemberGenerate: handleHostedOfficeMemberGenerate,
    officeMembers: handleHostedOfficeMembers,
    teams: handleHostedTeams,
  };
}

function hostedOfficeMembers(user) {
  return [
    hostedOfficeMember({
      built_in: true,
      name: user.user_metadata?.name || user.email || "You",
      role: "Human owner",
      slug: "human",
    }),
    hostedOfficeMember({ built_in: true, name: "CEO", role: "Company lead", slug: "ceo" }),
    hostedOfficeMember({ built_in: true, name: "PM", role: "Product manager", slug: "pm" }),
    hostedOfficeMember({ built_in: true, name: "Frontend Engineer", role: "Frontend", slug: "fe" }),
    hostedOfficeMember({ built_in: true, name: "Backend Engineer", role: "Backend", slug: "be" }),
    hostedOfficeMember({ built_in: true, name: "Reviewer", role: "Reviewer", slug: "reviewer" }),
  ];
}

function hostedOfficeMember(member) {
  return {
    activity: "",
    built_in: Boolean(member.built_in),
    detail: "",
    name: String(member.name || member.slug || "Agent"),
    provider: { kind: "claude-code" },
    role: String(member.role || ""),
    slug: String(member.slug || "agent"),
    status: "idle",
  };
}

module.exports = {
  createHostedRosterHandlers,
  hostedOfficeMember,
  hostedOfficeMembers,
};
