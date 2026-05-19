"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const test = require("node:test");

const packageRoot = __dirname;
const binPath = path.join(packageRoot, "bin", "laf-bridge.js");
const {
  archiveName,
  binaryName,
  downloadBinary,
  expectedHashFor,
  findExtractedBinary,
  releaseAssetUrl,
  sha256OfFile,
} = require("./scripts/download-binary");
const { isIntegrityFailureMessage } = require("./scripts/postinstall");
const {
  validatePackage,
  validatePackageFiles,
} = require("./scripts/prepublish-check");

test("laf-bridge package downloads the shared release archive containing the bridge binary", () => {
  assert.equal(
    archiveName("1.2.3", { os: "linux", arch: "amd64" }),
    "laf-office_1.2.3_linux_amd64.tar.gz",
  );
  assert.equal(
    archiveName("1.2.3", { os: "darwin", arch: "arm64" }),
    "laf-office_1.2.3_darwin_arm64.tar.gz",
  );
  assert.equal(
    archiveName("1.2.3", { os: "windows", arch: "amd64" }),
    "laf-office_1.2.3_windows_amd64.tar.gz",
  );
  assert.equal(binaryName({ os: "darwin" }), "laf-bridge");
  assert.equal(binaryName({ os: "windows" }), "laf-bridge.exe");
  assert.equal(
    releaseAssetUrl("1.2.3", "laf-office_1.2.3_linux_amd64.tar.gz"),
    "https://github.com/LAF-labs/LAF-Agents-Office/releases/download/v1.2.3/laf-office_1.2.3_linux_amd64.tar.gz",
  );
});

test("laf-bridge package is installable through npx on Windows too", async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
  assert.deepEqual(pkg.os.sort(), ["darwin", "linux", "win32"]);
  assert.deepEqual(pkg.publishConfig, { access: "public" });
});

test("laf-bridge published package contains only the Bridge npx surface", () => {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [pack] = JSON.parse(output);
  const files = pack.files.map((file) => file.path).sort();

  assert.deepEqual(files, [
    "README.md",
    "bin/laf-bridge.js",
    "package.json",
    "scripts/download-binary.js",
    "scripts/postinstall.js",
    "scripts/prepublish-check.js",
  ]);
  const legacyCommandName = ["laf", "runner"].join("-");
  assert.equal(files.some((file) => file.includes(legacyCommandName)), false);
  assert.equal(files.includes("laf-bridge-package.test.cjs"), false);
});

test("laf-bridge prepublish guard requires release-injected SemVer", async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
  const currentFailures = validatePackage(pkg);
  if (pkg.version === "0.0.0") {
    assert.match(currentFailures.join("\n"), /release placeholder 0\.0\.0/);
  } else {
    assert.deepEqual(currentFailures, []);
  }
  assert.match(
    validatePackage({ ...pkg, version: "0.0.0" }).join("\n"),
    /release placeholder 0\.0\.0/,
  );
  assert.deepEqual(validatePackage({ ...pkg, version: "1.2.3" }), []);
  assert.deepEqual(validatePackage({ ...pkg, version: "1.2.3-beta.1" }), []);
  assert.match(
    validatePackage({ ...pkg, version: "1.2.3+build.1" }).join("\n"),
    /without build metadata/,
  );
  for (const version of [
    "01.2.3",
    "1.02.3",
    "1.2.03",
    "1.2.3-",
    "1.2.3-alpha..1",
    "1.2.3-01",
  ]) {
    assert.match(
      validatePackage({ ...pkg, version }).join("\n"),
      /npm-compatible SemVer/,
      `${version} should be rejected`,
    );
  }
  assert.match(
    validatePackage({ ...pkg, version: "0.0.7.1" }).join("\n"),
    /npm-compatible SemVer/,
  );
});

