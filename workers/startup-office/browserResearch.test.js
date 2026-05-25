const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createBrowserResearchClient,
  isPrivateAddress,
  requestedResearchURLs,
  validateResearchURL,
} = require("./browserResearch");

test("browser research client fetches allowed HTTPS pages and records source metadata", async () => {
  const calls = [];
  const client = createBrowserResearchClient({
    fetchImpl: async (url, options) => {
      calls.push({ options, url });
      return {
        ok: true,
        status: 200,
        text: async () => [
          "<html><head>",
          "<title>Market Report &amp; Signals</title>",
          '<meta name="description" content="Founder demand signal">',
          "</head><body><script>ignore()</script><h1>Demand is rising</h1><p>Founders want controlled AI.</p></body></html>",
        ].join(""),
      };
    },
    lookupHost: async () => [{ address: "93.184.216.34" }],
    nowISO: () => "2026-05-25T00:00:00.000Z",
    provider: "fetch",
  });

  const result = await client.research({
    inputs: {
      research_urls: ["https://example.com/report#fragment"],
    },
    loop: { slug: "idea-validation" },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.com/report");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(result.provider, "fetch");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].title, "Market Report & Signals");
  assert.equal(result.findings[0].description, "Founder demand signal");
  assert.match(result.findings[0].excerpt, /Demand is rising/);
  assert.deepEqual(result.sources, [
    {
      fetched_at: "2026-05-25T00:00:00.000Z",
      label: "Market Report & Signals",
      type: "browser_research",
      url: "https://example.com/report",
    },
  ]);
});

test("browser research policy skips unsafe or unsupported URLs", async () => {
  const lookup = async (hostname) => {
    if (hostname === "private.example") return [{ address: "10.0.0.5" }];
    return [{ address: "93.184.216.34" }];
  };
  assert.deepEqual(await validateResearchURL("http://example.com", { lookupHost: lookup }), {
    ok: false,
    reason: "only https urls are allowed",
  });
  const credentialedUrl = "https://" + "user" + ":" + "pass" + "@example.com";
  assert.deepEqual(
    await validateResearchURL(credentialedUrl, { lookupHost: lookup }),
    { ok: false, reason: "credentialed urls are not allowed" },
  );
  assert.deepEqual(
    await validateResearchURL("https://private.example/report", { lookupHost: lookup }),
    { ok: false, reason: "private network urls are not allowed" },
  );
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("192.168.0.10"), true);
  assert.equal(isPrivateAddress("93.184.216.34"), false);
});

test("browser research client is disabled by default and does not fetch", async () => {
  const client = createBrowserResearchClient({
    fetchImpl: async () => {
      throw new Error("disabled provider must not fetch");
    },
  });
  const result = await client.research({
    inputs: { research_urls: ["https://example.com/report"] },
  });

  assert.equal(result.enabled, false);
  assert.equal(result.findings.length, 0);
  assert.equal(result.skipped[0].reason, "browser research provider disabled");
});

test("requested research URLs normalize common input shapes", () => {
  assert.deepEqual(
    requestedResearchURLs({
      research_urls: ["https://example.com/a", "https://example.com/a"],
      sources: [{ url: "https://example.com/b" }],
      urls: ["https://example.com/c"],
    }),
    ["https://example.com/a", "https://example.com/c", "https://example.com/b"],
  );
});
