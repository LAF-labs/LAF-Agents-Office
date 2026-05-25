const assert = require("node:assert/strict");
const test = require("node:test");

const { buildCitationSources, normalizeCitationSource } = require("./citationSources");

test("citation source builder extracts only URL-backed evidence metadata", () => {
  const sources = buildCitationSources({
    assets: [
      {
        id: "asset-1",
        metadata: {
          sources: [
            { label: "Landing page", url: "https://example.com/landing" },
            { label: "Duplicate", url: "https://example.com/landing" },
          ],
          source_url: "https://example.com/brief",
        },
        name: "Launch brief",
      },
    ],
    customers: [
      {
        id: "customer-1",
        name: "Buyer",
        profile: { sources: [{ label: "Interview notes", url: "https://example.com/interview" }] },
      },
    ],
    inputs: {
      sources: [{ label: "Founder supplied report", url: "https://example.com/report" }],
    },
    signals: [
      {
        id: "signal-1",
        metadata: { source_url: "https://example.com/signal" },
        source: "manual",
        title: "Market signal",
      },
      {
        id: "signal-2",
        metadata: {},
        source: "https://example.com/source-column",
        title: "Source column URL",
      },
    ],
    wikiMemory: [
      {
        id: "memory-1",
        sources: [{ type: "internal_receipt", run_id: "run-1" }],
        title: "Internal memory",
      },
    ],
  });

  assert.deepEqual(
    sources.map((source) => source.url),
    [
      "https://example.com/report",
      "https://example.com/signal",
      "https://example.com/source-column",
      "https://example.com/brief",
      "https://example.com/landing",
      "https://example.com/interview",
    ],
  );
  assert.equal(sources.some((source) => source.url === "manual"), false);
  assert.equal(sources.some((source) => source.type === "internal_receipt"), false);
});

test("citation source normalization rejects non-URL source labels", () => {
  assert.equal(normalizeCitationSource("manual"), null);
  assert.equal(normalizeCitationSource({ label: "No URL" }), null);
  assert.deepEqual(normalizeCitationSource("https://example.com/a", { type: "signal" }), {
    label: "https://example.com/a",
    record_id: null,
    type: "signal",
    url: "https://example.com/a",
  });
});