test("laf-bridge prepublish guard rejects legacy or internal public package copy", async (t) => {
  assert.deepEqual(validatePackageFiles(packageRoot), []);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-prepublish-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const relPath of [
    "bin/laf-bridge.js",
    "scripts/download-binary.js",
    "scripts/prepublish-check.js",
    "scripts/postinstall.js",
    "README.md",
    "package.json",
  ]) {
    await fs.mkdir(path.join(dir, path.dirname(relPath)), { recursive: true });
    await fs.writeFile(path.join(dir, relPath), "public package file\n");
  }

  const legacyCommandName = ["laf", "runner"].join("-");
  const publicPairCommand = "npx laf-bridge pair";
  const apiURLFlag = "--api-url";
  const codeFlag = "--code";
  const deviceLabelFlag = "--device-label";
  const startCommand = ["laf-bridge", "start"].join(" ");

  await fs.writeFile(
    path.join(dir, "README.md"),
    `Run ${publicPairCommand}, never ${legacyCommandName} pair.\n`,
  );
  assert.match(
    validatePackageFiles(dir).join("\n"),
    /README\.md exposes legacy local execution command/,
  );

  await fs.writeFile(
    path.join(dir, "README.md"),
    `Run ${[publicPairCommand, apiURLFlag, "https://office.example/api", codeFlag, "TEST"].join(" ")}.\n`,
  );
  assert.match(
    validatePackageFiles(dir).join("\n"),
    /README\.md exposes flagged Bridge pair command/,
  );

  await fs.writeFile(
    path.join(dir, "README.md"),
    `Run ${[publicPairCommand, deviceLabelFlag, "Office Mac"].join(" ")}.\n`,
  );
  assert.match(
    validatePackageFiles(dir).join("\n"),
    /README\.md exposes flagged Bridge pair command/,
  );

  await fs.writeFile(path.join(dir, "README.md"), `Run ${startCommand}.\n`);
  assert.match(
    validatePackageFiles(dir).join("\n"),
    /README\.md exposes separate Bridge start command/,
  );

  await fs.writeFile(path.join(dir, "README.md"), "public package file\n");
  await fs.writeFile(
    path.join(dir, "README.md"),
    "Run laf-bridge status after pairing.\n",
  );
  assert.match(
    validatePackageFiles(dir).join("\n"),
    /README\.md exposes internal Bridge command/,
  );

  await fs.writeFile(path.join(dir, "README.md"), "public package file\n");
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({
      description: `Do not publish ${legacyCommandName} metadata`,
      keywords: [legacyCommandName],
    }),
  );
  assert.match(
    validatePackageFiles(dir).join("\n"),
    /package\.json exposes legacy local execution command/,
  );
});

test("laf-bridge downloader extracts the Windows bridge executable", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-windows-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const sourceDir = path.join(dir, "source");
  await fs.mkdir(sourceDir);
  await fs.writeFile(path.join(sourceDir, "laf-bridge.exe"), "fake windows bridge");
  const archiveBasename = archiveName("1.2.3", { os: "windows", arch: "amd64" });
  const archivePath = path.join(dir, archiveBasename);
  execFileSync("tar", ["-czf", archivePath, "-C", sourceDir, "laf-bridge.exe"]);
  const archive = await fs.readFile(archivePath);
  const checksum = crypto.createHash("sha256").update(archive).digest("hex");

  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = async (url) => {
    const href = String(url);
    if (href.endsWith("/checksums.txt")) {
      return {
        ok: true,
        text: async () => `${checksum}  ${archiveBasename}\n`,
      };
    }
    if (href.endsWith(`/${archiveBasename}`)) {
      return {
        arrayBuffer: async () =>
          archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength),
        ok: true,
      };
    }
    return { ok: false, status: 404, statusText: "Not Found" };
  };

  const targetPath = path.join(dir, "installed", "laf-bridge.exe");
  const installed = await downloadBinary({
    silent: true,
    target: { os: "windows", arch: "amd64" },
    targetPath,
    version: "1.2.3",
  });

  assert.equal(installed, targetPath);
  assert.equal(await fs.readFile(targetPath, "utf8"), "fake windows bridge");
});

