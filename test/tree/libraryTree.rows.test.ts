import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import * as vscode from "vscode";
import type {
   Card,
   CardMeta,
   Category,
   CategoryMeta,
   FileTypeMeta,
   Lesson,
   LessonMeta,
   Node,
   RowConfig,
   RowSetting,
} from "../../src/contracts";
import { DEFAULT_ROW, SMART_DATE } from "../../src/library/rows";
import { LibraryTree } from "../../src/tree/libraryTree";

const JSON_PATH = "C:/library/library.json";
const CARD_PATH = "C:/library/variables.md";
const LESSON_PATH = "C:/library/declare.cs";
const DAY = "2026-10-19";
const TITLE = "Declaring variables";
const DESCRIPTION = "Why types matter";

function makeCard(meta: CardMeta = {}, exists = true): Card {
   const uri = vscode.Uri.file(CARD_PATH);
   const jsonUri = vscode.Uri.file(JSON_PATH);
   return { uri, name: "variables.md", exists, meta, lessons: [], jsonUri, key: "variables.md" };
}

function makeLesson(card: Card, meta: Partial<LessonMeta> = {}, exists = true): Lesson {
   const uri = vscode.Uri.file(LESSON_PATH);
   const fullMeta: LessonMeta = { name: "declare.cs", ...meta };
   const lesson: Lesson = { uri, exists, meta: fullMeta, card, day: DAY };
   card.lessons.push(lesson);
   return lesson;
}

function describedLesson(card: Card, row: RowSetting = {}, extra: Partial<LessonMeta> = {}): Lesson {
   return makeLesson(card, { title: TITLE, description: DESCRIPTION, row, ...extra });
}

function makeCategory(name: string, cards: Card[], meta: CategoryMeta = {}): Category {
   const jsonUri = vscode.Uri.file(JSON_PATH);
   return { name, cards, meta, jsonUri };
}

function treeWith(fileTypes: Record<string, FileTypeMeta>, categories: Category[]): LibraryTree {
   const tree = new LibraryTree();
   tree.fileTypes.set(JSON_PATH, fileTypes);
   tree.categories = categories;
   return tree;
}

function lessonNode(lesson: Lesson): Node {
   return { kind: "lesson", lesson };
}

function cardNode(card: Card): Node {
   return { kind: "card", card };
}

function itemFor(tree: LibraryTree, node: Node): { label: unknown; description: unknown } {
   const item = tree.getTreeItem(node);
   return { label: item.label, description: item.description };
}

describe("LibraryTree.rowFor", () => {
   test("a lesson without any row settings gets the default row", () => {
      const card = makeCard();
      const lesson = makeLesson(card);
      const tree = treeWith({}, []);
      const resolved = tree.rowFor(lessonNode(lesson));
      assert.deepEqual(resolved, DEFAULT_ROW);
      assert.notEqual(resolved, DEFAULT_ROW);
   });

   test("file type, category, card and lesson layers stack in that order", () => {
      const card = makeCard({ category: "Week 1", row: { parts: ["description"] } });
      const lesson = makeLesson(card, { row: { date: "MM/DD" } });
      const category = makeCategory("Week 1", [card], { row: { label: "title" } });
      const tree = treeWith({ ".cs": { row: { date: "YYYY-MM-DD", parts: ["tags"] } } }, [category]);
      const resolved = tree.rowFor(lessonNode(lesson));
      const expected: RowConfig = { label: "title", parts: ["description"], date: "MM/DD" };
      assert.deepEqual(resolved, expected);
   });

   test("the lesson layer wins over the card layer on the same key", () => {
      const card = makeCard({ row: { label: "title" } });
      const lesson = makeLesson(card, { row: { label: "fileName" } });
      const tree = treeWith({}, []);
      const resolved = tree.rowFor(lessonNode(lesson));
      assert.equal(resolved.label, "fileName");
   });

   test("the card layer wins over the category layer on the same key", () => {
      const card = makeCard({ category: "Week 1", row: { date: "M/D" } });
      const lesson = makeLesson(card);
      const category = makeCategory("Week 1", [card], { row: { date: "DD/MM" } });
      const tree = treeWith({}, [category]);
      const resolved = tree.rowFor(lessonNode(lesson));
      assert.equal(resolved.date, "M/D");
   });

   test("the category layer wins over the file type layer on the same key", () => {
      const card = makeCard({ category: "Week 1" });
      const lesson = makeLesson(card);
      const category = makeCategory("Week 1", [card], { row: { parts: ["date"] } });
      const tree = treeWith({ ".cs": { row: { parts: ["tags"] } } }, [category]);
      const resolved = tree.rowFor(lessonNode(lesson));
      assert.deepEqual(resolved.parts, ["date"]);
   });

   test("rowLayers of a lesson lists the four layers in order", () => {
      const card = makeCard({ category: "Week 1", row: { parts: ["description"] } });
      const lesson = makeLesson(card, { row: { date: "MM/DD" } });
      const category = makeCategory("Week 1", [card], { row: { label: "title" } });
      const tree = treeWith({ ".cs": { row: { date: "YYYY-MM-DD" } } }, [category]);
      const layers = tree.rowLayers(lessonNode(lesson));
      assert.deepEqual(layers, [{ date: "YYYY-MM-DD" }, { label: "title" }, { parts: ["description"] }, { date: "MM/DD" }]);
   });

   test("rowLayers of a card stops at the card layer and uses the card extension", () => {
      const card = makeCard({ row: { label: "title" } });
      makeLesson(card, { row: { date: "MM/DD" } });
      const fileTypes: Record<string, FileTypeMeta> = {
         ".cs": { row: { date: "DD/MM" } },
         ".md": { row: { parts: ["description"] } },
      };
      const tree = treeWith(fileTypes, []);
      const layers = tree.rowLayers(cardNode(card));
      assert.deepEqual(layers, [{ parts: ["description"] }, undefined, { label: "title" }]);
   });

   test("a day node has no layers", () => {
      const card = makeCard({ row: { label: "title" } });
      const lesson = makeLesson(card, { row: { label: "title" } });
      const tree = treeWith({}, []);
      const node: Node = { kind: "day", day: { key: DAY, lessons: [lesson] } };
      assert.deepEqual(tree.rowLayers(node), []);
      assert.deepEqual(tree.rowFor(node), DEFAULT_ROW);
   });
});

