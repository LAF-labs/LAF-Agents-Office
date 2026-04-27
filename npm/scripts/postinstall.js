"use strict";

// Postinstall: fetch and cryptographically verify the laf-office binary.
//
// Security model: the download is verified against the SHA256 listed in the
// release's checksums.txt. If the archive is tampered with, or the hash file
// is unreachable, the install MUST fail — silently continuing would allow a
// compromised release token to plant a backdoored binary on every machine
// that runs `npm install laf-office`.
//
// Escape hatches (opt-in only):
//   LAF_OFFICE_SKIP_POSTINSTALL=1
//     Skip the download entirely. The bin/laf-office.js shim will attempt an
//     (also-verified) download on first invocation. Use this for packaging
//     builds, offline mirrors, or CI images that restore a prebuilt bin/.
//
//   LAF_OFFICE_POSTINSTALL_SOFT_FAIL=1
//     Downgrade a *network* failure (e.g., GitHub unreachable behind a
//     corporate proxy) from fatal to a warning. SHA256 mismatches are ALWAYS
//     fatal and cannot be soft-failed — that path exists to catch tampering.

const { downloadBinary } = require("./download-binary");

if (process.env.LAF_OFFICE_SKIP_POSTINSTALL === "1") {
  process.stderr.write(
    "laf-office: postinstall skipped via LAF_OFFICE_SKIP_POSTINSTALL=1\n",
  );
  process.exit(0);
}

downloadBinary().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  const isIntegrityFailure =
    message.includes("SHA256 mismatch") ||
    message.includes("Cannot verify download integrity");

  // Integrity failures are ALWAYS fatal. No soft-fail, no retry-on-first-run.
  if (isIntegrityFailure) {
    process.stderr.write(
      `\nlaf-office: SECURITY: ${message}\n` +
        `laf-office: aborting install. No binary has been placed in bin/.\n\n`,
    );
    process.exit(1);
  }

  // Non-integrity failures (network, DNS, disk, unsupported platform).
  if (process.env.LAF_OFFICE_POSTINSTALL_SOFT_FAIL === "1") {
    process.stderr.write(
      `laf-office: postinstall download failed (${message}).\n` +
        `laf-office: continuing because LAF_OFFICE_POSTINSTALL_SOFT_FAIL=1 is set. ` +
        `The binary will be fetched (and verified) on first run.\n`,
    );
    process.exit(0);
  }

  process.stderr.write(
    `\nlaf-office: postinstall download failed: ${message}\n` +
      `laf-office: set LAF_OFFICE_POSTINSTALL_SOFT_FAIL=1 to downgrade this to a ` +
      `warning, or LAF_OFFICE_SKIP_POSTINSTALL=1 to skip the download entirely.\n\n`,
  );
  process.exit(1);
});