test("laf-bridge downloader finds Bridge binary inside nested release archives", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-nested-archive-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const sourceDir = path.join(dir, "source");
  const nestedDir = path.join(sourceDir, "laf-office_1.2.3_linux_amd64");
  await fs.mkdir(nestedDir, { recursive: true });
  await fs.writeFile(path.join(nestedDir, "laf-bridge"), "fake nested bridge");
  await fs.writeFile(path.join(nestedDir, "README.md"), "release notes");
  const archiveBasename = archiveName("1.2.3", { os: "linux", arch: "amd64" });
  const archivePath = path.join(dir, archiveBasename);
  execFileSync("tar", ["-czf", archivePath, "-C", sourceDir, "laf-office_1.2.3_linux_amd64"]);
  const archive = await fs.readFile(archivePath);
  const checksum = crypto.createHash("sha256").update(archive).digest("hex");

  assert.equal(
    await findExtractedBinary(sourceDir, "laf-bridge"),
    path.join(nestedDir, "laf-bridge"),
  );

  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = async (url) => {
    const href = String(url);
    if (href.endsWith("/checksums.txt")) {
      return {
        ok: true,
        text: async () => `${checksum}  ${archiveBasename}\n`,
      };
    }
    if (href.endsWith(`/${archiveBasename}`)) {
      return {
        arrayBuffer: async () =>
          archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength),
        ok: true,
      };
    }
    return { ok: false, status: 404, statusText: "Not Found" };
  };

  const targetPath = path.join(dir, "installed", "laf-bridge");
  const installed = await downloadBinary({
    silent: true,
    target: { os: "linux", arch: "amd64" },
    targetPath,
    version: "1.2.3",
  });

  assert.equal(installed, targetPath);
  assert.equal(await fs.readFile(targetPath, "utf8"), "fake nested bridge");
});

test("laf-bridge downloader refuses empty Bridge binaries in release archives", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-empty-binary-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const sourceDir = path.join(dir, "source");
  await fs.mkdir(sourceDir);
  await fs.writeFile(path.join(sourceDir, "laf-bridge"), "");
  const archiveBasename = archiveName("1.2.3", { os: "linux", arch: "amd64" });
  const archivePath = path.join(dir, archiveBasename);
  execFileSync("tar", ["-czf", archivePath, "-C", sourceDir, "laf-bridge"]);
  const archive = await fs.readFile(archivePath);
  const checksum = crypto.createHash("sha256").update(archive).digest("hex");

  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = async (url) => {
    const href = String(url);
    if (href.endsWith("/checksums.txt")) {
      return {
        ok: true,
        text: async () => `${checksum}  ${archiveBasename}\n`,
      };
    }
    if (href.endsWith(`/${archiveBasename}`)) {
      return {
        arrayBuffer: async () =>
          archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength),
        ok: true,
      };
    }
    return { ok: false, status: 404, statusText: "Not Found" };
  };

  const targetPath = path.join(dir, "installed", "laf-bridge");
  await assert.rejects(
    downloadBinary({
      silent: true,
      target: { os: "linux", arch: "amd64" },
      targetPath,
      version: "1.2.3",
    }),
    /empty laf-bridge/,
  );
  await assert.rejects(fs.readFile(targetPath, "utf8"), { code: "ENOENT" });
});

test("laf-bridge postinstall refuses to soft-fail archive integrity failures", () => {
  assert.equal(
    isIntegrityFailureMessage("SHA256 mismatch for laf-office_1.2.3_linux_amd64.tar.gz"),
    true,
  );
  assert.equal(
    isIntegrityFailureMessage("Cannot verify download integrity: checksums.txt was missing"),
    true,
  );
  assert.equal(
    isIntegrityFailureMessage("Downloaded archive did not contain laf-bridge."),
    true,
  );
  assert.equal(
    isIntegrityFailureMessage("Downloaded archive contained an empty laf-bridge."),
    true,
  );
  assert.equal(
    isIntegrityFailureMessage("Download failed: 503 Service Unavailable"),
    false,
  );
});

test("laf-bridge downloader refuses archives with mismatched checksums", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-checksum-mismatch-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const archiveBasename = archiveName("1.2.3", { os: "linux", arch: "amd64" });
  const archive = Buffer.from("tampered bridge archive");
  const wrongChecksum = "0".repeat(64);
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = async (url) => {
    const href = String(url);
    if (href.endsWith("/checksums.txt")) {
      return {
        ok: true,
        text: async () => `${wrongChecksum}  ${archiveBasename}\n`,
      };
    }
    if (href.endsWith(`/${archiveBasename}`)) {
      return {
        arrayBuffer: async () =>
          archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength),
        ok: true,
      };
    }
    return { ok: false, status: 404, statusText: "Not Found" };
  };

  const targetPath = path.join(dir, "installed", "laf-bridge");
  await assert.rejects(
    downloadBinary({
      silent: true,
      target: { os: "linux", arch: "amd64" },
      targetPath,
      version: "1.2.3",
    }),
    /SHA256 mismatch/,
  );
  await assert.rejects(fs.readFile(targetPath, "utf8"), { code: "ENOENT" });
});

