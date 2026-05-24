#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

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

assertNotIncludes("web/src/lib/constants.ts", 'id: "tasks"');
assertNotIncludes("web/src/lib/constants.ts", 'name: "Projects"');
assertIncludes(
  "web/src/components/startup-office/startupOfficeCopy.ts",
  "paid beta",
);

assertNotMatchesInSegment(
  "web/src/lib/i18n.ts",
  '"auth.kicker"',
  '"messages.loading"',
  [
    { label: "auth/invite copy mentions project teams", pattern: /project team/i },
    { label: "auth/invite copy mentions project work", pattern: /project work/i },
    { label: "auth/invite copy mentions personal CLI", pattern: /personal cli/i },
    { label: "auth/invite copy mentions GitHub", pattern: /github/i },
    { label: "auth/invite copy mentions LAF Bridge", pattern: /laf bridge/i },
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
    { label: "Korean auth/invite copy mentions Bridge", pattern: /Bridge/ },
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
    { label: "onboarding visible copy mentions Bridge", pattern: /bridge/i },
    { label: "onboarding visible copy mentions local runner", pattern: /local runner/i },
    { label: "onboarding visible copy is connector-first", pattern: /connector/i },
    { label: "onboarding visible copy mentions integrations", pattern: /integration/i },
    { label: "onboarding visible copy mentions 프로젝트", pattern: /프로젝트/ },
    {
      label: "onboarding visible copy overpromises full autonomy",
      pattern: /fully autonomous|runs your company while you sleep/i,
    },
  ],
);

assertQuotedStringsNotMatch(
  "web/src/components/startup-office/startupOfficeCopy.ts",
  "export const STARTUP_OFFICE_WEDGE_COPY",
  "export type StartupOfficeCopyLanguage",
  [
    { label: "Startup Office wedge copy mentions LAF Bridge", pattern: /laf bridge/i },
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
    { label: "Startup Office copy mentions LAF Bridge", pattern: /laf bridge/i },
    { label: "Startup Office copy mentions Projects", pattern: /projects/i },
    { label: "Startup Office copy mentions Tasks", pattern: /tasks/i },
    { label: "Startup Office copy mentions GitHub", pattern: /github/i },
  ],
);

if (!process.exitCode) {
  console.log("startup-office surface check passed");
}
