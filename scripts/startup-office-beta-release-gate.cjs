#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const checks = [
  ["git", ["diff", "--check"]],
  ["npm", ["run", "production:audit"]],
  ["npm", ["run", "startup-office:architecture"]],
  ["npm", ["run", "startup-office:surface"]],
  ["node", ["--test", "api/lib/startup-office/dispatcher.test.js"]],
  ["node", ["--test", "api/lib/startup-office/queryHandlers.test.js"]],
  ["node", ["--test", "api/lib/startup-office/operationsHandlers.test.js"]],
  ["node", ["--test", "api/lib/startup-office/objectHandlers.test.js"]],
  ["node", ["--test", "workers/startup-office/loopEngine.test.js"]],
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