test("laf-bridge checksum parser accepts common checksum formats", () => {
  const checksums = [
    "# release checksums",
    "a".repeat(64) + "  laf-office_1.2.3_darwin_arm64.tar.gz",
    "b".repeat(64) + " *laf-office_1.2.3_linux_amd64.tar.gz",
  ].join("\n");

  assert.equal(
    expectedHashFor(checksums, "laf-office_1.2.3_darwin_arm64.tar.gz"),
    "a".repeat(64),
  );
  assert.equal(
    expectedHashFor(checksums, "laf-office_1.2.3_linux_amd64.tar.gz"),
    "b".repeat(64),
  );
  assert.equal(expectedHashFor(checksums, "laf-office_1.2.3_linux_arm64.tar.gz"), null);
});

test("laf-bridge sha256 helper hashes downloaded archives", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-package-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "archive.tar.gz");
  await fs.writeFile(file, "verified bridge archive");

  assert.equal(
    await sha256OfFile(file),
    crypto.createHash("sha256").update("verified bridge archive").digest("hex"),
  );
});

test("laf-bridge bin forwards the no-arg pair entrypoint to the resolved binary", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-bin-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const fakeBinary = path.join(dir, "laf-bridge-fake.cjs");
  const argsFile = path.join(dir, "args.json");
  await fs.writeFile(
    fakeBinary,
    `#!/usr/bin/env node
"use strict";
require("node:fs").writeFileSync(process.env.LAF_BRIDGE_ARGS_FILE, JSON.stringify(process.argv.slice(2)));
console.log("fake bridge invoked");
`,
    "utf8",
  );
  await fs.chmod(fakeBinary, 0o755);

  const result = await spawnNode(binPath, ["pair"], {
    LAF_BRIDGE_ARGS_FILE: argsFile,
    LAF_BRIDGE_BINARY: fakeBinary,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /fake bridge invoked/);
  assert.deepEqual(JSON.parse(await fs.readFile(argsFile, "utf8")), ["pair"]);
});

test("laf-bridge bin serves public help without launching the binary", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-help-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const fakeBinary = path.join(dir, "missing-laf-bridge");
  const forbidden = /(^|[\s|])(status|doctor|providers|bindings|start|mcp-context|link-project|unlink-project)([\s|]|$)/i;

  for (const args of [[], ["--help"], ["help"], ["pair", "--help"]]) {
    const result = await spawnNode(binPath, args, {
      LAF_BRIDGE_BINARY: fakeBinary,
    });

    assert.equal(result.code, 0, `${args.join(" ")}: ${result.stderr}`);
    assert.match(result.stdout, /usage:\s+laf-bridge\s+pair/i);
    assert.match(result.stdout, /setup code/i);
    assert.doesNotMatch(result.stdout, forbidden);
  }
});

test("laf-bridge bin preserves stdin for the setup-code prompt", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-stdin-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const fakeBinary = path.join(dir, "laf-bridge-fake.cjs");
  const recordFile = path.join(dir, "record.json");
  await fs.writeFile(
    fakeBinary,
    `#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.writeFileSync(process.env.LAF_BRIDGE_RECORD_FILE, JSON.stringify({
    args: process.argv.slice(2),
    stdin,
  }));
});
`,
    "utf8",
  );
  await fs.chmod(fakeBinary, 0o755);

  const result = await spawnNode(binPath, ["pair"], {
    LAF_BRIDGE_BINARY: fakeBinary,
    LAF_BRIDGE_RECORD_FILE: recordFile,
  }, "SETUP-CODE\n");

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(await fs.readFile(recordFile, "utf8")), {
    args: ["pair"],
    stdin: "SETUP-CODE\n",
  });
});

