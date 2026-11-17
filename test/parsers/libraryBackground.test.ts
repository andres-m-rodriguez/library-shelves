import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { LibraryFileParser } from "../../src/parsers/libraryFileParser";

const parser = new LibraryFileParser();

describe("LibraryFileParser $background", () => {
   test("reads the background and does not treat it as a card", () => {
      const { value, issues } = parser.parse(`{
         "$background": { "image": "art/night.gif", "dim": 0.5, "fit": "tile" },
         "variables.md": {}
      }`);
      assert.deepEqual(value.background, { image: "art/night.gif", dim: 0.5, fit: "tile" });
      assert.deepEqual(Object.keys(value.cards), ["variables.md"]);
      assert.deepEqual(issues, []);
   });

   test("the cards iterator skips the background", () => {
      const root = parser.parseRoot(`{ "$background": { "image": "a.png" }, "loops.md": {} }`);
      assert.deepEqual([...parser.cards(root)].map(([key]) => key), ["loops.md"]);
   });

   test("a library without a background has none", () => {
      assert.equal(parser.parse(`{ "variables.md": {} }`).value.background, undefined);
      assert.deepEqual(parser.backgroundOf({}), {});
   });

   test("unusable settings are dropped and dim is kept between 0 and 1", () => {
      const root = { $background: { image: "  ", dim: 7, fit: "stretch" } };
      assert.deepEqual(parser.backgroundOf(root), { dim: 1 });
      assert.deepEqual(parser.backgroundOf({ $background: { image: 3, dim: "0.5", fit: "cover" } }), { fit: "cover" });
      assert.deepEqual(parser.backgroundOf({ $background: { dim: -2 } }), { dim: 0 });
   });

   test("a background that is not an object is reported", () => {
      const { value, issues } = parser.parse(`{ "$background": "night.gif" }`);
      assert.equal(value.background, undefined);
      assert.deepEqual(value.cards, {});
      assert.equal(issues.length, 1);
   });
});
