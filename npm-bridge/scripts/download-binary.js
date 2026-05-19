"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const REPO = "LAF-labs/LAF-Agents-Office";
const CHECKSUMS_FILENAME = "checksums.txt";

function detectPlatform() {
  const platform = process.platform;
  const arch = process.arch;
  const osMap = { darwin: "darwin", linux: "linux", win32: "windows" };
  const archMap = { x64: "amd64", arm64: "arm64" };

  if (!osMap[platform]) {
    throw new Error(`Unsupported platform: ${platform}. laf-bridge supports macOS, Linux, and Windows.`);
  }
  if (!archMap[arch]) {
    throw new Error(`Unsupported architecture: ${arch}. laf-bridge supports x64 and arm64.`);
  }
  return { os: osMap[platform], arch: archMap[arch] };
}

function packageVersion() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
  );
  return pkg.version;
}

function archiveName(version, target = detectPlatform()) {
  const { os: goOs, arch: goArch } = target;
  return `laf-office_${version}_${goOs}_${goArch}.tar.gz`;
}

function binaryName(target = detectPlatform()) {
  return target.os === "windows" ? "laf-bridge.exe" : "laf-bridge";
}

function releaseAssetUrl(version, filename) {
  return `https://github.com/${REPO}/releases/download/v${version}/${filename}`;
}

async function fetchToFile(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
  }
  await fsp.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res.text();
}

async function sha256OfFile(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function findExtractedBinary(rootDir, filename) {
  const pending = [rootDir];
  while (pending.length > 0) {
    const current = pending.pop();
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && entry.name === filename) {
        return entryPath;
      }
    }
  }
  return "";
}

function expectedHashFor(checksumsText, filename) {
  for (const line of checksumsText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([0-9a-fA-F]{64})\s+(?:\*)?(.+)$/);
    if (match && path.basename(match[2]) === filename) {
      return match[1].toLowerCase();
    }
  }
  return null;
}

async function verifyArchive({ version, archivePath, archiveBasename, silent }) {
  const checksumsUrl = releaseAssetUrl(version, CHECKSUMS_FILENAME);
  if (!silent) {
    process.stderr.write(`laf-bridge: verifying ${archiveBasename} against ${CHECKSUMS_FILENAME}\n`);
  }

  let checksumsText;
  try {
    checksumsText = await fetchText(checksumsUrl);
  } catch (err) {
    throw new Error(
      `Cannot verify download integrity: failed to fetch ${CHECKSUMS_FILENAME} ` +
        `(${err.message}). Refusing to install an unverified binary.`,
    );
  }

  const expected = expectedHashFor(checksumsText, archiveBasename);
  if (!expected) {
    throw new Error(
      `Cannot verify download integrity: ${archiveBasename} not listed in ${checksumsUrl}.`,
    );
  }
  const actual = await sha256OfFile(archivePath);
  if (actual.toLowerCase() !== expected) {
    await fsp.rm(archivePath, { force: true });
    throw new Error(
      `SHA256 mismatch for ${archiveBasename}.\n` +
        `  expected: ${expected}\n` +
        `  actual:   ${actual}\n` +
        "Refusing to install.",
    );
  }
}

async function downloadBinary({ silent = false, target, targetPath, version } = {}) {
  const resolvedVersion = version ?? packageVersion();
  const resolvedTarget = target ?? detectPlatform();
  const archiveBasename = archiveName(resolvedVersion, resolvedTarget);
  const url = releaseAssetUrl(resolvedVersion, archiveBasename);
  const resolvedBinaryName = binaryName(resolvedTarget);
  const binaryPath = targetPath ?? path.join(__dirname, "..", "bin", resolvedBinaryName);
  const binDir = path.dirname(binaryPath);

  await fsp.mkdir(binDir, { recursive: true });

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "laf-bridge-"));
  const archivePath = path.join(tmpDir, archiveBasename);

  try {
    if (!silent) process.stderr.write(`laf-bridge: downloading ${url}\n`);
    await fetchToFile(url, archivePath);
    await verifyArchive({
      version: resolvedVersion,
      archivePath,
      archiveBasename,
      silent,
    });
    execFileSync("tar", ["-xzf", archivePath, "-C", tmpDir], {
      stdio: silent ? "ignore" : "inherit",
    });

    const extractedBinary = await findExtractedBinary(tmpDir, resolvedBinaryName);
    if (!extractedBinary) {
      throw new Error(`Downloaded archive did not contain ${resolvedBinaryName}.`);
    }
    const extractedStat = await fsp.stat(extractedBinary);
    if (extractedStat.size <= 0) {
      throw new Error(`Downloaded archive contained an empty ${resolvedBinaryName}.`);
    }
    await fsp.copyFile(extractedBinary, binaryPath);
    await fsp.chmod(binaryPath, 0o755);

    if (resolvedTarget.os === "darwin") {
      try {
        execFileSync("codesign", ["--force", "--sign", "-", binaryPath], {
          stdio: "ignore",
        });
      } catch {
        // codesign is optional; the binary may still run.
      }
    }

    return binaryPath;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

module.exports = {
  archiveName,
  binaryName,
  detectPlatform,
  downloadBinary,
  expectedHashFor,
  findExtractedBinary,
  packageVersion,
  releaseAssetUrl,
  sha256OfFile,
};
