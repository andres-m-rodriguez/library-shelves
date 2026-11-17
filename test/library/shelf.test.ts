import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import * as vscode from "vscode";
import { isLibraryFile, type Card, type CardMeta, type Category, type CategoryMeta, type LessonMeta } from "../../src/contracts";
import { buildShelf, cssColor, resolveShelfRef } from "../../src/library/shelf";

const SHELF_PATH = "C:/library/library.shelf";
const OTHER_PATH = "C:/elsewhere/library.shelf";

function makeCard(key: string, meta: CardMeta = {}, libraryPath = SHELF_PATH, exists = true): Card {
   const folder = libraryPath.slice(0, libraryPath.lastIndexOf("/"));
   const uri = vscode.Uri.file(`${folder}/${key}`);
   const name = key.slice(key.lastIndexOf("/") + 1);
   return { uri, name, exists, meta, lessons: [], jsonUri: vscode.Uri.file(libraryPath), key };
}

function addLesson(card: Card, meta: LessonMeta, exists = true): void {
   const folder = card.jsonUri.fsPath.slice(0, card.jsonUri.fsPath.lastIndexOf("/"));
   const uri = vscode.Uri.file(`${folder}/${meta.name}`);
   card.lessons.push({ uri, exists, meta, card, day: "2026-10-19" });
}

function makeCategory(name: string, cards: Card[], meta: CategoryMeta = {}, libraryPath = SHELF_PATH): Category {
   return { name, cards, meta, jsonUri: vscode.Uri.file(libraryPath) };
}

describe("buildShelf", () => {
   test("categories become shelves and their cards become tiles", () => {
      const scopes = makeCard("Scopes.md", { title: "How scopes work", description: "Blocks and lifetimes", color: "blue" });
      addLesson(scopes, { name: "lessons/Block.cs", title: "Block scope", description: "Braces", tags: ["scope"] });
      addLesson(scopes, { name: "notes.txt" }, false);
      const basics = makeCategory("Basics", [scopes], { description: "Start here", color: "green" });

      const shelf = buildShelf(SHELF_PATH, [basics], []);

      assert.deepEqual(shelf, {
         categories: [
            {
               name: "Basics",
               description: "Start here",
               color: "var(--vscode-charts-green)",
               cards: [
                  {
                     key: "Scopes.md",
                     label: "How scopes work",
                     fileName: "Scopes.md",
                     description: "Blocks and lifetimes",
                     color: "var(--vscode-charts-blue)",
                     exists: true,
                     runnable: false,
                     dependsOn: [],
                     position: undefined,
                     lessons: [
                        { name: "lessons/Block.cs", label: "Block scope", fileName: "Block.cs", detail: "Braces", tags: ["scope"], color: "", exists: true, runnable: true },
                        { name: "notes.txt", label: "notes.txt", fileName: "notes.txt", detail: "", tags: [], color: "", exists: false, runnable: false },
                     ],
                  },
               ],
            },
         ],
         uncategorized: [],
      });
   });

   test("a card without a title is labelled by its file name", () => {
      const shelf = buildShelf(SHELF_PATH, [], [makeCard("Projects/ForLoops.cs")]);
      assert.equal(shelf.uncategorized[0].label, "ForLoops.cs");
      assert.equal(shelf.uncategorized[0].runnable, true);
   });

   test("cards from another library file are left out", () => {
      const mine = makeCard("If.md");
      const theirs = makeCard("While.md", {}, OTHER_PATH);
      const shared = makeCategory("Basics", [mine, theirs]);
      const shelf = buildShelf(SHELF_PATH, [shared], [makeCard("Loose.md", {}, OTHER_PATH)]);
      assert.deepEqual(shelf.categories[0].cards.map((c) => c.key), ["If.md"]);
      assert.deepEqual(shelf.uncategorized, []);
   });

   test("a category declared in another library with no cards here is not a shelf", () => {
      const elsewhere = makeCategory("Elsewhere", [makeCard("While.md", {}, OTHER_PATH)], {}, OTHER_PATH);
      const shelf = buildShelf(SHELF_PATH, [elsewhere], []);
      assert.deepEqual(shelf.categories, []);
   });

   test("an empty category declared in this library is still a shelf", () => {
      const shelf = buildShelf(SHELF_PATH, [makeCategory("Empty", [])], []);
      assert.deepEqual(shelf.categories.map((c) => c.name), ["Empty"]);
      assert.deepEqual(shelf.categories[0].cards, []);
   });

   test("the library path is matched without regard to case", () => {
      const shelf = buildShelf("c:/LIBRARY/library.shelf", [], [makeCard("If.md")]);
      assert.equal(shelf.uncategorized.length, 1);
   });
});