test("laf-bridge bin rejects invalid binary overrides before launch", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-bad-override-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const emptyBinary = path.join(dir, "empty-laf-bridge");
  await fs.writeFile(emptyBinary, "");

  const missing = await spawnNode(binPath, ["pair"], {
    LAF_BRIDGE_BINARY: path.join(dir, "missing-laf-bridge"),
  });
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /LAF_BRIDGE_BINARY does not exist/);

  const directory = await spawnNode(binPath, ["pair"], {
    LAF_BRIDGE_BINARY: dir,
  });
  assert.equal(directory.code, 1);
  assert.match(directory.stderr, /LAF_BRIDGE_BINARY must be a file/);

  const empty = await spawnNode(binPath, ["pair"], {
    LAF_BRIDGE_BINARY: emptyBinary,
  });
  assert.equal(empty.code, 1);
  assert.match(empty.stderr, /LAF_BRIDGE_BINARY is empty/);
});

test("laf-bridge bin rejects internal commands from the npx surface", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-public-surface-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const fakeBinary = path.join(dir, "laf-bridge-fake.cjs");
  const argsFile = path.join(dir, "args.json");
  await fs.writeFile(
    fakeBinary,
    `#!/usr/bin/env node
"use strict";
require("node:fs").writeFileSync(process.env.LAF_BRIDGE_ARGS_FILE, JSON.stringify(process.argv.slice(2)));
`,
    "utf8",
  );
  await fs.chmod(fakeBinary, 0o755);

  for (const command of [
    "start",
    "status",
    "doctor",
    "providers",
    "bindings",
    "link-project",
    "unlink-project",
    "mcp-context",
  ]) {
    await fs.rm(argsFile, { force: true });
    const result = await spawnNode(binPath, [command], {
      LAF_BRIDGE_ARGS_FILE: argsFile,
      LAF_BRIDGE_BINARY: fakeBinary,
    });

    assert.equal(result.code, 2, `${command}: ${result.stderr}`);
    assert.match(result.stderr, /npx exposes only `laf-bridge pair`/);
    await assert.rejects(fs.readFile(argsFile, "utf8"), { code: "ENOENT" });
  }
});

test("laf-bridge bin rejects internal pair flags even when automation env is set", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-pair-flags-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const fakeBinary = path.join(dir, "laf-bridge-fake.cjs");
  const argsFile = path.join(dir, "args.json");
  await fs.writeFile(
    fakeBinary,
    `#!/usr/bin/env node
"use strict";
require("node:fs").writeFileSync(process.env.LAF_BRIDGE_ARGS_FILE, JSON.stringify(process.argv.slice(2)));
`,
    "utf8",
  );
  await fs.chmod(fakeBinary, 0o755);

  const rejected = await spawnNode(binPath, ["pair", "--api-url", "https://office.test/api"], {
    LAF_BRIDGE_ARGS_FILE: argsFile,
    LAF_BRIDGE_BINARY: fakeBinary,
  });
  assert.equal(rejected.code, 2);
  assert.match(rejected.stderr, /without pairing flags/);
  await assert.rejects(fs.readFile(argsFile, "utf8"), { code: "ENOENT" });

  const rejectedWithEnv = await spawnNode(binPath, ["pair", "--device-label", "Smoke Bridge"], {
    LAF_BRIDGE_ALLOW_INTERNAL_ARGS: "1",
    LAF_BRIDGE_ARGS_FILE: argsFile,
    LAF_BRIDGE_BINARY: fakeBinary,
  });
  assert.equal(rejectedWithEnv.code, 2);
  assert.match(rejectedWithEnv.stderr, /without pairing flags/);
  await assert.rejects(fs.readFile(argsFile, "utf8"), { code: "ENOENT" });
});

