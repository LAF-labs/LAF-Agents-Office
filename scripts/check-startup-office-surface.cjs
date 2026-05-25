#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const deviceRuntime = ["bri", "dge"].join("");
const queueRuntime = ["run", "ner"].join("");
const retiredConnectorPattern = new RegExp(`laf\\s+${deviceRuntime}`, "i");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  console.error(`startup-office surface check failed: ${message}`);
  process.exitCode = 1;
}

function assertIncludes(relativePath, needle) {
  const body = read(relativePath);
  if (!body.includes(needle)) {
    fail(`${relativePath} must include ${JSON.stringify(needle)}`);
  }
}

function assertNotIncludes(relativePath, needle) {
  const body = read(relativePath);
  if (body.includes(needle)) {
    fail(`${relativePath} must not include ${JSON.stringify(needle)}`);
  }
}

function assertNotMatchesInSegment(relativePath, startNeedle, endNeedle, checks) {
  const body = read(relativePath);
  const start = body.indexOf(startNeedle);
  const end = endNeedle ? body.indexOf(endNeedle, start) : body.length;
  if (start === -1 || end === -1 || end <= start) {
    fail(`${relativePath} segment ${startNeedle} -> ${endNeedle} not found`);
    return;
  }
  const segment = body.slice(start, end);
  for (const check of checks) {
    if (check.pattern.test(segment)) {
      fail(`${relativePath} ${check.label}`);
    }
  }
}

function assertPathMissing(relativePath) {
  if (fs.existsSync(path.join(root, relativePath))) {
    fail(`${relativePath} must not exist in the pure-cloud product`);
  }
}

function trackedFiles() {
  const out = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .map((relative) => path.join(root, relative));
}

function assertRepoTextAbsent(label, parts) {
  const needle = parts.join("");
  for (const absolute of trackedFiles()) {
    const relative = path.relative(root, absolute);
    if (relative === "scripts/check-startup-office-surface.cjs") {
      continue;
    }
    let body = "";
    try {
      body = fs.readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    if (body.toLowerCase().includes(needle)) {
      fail(`${label} appears in ${relative}`);
    }
  }
}

function assertQuotedStringsNotMatch(relativePath, startNeedle, endNeedle, checks) {
  const body = read(relativePath);
  const start = body.indexOf(startNeedle);
  const end = endNeedle ? body.indexOf(endNeedle, start) : body.length;
  if (start === -1 || end === -1 || end <= start) {
    fail(`${relativePath} segment ${startNeedle} -> ${endNeedle} not found`);
    return;
  }
  const segment = body.slice(start, end);
  const quoted = Array.from(segment.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g))
    .map((match) => match[2])
    .join("\n");
  for (const check of checks) {
    if (check.pattern.test(quoted)) {
      fail(`${relativePath} ${check.label}`);
    }
  }
}

assertIncludes(
  "web/src/hooks/useHashRouter.ts",
  "const DEFAULT_ROUTE: Route = GROWTH_ROUTE;",
);
assertIncludes(
  "web/src/hooks/useHashRouter.ts",
  'if (app === "projects" || app === "tasks") return GROWTH_ROUTE;',
);
assertNotIncludes("web/src/hooks/useHashRouter.ts", "const PROJECTS_ROUTE");
assertNotIncludes("web/src/components/workspace/WorkspaceApp.tsx", "loadTasksApp");
assertNotIncludes("web/src/components/workspace/WorkspaceApp.tsx", "tasks: TasksApp");
assertNotIncludes("web/src/lib/workspacePreload.ts", "loadTasksApp");
assertNotIncludes("web/src/lib/workspacePreload.ts", 'case "tasks"');

assertNotIncludes("web/src/lib/constants.ts", 'id: "tasks"');
assertNotIncludes("web/src/lib/constants.ts", 'name: "Projects"');
assertIncludes(
  "web/src/components/startup-office/startupOfficeCopy.ts",
  "paid beta",
);

assertPathMissing(path.join("internal", "open" + "claw"));
assertPathMissing(path.join("cmd", "laf-office-oc-probe"));
assertRepoTextAbsent("retired external runtime connector", ["open", "claw"]);