describe("LibraryTree.getTreeItem lesson rows", () => {
   test("a title label with date and description parts", () => {
      const card = makeCard();
      const lesson = describedLesson(card, { label: "title", parts: ["date", "description"], date: "MM/DD" });
      const tree = treeWith({}, []);
      const item = itemFor(tree, lessonNode(lesson));
      assert.deepEqual(item, { label: TITLE, description: "10/19 · Why types matter" });
   });

   test("the default row leaves the label to the file name and shows title and description", () => {
      const card = makeCard();
      const lesson = describedLesson(card);
      const tree = treeWith({}, []);
      const item = itemFor(tree, lessonNode(lesson));
      assert.deepEqual(item, { label: undefined, description: "Declaring variables · Why types matter" });
   });

   test("a lesson without a title under the title label falls back to the file name label", () => {
      const card = makeCard();
      const lesson = makeLesson(card, { description: DESCRIPTION, row: { label: "title", parts: ["description"] } });
      const tree = treeWith({}, []);
      const item = itemFor(tree, lessonNode(lesson));
      assert.deepEqual(item, { label: undefined, description: DESCRIPTION });
   });

   test("parts order is honoured", () => {
      const card = makeCard();
      const lesson = describedLesson(card, { label: "title", parts: ["description", "date"], date: "MM/DD" });
      const tree = treeWith({}, []);
      const item = itemFor(tree, lessonNode(lesson));
      assert.equal(item.description, "Why types matter · 10/19");
   });

   test("the part equal to the title label is skipped", () => {
      const card = makeCard();
      const lesson = describedLesson(card, { label: "title", parts: ["title", "date"], date: "MM/DD" });
      const tree = treeWith({}, []);
      const item = itemFor(tree, lessonNode(lesson));
      assert.deepEqual(item, { label: TITLE, description: "10/19" });
   });

   test("the part equal to the file name label is skipped", () => {
      const card = makeCard();
      const lesson = describedLesson(card, { label: "fileName", parts: ["fileName", "title"] });
      const tree = treeWith({}, []);
      const item = itemFor(tree, lessonNode(lesson));
      assert.deepEqual(item, { label: undefined, description: TITLE });
   });

   test("the file name part shows next to a title label", () => {
      const card = makeCard();
      const lesson = describedLesson(card, { label: "title", parts: ["fileName"] });
      const tree = treeWith({}, []);
      const item = itemFor(tree, lessonNode(lesson));
      assert.deepEqual(item, { label: TITLE, description: "declare.cs" });
   });

   test("the tags part joins the tags with a comma", () => {
      const card = makeCard();
      const lesson = describedLesson(card, { parts: ["tags"] }, { tags: ["types", "basics"] });
      const tree = treeWith({}, []);
      const item = itemFor(tree, lessonNode(lesson));
      assert.equal(item.description, "types, basics");
   });

   test("missing parts are left out of the description", () => {
      const card = makeCard();
      const lesson = makeLesson(card, { title: TITLE, row: { parts: ["tags", "title", "description"] } });
      const tree = treeWith({}, []);
      const item = itemFor(tree, lessonNode(lesson));
      assert.equal(item.description, TITLE);
   });

   test("no parts gives an empty description", () => {
      const card = makeCard();
      const lesson = describedLesson(card, { parts: [] });
      const tree = treeWith({}, []);
      const item = itemFor(tree, lessonNode(lesson));
      assert.equal(item.description, "");
   });

   test("the smart date format reads through dayLabel", () => {
      const card = makeCard();
      const lesson = describedLesson(card, { parts: ["date"], date: SMART_DATE });
      const tree = treeWith({}, []);
      const item = itemFor(tree, lessonNode(lesson));
      const dateText = String(item.description);
      assert.ok(dateText.includes("2026"), dateText);
   });

   test("in day mode the date part is omitted and the card name is prefixed", () => {
      const card = makeCard();
      const lesson = describedLesson(card, { label: "title", parts: ["date", "description"], date: "MM/DD" });
      const tree = treeWith({}, []);
      tree.mode = "day";
      const item = itemFor(tree, lessonNode(lesson));
      assert.deepEqual(item, { label: TITLE, description: "variables.md · Why types matter" });
   });

   test("in day mode the card name shows even when no part has a value", () => {
      const card = makeCard();
      const lesson = describedLesson(card, { parts: ["date"] });
      const tree = treeWith({}, []);
      tree.mode = "day";
      const item = itemFor(tree, lessonNode(lesson));
      assert.equal(item.description, "variables.md");
   });

   test("a missing lesson file still shows missing", () => {
      const card = makeCard();
      const lesson = describedLesson(card, { label: "title", parts: ["date", "description"], date: "MM/DD" }, { tags: ["x"] });
      lesson.exists = false;
      const tree = treeWith({}, []);
      const item = itemFor(tree, lessonNode(lesson));
      assert.deepEqual(item, { label: TITLE, description: "missing" });
   });

   test("the row inherited from the category drives the lesson item", () => {
      const card = makeCard({ category: "Week 1" });
      const lesson = describedLesson(card);
      const category = makeCategory("Week 1", [card], { row: { label: "title", parts: ["date"], date: "DD.MM.YYYY" } });
      const tree = treeWith({}, [category]);
      const item = itemFor(tree, lessonNode(lesson));
      assert.deepEqual(item, { label: TITLE, description: "19.10.2026" });
   });
});