test("packed laf-bridge package is invokable through npx pair", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-npx-pack-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const fakeBinary = path.join(dir, process.platform === "win32" ? "laf-bridge-fake.cmd" : "laf-bridge-fake.cjs");
  const argsFile = path.join(dir, "args.json");
  if (process.platform === "win32") {
    await fs.writeFile(
      fakeBinary,
      `@echo off\r\n"${process.execPath}" -e "require('node:fs').writeFileSync(process.env.LAF_BRIDGE_ARGS_FILE, JSON.stringify(process.argv.slice(1)))" %*\r\n`,
      "utf8",
    );
  } else {
    await fs.writeFile(
      fakeBinary,
      `#!/usr/bin/env node
"use strict";
require("node:fs").writeFileSync(process.env.LAF_BRIDGE_ARGS_FILE, JSON.stringify(process.argv.slice(2)));
`,
      "utf8",
    );
    await fs.chmod(fakeBinary, 0o755);
  }

  const packOutput = execFileSync("npm", ["pack", "--pack-destination", dir, "--ignore-scripts"], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tarballName = packOutput.trim().split(/\r?\n/).at(-1);
  const tarballPath = path.join(dir, tarballName);
  const projectDir = path.join(dir, "project");
  await fs.mkdir(projectDir);
  await fs.writeFile(path.join(projectDir, "package.json"), '{"private":true}\n', "utf8");

  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath], {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const result = await spawnCommand(npxCommand(), [
    "--no-install",
    "laf-bridge",
    "pair",
  ], {
    cwd: projectDir,
    env: {
      ...process.env,
      LAF_BRIDGE_ARGS_FILE: argsFile,
      LAF_BRIDGE_BINARY: fakeBinary,
    },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(await fs.readFile(argsFile, "utf8")), ["pair"]);

  const versionResult = await spawnCommand(npxCommand(), [
    "--no-install",
    "laf-bridge",
    "--version",
  ], {
    cwd: projectDir,
    env: {
      ...process.env,
      LAF_BRIDGE_ARGS_FILE: argsFile,
      LAF_BRIDGE_BINARY: fakeBinary,
    },
  });

  assert.equal(versionResult.code, 0, versionResult.stderr);
  assert.deepEqual(JSON.parse(await fs.readFile(argsFile, "utf8")), ["--version"]);
});

test("packed laf-bridge package preserves setup-code stdin through npx pair", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-bridge-npx-stdin-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const fakeBinary = path.join(dir, process.platform === "win32" ? "laf-bridge-fake.cmd" : "laf-bridge-fake.cjs");
  const recordFile = path.join(dir, "record.json");
  if (process.platform === "win32") {
    await fs.writeFile(
      fakeBinary,
      `@echo off\r\n"${process.execPath}" -e "const fs=require('node:fs');let stdin='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>stdin+=c);process.stdin.on('end',()=>fs.writeFileSync(process.env.LAF_BRIDGE_RECORD_FILE,JSON.stringify({args:process.argv.slice(1),stdin})))" %*\r\n`,
      "utf8",
    );
  } else {
    await fs.writeFile(
      fakeBinary,
      `#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.writeFileSync(process.env.LAF_BRIDGE_RECORD_FILE, JSON.stringify({
    args: process.argv.slice(2),
    stdin,
  }));
});
`,
      "utf8",
    );
    await fs.chmod(fakeBinary, 0o755);
  }

  const packOutput = execFileSync("npm", ["pack", "--pack-destination", dir, "--ignore-scripts"], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tarballName = packOutput.trim().split(/\r?\n/).at(-1);
  const tarballPath = path.join(dir, tarballName);
  const projectDir = path.join(dir, "project");
  await fs.mkdir(projectDir);
  await fs.writeFile(path.join(projectDir, "package.json"), '{"private":true}\n', "utf8");

  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath], {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const result = await spawnCommand(npxCommand(), [
    "--no-install",
    "laf-bridge",
    "pair",
  ], {
    cwd: projectDir,
    env: {
      ...process.env,
      LAF_BRIDGE_BINARY: fakeBinary,
      LAF_BRIDGE_RECORD_FILE: recordFile,
    },
    input: "PACKED-SETUP-CODE\n",
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(await fs.readFile(recordFile, "utf8")), {
    args: ["pair"],
    stdin: "PACKED-SETUP-CODE\n",
  });
});

function spawnNode(script, args, env, input) {
  return spawnCommand(process.execPath, [script, ...args], {
    cwd: packageRoot,
    env: { ...process.env, ...env },
    input,
  });
}

function spawnCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    if (options.input !== undefined) {
      child.stdin.end(options.input);
    }
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}
