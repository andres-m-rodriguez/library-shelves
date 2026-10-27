import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import type { RowConfig, RowSetting } from "../../src/contracts";
import { rowValueOf, sameParts, withKey } from "../../src/features/rows/configureRow";
import { DEFAULT_ROW } from "../../src/library/rows";
import { none, some } from "../../src/option";

const INHERITED: RowConfig = { label: "title", parts: ["date", "description"], date: "MM/DD" };

describe("rowValueOf", () => {
   test("a setting equal to the inherited row is none", () => {
      const own: RowSetting = { label: "title", parts: ["date", "description"], date: "MM/DD" };
      const value = rowValueOf(own, INHERITED);
      assert.equal(value.some, false);
   });

   test("an empty setting is none", () => {
      const value = rowValueOf({}, INHERITED);
      assert.equal(value.some, false);
   });

   test("keeps only the keys that differ from the inherited row", () => {
      const own: RowSetting = { label: "fileName", parts: ["date", "description"], date: "MM/DD" };
      const value = rowValueOf(own, INHERITED);
      assert.deepEqual(value, { some: true, value: { label: "fileName" } });
   });

   test("a differing date is kept on its own", () => {
      const value = rowValueOf({ date: "DD/MM" }, INHERITED);
      assert.deepEqual(value, { some: true, value: { date: "DD/MM" } });
   });

   test("every differing key is kept", () => {
      const own: RowSetting = { label: "fileName", parts: ["tags"], date: "YYYY-MM-DD" };
      const value = rowValueOf(own, INHERITED);
      assert.deepEqual(value, { some: true, value: own });
   });

   test("parts in a different order count as a difference", () => {
      const own: RowSetting = { parts: ["description", "date"] };
      const value = rowValueOf(own, INHERITED);
      assert.deepEqual(value, { some: true, value: { parts: ["description", "date"] } });
   });

   test("parts in the inherited order are dropped", () => {
      const own: RowSetting = { parts: ["date", "description"], date: "DD/MM" };
      const value = rowValueOf(own, INHERITED);
      assert.deepEqual(value, { some: true, value: { date: "DD/MM" } });
   });

   test("an empty parts list differs from inherited parts", () => {
      const value = rowValueOf({ parts: [] }, INHERITED);
      assert.deepEqual(value, { some: true, value: { parts: [] } });
   });

   test("compares against the default row when nothing is inherited", () => {
      const value = rowValueOf({ label: "fileName", parts: ["title", "description"] }, DEFAULT_ROW);
      assert.equal(value.some, false);
   });
});

describe("sameParts", () => {
   test("equal lists in the same order match", () => {
      assert.equal(sameParts(["date", "tags"], ["date", "tags"]), true);
   });

   test("the same parts in another order do not match", () => {
      assert.equal(sameParts(["date", "tags"], ["tags", "date"]), false);
   });

   test("a shorter list does not match", () => {
      assert.equal(sameParts(["date"], ["date", "tags"]), false);
   });

   test("two empty lists match", () => {
      assert.equal(sameParts([], []), true);
   });
});

describe("withKey", () => {
   test("sets a key on an empty own setting", () => {
      const next = withKey(none, "date", some("MM/DD"));
      assert.deepEqual(next, { date: "MM/DD" });
   });

   test("replaces a key and keeps the others", () => {
      const own = some<RowSetting>({ label: "title", date: "MM/DD" });
      const next = withKey(own, "date", some("DD/MM"));
      assert.deepEqual(next, { label: "title", date: "DD/MM" });
   });

   test("none removes the key", () => {
      const own = some<RowSetting>({ label: "title", parts: ["date"] });
      const next = withKey(own, "parts", none);
      assert.deepEqual(next, { label: "title" });
   });

   test("removing a key that is not set leaves the setting unchanged", () => {
      const own = some<RowSetting>({ label: "title" });
      const next = withKey(own, "date", none);
      assert.deepEqual(next, { label: "title" });
   });

   test("does not mutate the original setting", () => {
      const original: RowSetting = { label: "title" };
      const own = some(original);
      withKey(own, "date", some("MM/DD"));
      assert.deepEqual(original, { label: "title" });
   });
});