describe("resolveShelfRef", () => {
   const scopes = makeCard("Scopes.md");
   addLesson(scopes, { name: "Block.cs" });
   const loose = makeCard("Loose.md");
   const basics = makeCategory("Basics", [scopes]);

   test("finds a card in a category and an uncategorized card", () => {
      const inCategory = resolveShelfRef(SHELF_PATH, [basics], [loose], { kind: "card", key: "Scopes.md" });
      const atTopLevel = resolveShelfRef(SHELF_PATH, [basics], [loose], { kind: "card", key: "Loose.md" });
      assert.deepEqual(inCategory, { kind: "card", card: scopes });
      assert.deepEqual(atTopLevel, { kind: "card", card: loose });
   });

   test("finds a lesson by its card and name", () => {
      const node = resolveShelfRef(SHELF_PATH, [basics], [loose], { kind: "lesson", cardKey: "Scopes.md", name: "Block.cs" });
      assert.deepEqual(node, { kind: "lesson", lesson: scopes.lessons[0] });
   });

   test("finds a category by name without regard to case", () => {
      const node = resolveShelfRef(SHELF_PATH, [basics], [loose], { kind: "category", name: " basics " });
      assert.deepEqual(node, { kind: "category", category: basics });
   });

   test("returns undefined for things that are not in this library", () => {
      assert.equal(resolveShelfRef(SHELF_PATH, [basics], [loose], { kind: "card", key: "Gone.md" }), undefined);
      assert.equal(resolveShelfRef(SHELF_PATH, [basics], [loose], { kind: "lesson", cardKey: "Scopes.md", name: "Gone.cs" }), undefined);
      assert.equal(resolveShelfRef(SHELF_PATH, [basics], [loose], { kind: "category", name: "Gone" }), undefined);
      assert.equal(resolveShelfRef(OTHER_PATH, [basics], [loose], { kind: "card", key: "Scopes.md" }), undefined);
   });
});

describe("cssColor", () => {
   test("named colors map to the chart theme variables", () => {
      assert.equal(cssColor("red"), "var(--vscode-charts-red)");
      assert.equal(cssColor("grey"), "var(--vscode-descriptionForeground)");
   });

   test("a theme color id becomes its CSS variable", () => {
      assert.equal(cssColor("editorError.foreground"), "var(--vscode-editorError-foreground)");
   });

   test("nothing usable yields an empty string", () => {
      assert.equal(cssColor(undefined), "");
      assert.equal(cssColor("  "), "");
      assert.equal(cssColor("#ff0000; x"), "");
   });
});

describe("isLibraryFile", () => {
   test("accepts any .shelf file and the legacy library.json", () => {
      assert.equal(isLibraryFile("C:\\notes\\library.shelf"), true);
      assert.equal(isLibraryFile("/notes/CSharp.SHELF"), true);
      assert.equal(isLibraryFile("library.json"), true);
   });

   test("rejects other files", () => {
      assert.equal(isLibraryFile("C:/notes/other.json"), false);
      assert.equal(isLibraryFile("C:/notes/shelf.md"), false);
      assert.equal(isLibraryFile("C:/notes/.shelf"), false);
   });
});