describe("LibraryTree.getTreeItem card rows", () => {
   test("a card with the title label shows its title and its description", () => {
      const card = makeCard({ title: "Variables", description: "Storing values", row: { label: "title", parts: ["date", "description", "tags"] } });
      const tree = treeWith({}, []);
      const item = itemFor(tree, cardNode(card));
      assert.deepEqual(item, { label: "Variables", description: "Storing values" });
   });

   test("a card with the default row shows its file name label with title and description", () => {
      const card = makeCard({ title: "Variables", description: "Storing values" });
      const tree = treeWith({}, []);
      const item = itemFor(tree, cardNode(card));
      assert.deepEqual(item, { label: "variables.md", description: "Variables · Storing values" });
   });

   test("a card without a title under the title label keeps its file name label", () => {
      const card = makeCard({ description: "Storing values", row: { label: "title", parts: ["title", "description"] } });
      const tree = treeWith({}, []);
      const item = itemFor(tree, cardNode(card));
      assert.deepEqual(item, { label: "variables.md", description: "Storing values" });
   });

   test("the file name part of a card shows next to its title label", () => {
      const card = makeCard({ title: "Variables", row: { label: "title", parts: ["fileName"] } });
      const tree = treeWith({}, []);
      const item = itemFor(tree, cardNode(card));
      assert.deepEqual(item, { label: "Variables", description: "variables.md" });
   });

   test("a missing card file still shows missing", () => {
      const card = makeCard({ title: "Variables", description: "Storing values", row: { label: "title" } }, false);
      const tree = treeWith({}, []);
      const item = itemFor(tree, cardNode(card));
      assert.deepEqual(item, { label: "Variables", description: "missing" });
   });
});
