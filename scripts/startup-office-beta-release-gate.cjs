#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const checks = [
  ["git", ["diff", "--check"]],
  ["npm", ["run", "production:audit"]],
  ["npm", ["run", "startup-office:api-contracts"]],
  ["npm", ["run", "startup-office:architecture"]],
  ["npm", ["run", "startup-office:audit-coverage"]],
  ["npm", ["run", "startup-office:authorization"]],
  ["npm", ["run", "startup-office:pure-cloud-boundary"]],
  ["npm", ["run", "startup-office:permissions"]],
  ["npm", ["run", "startup-office:schema"]],
  ["npm", ["run", "startup-office:security"]],
  ["npm", ["run", "startup-office:surface"]],
  ["npm", ["run", "startup-office:worker-deploy"]],
  ["npm", ["run", "startup-office:loop-worker:test"]],
  ["npm", ["run", "startup-office:ops-monitor:test"]],
  ["npm", ["run", "hosted-env:preflight:test"]],
  ["node", ["--test", "api/lib/hosted/agentLogHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/activityHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/auditHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/authHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/commandHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/conversationHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/inviteHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/memberHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/memoryHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/modelAccess.test.js"]],
  ["node", ["--test", "api/lib/hosted/permissions.test.js"]],
  ["node", ["--test", "api/lib/hosted/rateLimits.test.js"]],
  ["node", ["--test", "api/lib/hosted/requestHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/rosterHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/schedulerHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/serviceRoleAccess.test.js"]],
  ["node", ["--test", "api/lib/hosted/signupHandlers.test.js"]],
  ["node", ["--test", "api/lib/hosted/usageHandlers.test.js"]],
  ["node", ["--test", "api/lib/startup-office/authorization.test.js"]],
  ["node", ["--test", "api/lib/startup-office/dispatcher.test.js"]],
  ["node", ["--test", "api/lib/startup-office/demoSeedHandlers.test.js"]],
  ["node", ["--test", "api/lib/startup-office/profileHandlers.test.js"]],
  ["node", ["--test", "api/lib/startup-office/receiptMemory.test.js"]],
  ["node", ["--test", "api/lib/startup-office/services.test.js"]],
  ["node", ["--test", "api/lib/startup-office/validation.test.js"]],
  ["node", ["--test", "api/lib/startup-office/workspaceConfigHandlers.test.js"]],
  ["node", ["--test", "api/lib/startup-office/queryHandlers.test.js"]],
  ["node", ["--test", "api/lib/startup-office/workflowHandlers.test.js"]],
  ["node", ["--test", "api/lib/startup-office/operationsHandlers.test.js"]],
  ["node", ["--test", "api/lib/startup-office/objectHandlers.test.js"]],
  ["node", ["--test", "workers/startup-office/loopEngine.test.js"]],
  ["node", ["--test", "workers/startup-office/outboxWorker.test.js"]],
  ["node", ["--test", "workers/startup-office/outputEval.test.js"]],
  ["node", ["--test", "api/hosted-api.test.js"]],
  [
    "npm",
    [
      "--prefix",
      "web",
      "run",
      "test",
      "--",
      "src/components/startup-office/StartupOfficeApp.test.tsx",
    ],
  ],
  [
    "npm",
    [
      "--prefix",
      "web",
      "run",
      "test",
      "--",
      "src/components/apps/ReceiptsApp.test.tsx",
    ],
  ],
  ["npm", ["--prefix", "web", "run", "build"]],
];

for (const [command, args] of checks) {
  const label = [command, ...args].join(" ");
  console.log(`\n[startup-office release gate] ${label}`);
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`[startup-office release gate] failed: ${label}`);
    process.exit(result.status || 1);
  }
}

console.log("\n[startup-office release gate] passed");