assertNotMatchesInSegment(
  "web/src/lib/i18n.ts",
  '"auth.kicker"',
  '"messages.loading"',
  [
    { label: "auth/invite copy mentions project teams", pattern: /project team/i },
    { label: "auth/invite copy mentions project work", pattern: /project work/i },
    { label: "auth/invite copy mentions personal CLI", pattern: /personal cli/i },
    { label: "auth/invite copy mentions GitHub", pattern: /github/i },
    { label: "auth/invite copy mentions legacy local setup", pattern: retiredConnectorPattern },
    { label: "auth/invite copy is connector-first", pattern: /connector/i },
    { label: "auth/invite copy mentions 프로젝트", pattern: /프로젝트/ },
    {
      label: "auth/invite copy overpromises full autonomy",
      pattern: /fully autonomous|runs your company while you sleep/i,
    },
  ],
);

assertNotMatchesInSegment(
  "web/src/lib/i18n.ts",
  '"auth.kicker": "AI Startup Office"',
  '"messages.loading"',
  [
    { label: "Korean auth/invite copy mentions 프로젝트", pattern: /프로젝트/ },
    { label: "Korean auth/invite copy mentions retired local device", pattern: new RegExp(deviceRuntime, "i") },
    {
      label: "Korean auth/invite copy overpromises full autonomy",
      pattern: /완전\s*자율|자는 동안.*회사/i,
    },
  ],
);

assertQuotedStringsNotMatch(
  "web/src/components/onboarding/Wizard.tsx",
  "const WIZARD_COPY",
  "/* ═══════════════════════════════════════════",
  [
    { label: "onboarding visible copy mentions project team", pattern: /project team/i },
    { label: "onboarding visible copy mentions GitHub", pattern: /github/i },
    { label: "onboarding visible copy mentions retired local device", pattern: new RegExp(deviceRuntime, "i") },
    { label: "onboarding visible copy mentions retired local queue", pattern: new RegExp(`local ${queueRuntime}`, "i") },
    { label: "onboarding visible copy is connector-first", pattern: /connector/i },
    { label: "onboarding visible copy mentions integrations", pattern: /integration/i },
    { label: "onboarding visible copy mentions 프로젝트", pattern: /프로젝트/ },
    {
      label: "onboarding visible copy overpromises full autonomy",
      pattern: /fully autonomous|runs your company while you sleep/i,
    },
  ],
);

assertNotMatchesInSegment(
  "web/src/lib/i18n.ts",
  '"settings.danger.title"',
  '"sidebar.collapse"',
  [
    { label: "danger zone copy mentions local runtime", pattern: /local runtime/i },
    { label: "danger zone copy mentions Korean local runtime", pattern: /로컬\s*런타임/ },
    { label: "danger zone copy mentions retired local queue", pattern: new RegExp(`local ${queueRuntime}`, "i") },
    { label: "danger zone copy mentions Korean local executor", pattern: /로컬\s*실행기/ },
    { label: "danger zone copy mentions local workspace path", pattern: /~\/\.laf-office/ },
  ],
);

assertQuotedStringsNotMatch(
  "web/src/components/startup-office/startupOfficeCopy.ts",
  "export const STARTUP_OFFICE_WEDGE_COPY",
  "export type StartupOfficeCopyLanguage",
  [
    { label: "Startup Office wedge copy mentions legacy local setup", pattern: retiredConnectorPattern },
    { label: "Startup Office wedge copy mentions project/task model", pattern: /project\/task/i },
    { label: "Startup Office wedge copy mentions GitHub", pattern: /github/i },
    { label: "Startup Office wedge copy is connector-first", pattern: /connector/i },
    { label: "Startup Office wedge copy mentions integrations", pattern: /integration/i },
    {
      label: "Startup Office wedge copy overpromises full autonomy",
      pattern: /fully autonomous|runs your company while you sleep/i,
    },
  ],
);

assertNotMatchesInSegment(
  "web/src/components/apps/SkillsApp.tsx",
  "const SKILLS_COPY",
  "function useSkillsCopy",
  [
    { label: "Startup Office copy mentions legacy local setup", pattern: retiredConnectorPattern },
    { label: "Startup Office copy mentions Projects", pattern: /projects/i },
    { label: "Startup Office copy mentions Tasks", pattern: /tasks/i },
    { label: "Startup Office copy mentions GitHub", pattern: /github/i },
  ],
);

if (!process.exitCode) {
  console.log("startup-office surface check passed");
}
