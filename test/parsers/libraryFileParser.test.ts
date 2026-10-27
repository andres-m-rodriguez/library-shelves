import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { LibraryFileParser } from "../../src/parsers/libraryFileParser";

const LIBRARY_TEXT = `{
   "$schema": "./schemas/library.schema.json",
   "$categories": {
      "Week 1": { "icon": "book" }
   },
   "$fileTypes": {
      ".cs": { "preview": { "code": false } }
   },
   "variables.md": {
      "category": "Week 1",
      "lessons": [{ "name": "declare.cs" }]
   },
   "loops.md": {
      "category": "Week 1"
   }
}`;

const NON_OBJECT_FILE_TYPES_TEXT = `{
   "$fileTypes": ["cs"],
   "variables.md": { "category": "Week 1" }
}`;

const INVALID_FILE_TYPE_ENTRY_TEXT = `{ "$fileTypes": { ".cs": 1, ".md": {} } }`;

describe("LibraryFileParser", () => {
   test("reads $fileTypes into value.fileTypes", () => {
      const parser = new LibraryFileParser();
      const result = parser.parse(LIBRARY_TEXT);
      assert.deepEqual(result.value.fileTypes, { ".cs": { preview: { code: false } } });
      assert.deepEqual(result.value.fileTypes[".cs"].preview, { code: false });
   });

   test("does not report $fileTypes as a card", () => {
      const parser = new LibraryFileParser();
      const result = parser.parse(LIBRARY_TEXT);
      const cardKeys = Object.keys(result.value.cards);
      assert.deepEqual(cardKeys, ["variables.md", "loops.md"]);
      assert.deepEqual(result.issues, []);
   });

   test("reads the two cards and the category", () => {
      const parser = new LibraryFileParser();
      const result = parser.parse(LIBRARY_TEXT);
      assert.deepEqual(result.value.cards["variables.md"], { category: "Week 1", lessons: [{ name: "declare.cs" }] });
      assert.deepEqual(result.value.cards["loops.md"], { category: "Week 1" });
      assert.deepEqual(result.value.categories, { "Week 1": { icon: "book" } });
   });

   test("a non-object $fileTypes yields an issue naming $fileTypes", () => {
      const parser = new LibraryFileParser();
      const result = parser.parse(NON_OBJECT_FILE_TYPES_TEXT);
      assert.equal(result.issues.length, 1);
      assert.match(result.issues[0].message, /\$fileTypes/);
      assert.deepEqual(result.value.fileTypes, {});
      const cardKeys = Object.keys(result.value.cards);
      assert.deepEqual(cardKeys, ["variables.md"]);
   });

   test("a non-object $fileTypes entry yields an issue and is skipped", () => {
      const parser = new LibraryFileParser();
      const result = parser.parse(INVALID_FILE_TYPE_ENTRY_TEXT);
      assert.equal(result.issues.length, 1);
      assert.match(result.issues[0].message, /\$fileTypes\["\.cs"\]/);
      assert.deepEqual(result.value.fileTypes, { ".md": {} });
   });

   test("fileTypesOf returns the same map as parse", () => {
      const parser = new LibraryFileParser();
      const root = parser.parseRoot(LIBRARY_TEXT);
      const fromRoot = parser.fileTypesOf(root);
      const parsed = parser.parse(LIBRARY_TEXT);
      assert.deepEqual(fromRoot, parsed.value.fileTypes);
   });

   test("fileTypesOf returns an empty map when $fileTypes is not an object", () => {
      const parser = new LibraryFileParser();
      const root = parser.parseRoot(NON_OBJECT_FILE_TYPES_TEXT);
      const fileTypes = parser.fileTypesOf(root);
      assert.deepEqual(fileTypes, {});
   });

   test("cards() skips $schema, $categories and $fileTypes", () => {
      const parser = new LibraryFileParser();
      const root = parser.parseRoot(LIBRARY_TEXT);
      const cardKeys = Array.from(parser.cards(root), ([key]) => key);
      assert.deepEqual(cardKeys, ["variables.md", "loops.md"]);
   });
});
