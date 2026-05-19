"use strict";

const { downloadBinary } = require("./download-binary");

function isIntegrityFailureMessage(message) {
  return (
    message.includes("SHA256 mismatch") ||
    message.includes("Cannot verify download integrity") ||
    message.includes("Downloaded archive did not contain") ||
    message.includes("Downloaded archive contained an empty")
  );
}

async function main() {
  if (process.env.LAF_BRIDGE_SKIP_POSTINSTALL === "1") {
    process.stderr.write(
      "laf-bridge: postinstall skipped via LAF_BRIDGE_SKIP_POSTINSTALL=1\n",
    );
    process.exit(0);
  }

  try {
    await downloadBinary();
  } catch (err) {
    const message = err && err.message ? err.message : String(err);

    if (isIntegrityFailureMessage(message)) {
      process.stderr.write(
        `\nlaf-bridge: SECURITY: ${message}\n` +
          "laf-bridge: aborting install. No binary has been placed in bin/.\n\n",
      );
      process.exit(1);
    }

    if (process.env.LAF_BRIDGE_POSTINSTALL_SOFT_FAIL === "1") {
      process.stderr.write(
        `laf-bridge: postinstall download failed (${message}).\n` +
          "laf-bridge: continuing because LAF_BRIDGE_POSTINSTALL_SOFT_FAIL=1 is set. " +
          "The binary will be fetched and verified on first run.\n",
      );
      process.exit(0);
    }

    process.stderr.write(
      `\nlaf-bridge: postinstall download failed: ${message}\n` +
        "laf-bridge: set LAF_BRIDGE_POSTINSTALL_SOFT_FAIL=1 to downgrade this to a warning, " +
        "or LAF_BRIDGE_SKIP_POSTINSTALL=1 to skip the download entirely.\n\n",
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  isIntegrityFailureMessage,
};
