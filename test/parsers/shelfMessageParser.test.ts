import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { ShelfMessageParser } from "../../src/parsers/shelfMessageParser";

const parser = new ShelfMessageParser();

describe("ShelfMessageParser", () => {
   test("accepts the messages that carry no data", () => {
      for (const type of ["ready", "newCard", "newCategory", "openText", "background"]) {
         assert.deepEqual(parser.parse({ type, extra: 1 }), { type });
      }
   });

   test("accepts an action on a card, a lesson and a category", () => {
      assert.deepEqual(parser.parse({ type: "action", action: "open", ref: { kind: "card", key: "If.md" } }), {
         type: "action",
         action: "open",
         ref: { kind: "card", key: "If.md" },
      });
      assert.deepEqual(parser.parse({ type: "action", action: "run", ref: { kind: "lesson", cardKey: "If.md", name: "a.cs" } }), {
         type: "action",
         action: "run",
         ref: { kind: "lesson", cardKey: "If.md", name: "a.cs" },
      });
      assert.deepEqual(parser.parse({ type: "action", action: "renameCategory", ref: { kind: "category", name: "Basics" } }), {
         type: "action",
         action: "renameCategory",
         ref: { kind: "category", name: "Basics" },
      });
   });

   test("drops fields the reference does not need", () => {
      const parsed = parser.parse({ type: "action", action: "open", ref: { kind: "card", key: "If.md", json: "C:/x" } });
      assert.deepEqual(parsed, { type: "action", action: "open", ref: { kind: "card", key: "If.md" } });
   });

   test("rejects unknown actions, so a page cannot name an arbitrary command", () => {
      assert.equal(parser.parse({ type: "action", action: "workbench.action.quit", ref: { kind: "card", key: "If.md" } }), undefined);
      assert.equal(parser.parse({ type: "action", action: 3, ref: { kind: "card", key: "If.md" } }), undefined);
   });

   test("accepts a known card style and rejects others", () => {
      assert.deepEqual(parser.parse({ type: "cardStyle", style: "reveal" }), { type: "cardStyle", style: "reveal" });
      assert.equal(parser.parse({ type: "cardStyle", style: "neon" }), undefined);
      assert.equal(parser.parse({ type: "cardStyle" }), undefined);
      assert.equal(parser.cardStyle("cover"), "cover");
      assert.equal(parser.cardStyle(3), undefined);
   });

   test("rejects malformed references", () => {
      assert.equal(parser.parse({ type: "action", action: "open" }), undefined);
      assert.equal(parser.parse({ type: "action", action: "open", ref: { kind: "card" } }), undefined);
      assert.equal(parser.parse({ type: "action", action: "open", ref: { kind: "lesson", cardKey: "If.md" } }), undefined);
      assert.equal(parser.parse({ type: "action", action: "open", ref: { kind: "day", key: "x" } }), undefined);
   });

   test("rejects anything that is not a known message", () => {
      for (const value of [undefined, null, "ready", 7, [], {}, { type: "delete" }]) {
         assert.equal(parser.parse(value), undefined);
      }
   });
});
