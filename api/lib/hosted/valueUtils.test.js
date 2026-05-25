const assert = require("node:assert/strict");
const test = require("node:test");

const {
  arrayOrEmpty,
  clamp,
  compactObject,
  isHuman,
  isUUID,
  nowISO,
  randomID,
  shortID,
  slugify,
  truncateText,
  truthy,
} = require("./valueUtils");

test("truncateText normalizes whitespace and preserves the hosted truncation contract", () => {
  assert.equal(truncateText("  Hello\n\nworld  ", 20), "Hello world");
  assert.equal(truncateText("Hello world", 6), "Hello...");
});

test("slugify lowercases, hyphenates, trims, and caps slug length", () => {
  assert.equal(slugify("  AI Startup Office!!!  "), "ai-startup-office");
  assert.equal(slugify("----"), "");
  assert.equal(slugify("a".repeat(80)), "a".repeat(64));
});

test("identity helpers retain hosted actor and UUID rules", () => {
  assert.equal(isHuman("human"), true);
  assert.equal(isHuman("you"), true);
  assert.equal(isHuman("agent"), false);
  assert.equal(isUUID("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isUUID("not-a-uuid"), false);
});

test("numeric and collection helpers keep conservative defaults", () => {
  assert.equal(clamp(5, 1, 10), 5);
  assert.equal(clamp(15, 1, 10), 10);
  assert.equal(clamp(Number.NaN, 1, 10), 1);
  assert.deepEqual(arrayOrEmpty(["x"]), ["x"]);
  assert.deepEqual(arrayOrEmpty("x"), []);
  assert.deepEqual(compactObject({ a: 1, b: undefined, c: null }), { a: 1, c: null });
});

test("truthy keeps the existing narrow environment flag contract", () => {
  assert.equal(truthy(true), true);
  assert.equal(truthy("true"), true);
  assert.equal(truthy("1"), true);
  assert.equal(truthy("yes"), true);
  assert.equal(truthy("TRUE"), false);
  assert.equal(truthy(1), false);
});

test("time and random ID helpers return production-safe primitive shapes", () => {
  assert.match(nowISO(), /^\d{4}-\d{2}-\d{2}T/);
  assert.match(shortID(), /^[0-9a-f]{10}$/);
  assert.match(randomID(), /^([0-9a-f]{10}|[0-9a-f-]{36})$/i);
});
