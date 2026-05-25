const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const test = require("node:test");

const {
  createHostedRequestIO,
} = require("./requestIO");

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requestIO(maxRequestBodyBytes = 64) {
  return createHostedRequestIO({
    createHTTPError,
    maxRequestBodyBytes,
  });
}

function responseStub() {
  return {
    body: "",
    headers: {},
    statusCode: 0,
    end(body) {
      this.body = body;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
  };
}

function requestStub(body, headers = {}) {
  return {
    body,
    headers,
    async *[Symbol.asyncIterator]() {},
  };
}

test("requestPath normalizes Vercel rewrite path queries", () => {
  const io = requestIO();

  assert.equal(
    io.requestPath({ query: { path: ["startup-office", "runs"] } }),
    "startup-office/runs",
  );
  assert.equal(io.requestPath({ query: { path: "/health/" } }), "health");
  assert.equal(io.requestPath({ query: {} }), "");
});

test("writeJSON sets status, content type, and serialized payload", () => {
  const io = requestIO();
  const res = responseStub();

  io.writeJSON(res, 201, { ok: true });

  assert.equal(res.statusCode, 201);
  assert.equal(res.headers["content-type"], "application/json");
  assert.equal(res.body, JSON.stringify({ ok: true }));
});

test("jsonByteSize and assertJSONByteSize share the same serialized size contract", () => {
  const io = requestIO();

  assert.equal(
    io.jsonByteSize({ value: "abc" }),
    Buffer.byteLength(JSON.stringify({ value: "abc" })),
  );
  assert.doesNotThrow(() => io.assertJSONByteSize({ value: "abc" }, 20, "payload"));

  assert.throws(
    () => io.assertJSONByteSize({ value: "abcdef" }, 10, "payload"),
    /payload exceeds 10 bytes/,
  );
});

test("readBody returns parsed object bodies after enforcing JSON size", async () => {
  const io = requestIO(16);

  assert.deepEqual(
    await io.readBody(requestStub({ ok: true })),
    { ok: true },
  );

  await assert.rejects(
    () => io.readBody(requestStub({ value: "x".repeat(32) })),
    /request body exceeds 16 bytes/,
  );
});

test("readBody parses raw JSON bodies and rejects invalid or oversized bodies", async () => {
  const io = requestIO(32);

  assert.deepEqual(
    await io.readBody(requestStub(JSON.stringify({ ok: true }))),
    { ok: true },
  );

  await assert.rejects(
    () => io.readBody(requestStub("{")),
    /invalid json body/,
  );
  await assert.rejects(
    () => io.readBody(requestStub(JSON.stringify({ value: "x".repeat(64) }))),
    /request body exceeds 32 bytes/,
  );
});

test("readBody enforces declared and streamed request size limits", async () => {
  const io = requestIO(16);

  await assert.rejects(
    () => io.readBody(requestStub("", { "content-length": "17" })),
    /request body exceeds 16 bytes/,
  );
  await assert.rejects(
    () => io.readBody(Object.assign(
      Readable.from([
        Buffer.from("{\"value\":\""),
        Buffer.from("xxxxxxxxxxxxxxxx\"}"),
      ]),
      { body: "", headers: {} },
    )),
    /request body exceeds 16 bytes/,
  );
});

test("readBody returns an empty object for empty streams", async () => {
  const io = requestIO();

  assert.deepEqual(
    await io.readBody(Object.assign(Readable.from([]), { body: "", headers: {} })),
    {},
  );
});
