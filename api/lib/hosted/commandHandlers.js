const HOSTED_WEB_COMMANDS = Object.freeze([
  { name: "1o1", description: "Open a direct conversation with an agent", webSupported: true },
  { name: "ask", description: "Ask the team lead", webSupported: true },
  { name: "approvals", description: "Review founder approval queue", webSupported: true },
  { name: "clear", description: "Clear messages in this view", webSupported: true },
  { name: "growth", description: "Open Startup Office", webSupported: true },
  { name: "help", description: "Show commands and keys", webSupported: true },
  { name: "loops", description: "Open operating loops", webSupported: true },
  { name: "remember", description: "Store a fact in memory", webSupported: true },
  { name: "receipts", description: "Open run receipts", webSupported: true },
  { name: "requests", description: "Open requests", webSupported: true },
  { name: "search", description: "Search messages and knowledge", webSupported: true },
  { name: "skills", description: "Open skills", webSupported: true },
  { name: "threads", description: "See every active thread", webSupported: true },
]);
const HOSTED_WEB_COMMAND_NAMES = new Set(
  HOSTED_WEB_COMMANDS.map((command) => command.name),
);

function createHostedCommandHandlers(deps) {
  const {
    createHTTPError,
    readBody,
    requireUser,
    writeJSON,
  } = deps;

  function handleHostedCommands(_req, res) {
    writeJSON(res, 200, HOSTED_WEB_COMMANDS);
  }

  async function handleHostedCommandRun(req, res) {
    await requireUser(req);
    const body = await readBody(req);
    const commandName = hostedSlashCommandName(body.input);
    if (!commandName) {
      throw createHTTPError(400, "slash command input is required");
    }
    if (HOSTED_WEB_COMMAND_NAMES.has(commandName)) {
      throw createHTTPError(400, "slash command is handled directly in the web workspace");
    }
    throw createHTTPError(400, "slash command is not available in the hosted workspace");
  }

  return {
    commands: handleHostedCommands,
    commandRun: handleHostedCommandRun,
  };
}

function hostedSlashCommandName(input) {
  const firstToken = String(input || "").trim().split(/\s+/)[0] || "";
  if (!firstToken.startsWith("/")) return "";
  return firstToken.slice(1).toLowerCase();
}

module.exports = {
  HOSTED_WEB_COMMANDS,
  createHostedCommandHandlers,
  hostedSlashCommandName,
};
