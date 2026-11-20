import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSalary, parseExperience, detectWorkMode, makeFingerprint } from "../lib/normalize.ts";
import { literal } from "../lib/sql.ts";

test("salary parsing", () => {
  assert.deepEqual(parseSalary("₹3-5 LPA"), { min: 300000, max: 500000, currency: "INR", period: "year" });
  assert.equal(parseSalary("$50k - $70k").max, 70000);
  assert.equal(parseSalary("INR 25,000 per month").period, "month");
  assert.equal(parseSalary("Competitive").min, null);
});
test("experience parsing", () => {
  assert.deepEqual(parseExperience("3-5 years of experience"), { min: 3, max: 5 });
  assert.deepEqual(parseExperience("5+ years"), { min: 5, max: null });
  assert.deepEqual(parseExperience("Freshers welcome"), { min: 0, max: 1 });
});
test("work mode + fingerprint", () => {
  assert.equal(detectWorkMode(false, "Hybrid - Surat"), "hybrid");
  assert.equal(makeFingerprint("Developer (m/w/d)", "Acme GmbH", "x"), makeFingerprint("Developer", "Acme", "x"));
});
test("sql literal escaping", () => {
  assert.equal(literal("O'Brien"), "'O''Brien'");
  assert.equal(literal(["a\"b", "c'd"]), `'{"a\\"b","c''d"}'`);
  assert.throws(() => literal("a\u0000"));
});
