import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import * as vscode from "vscode";
import type { Card, CardMeta, Category, CategoryMeta, FileTypeMeta, Lesson, LessonMeta, Node } from "../../src/contracts";
import { ALL_ACTIONS, FULL_PREVIEW } from "../../src/library/preview";
import { LibraryTree } from "../../src/tree/libraryTree";

const JSON_PATH = "C:/library/library.json";
const OTHER_JSON_PATH = "C:/elsewhere/library.json";
const CARD_PATH = "C:/library/variables.md";
const LESSON_PATH = "C:/library/declare.cs";
const DAY = "2026-10-27";

function makeCard(meta: CardMeta = {}, jsonPath = JSON_PATH): Card {
   const uri = vscode.Uri.file(CARD_PATH);
   const jsonUri = vscode.Uri.file(jsonPath);
   return { uri, name: "variables.md", exists: true, meta, lessons: [], jsonUri, key: "variables.md" };
}

function makeLesson(card: Card, meta: Partial<LessonMeta> = {}): Lesson {
   const uri = vscode.Uri.file(LESSON_PATH);
   const fullMeta: LessonMeta = { name: "declare.cs", ...meta };
   const lesson: Lesson = { uri, exists: true, meta: fullMeta, card, day: DAY };
   card.lessons.push(lesson);
   return lesson;
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

describe("LibraryTree.previewFor lesson", () => {
   test("file type, category, card and lesson layers stack in that order", () => {
      const card = makeCard({ category: "Week 1", preview: { actions: ["open"] } });
      const lesson = makeLesson(card);
      const category = makeCategory("Week 1", [card], { preview: { summary: false } });
      const tree = treeWith({ ".cs": { preview: { code: false } } }, [category]);
      const resolved = tree.previewFor(lessonNode(lesson));
      assert.deepEqual(resolved, { summary: false, code: false, actions: ["open"] });
   });

   test("a true lesson layer restores everything the lower layers hid", () => {
      const card = makeCard({ category: "Week 1", preview: { actions: ["open"] } });
      const lesson = makeLesson(card, { preview: true });
      const category = makeCategory("Week 1", [card], { preview: { summary: false } });
      const tree = treeWith({ ".cs": { preview: { code: false } } }, [category]);
      const resolved = tree.previewFor(lessonNode(lesson));
      assert.deepEqual(resolved, FULL_PREVIEW);
   });

   test("a partial lesson layer overrides only its own key", () => {
      const card = makeCard({ category: "Week 1", preview: { actions: ["open"] } });
      const lesson = makeLesson(card, { preview: { code: true } });
      const category = makeCategory("Week 1", [card], { preview: { summary: false } });
      const tree = treeWith({ ".cs": { preview: { code: false } } }, [category]);
      const resolved = tree.previewFor(lessonNode(lesson));
      assert.deepEqual(resolved, { summary: false, code: true, actions: ["open"] });
   });

   test("the card layer wins over the category layer on the same key", () => {
      const card = makeCard({ category: "Week 1", preview: { actions: ["open"] } });
      const lesson = makeLesson(card);
      const category = makeCategory("Week 1", [card], { preview: { actions: ["run"] } });
      const tree = treeWith({}, [category]);
      const resolved = tree.previewFor(lessonNode(lesson));
      assert.deepEqual(resolved.actions, ["open"]);
   });

   test("the category layer wins over the file type layer on the same key", () => {
      const card = makeCard({ category: "Week 1" });
      const lesson = makeLesson(card);
      const category = makeCategory("Week 1", [card], { preview: { code: true } });
      const tree = treeWith({ ".cs": { preview: { code: false } } }, [category]);
      const resolved = tree.previewFor(lessonNode(lesson));
      assert.equal(resolved.code, true);
   });

   test("a card without a category skips the category layer", () => {
      const card = makeCard({ preview: { actions: ["open"] } });
      const lesson = makeLesson(card);
      const category = makeCategory("Week 1", [], { preview: { summary: false } });
      const tree = treeWith({ ".cs": { preview: { code: false } } }, [category]);
      const resolved = tree.previewFor(lessonNode(lesson));
      assert.deepEqual(resolved, { summary: true, code: false, actions: ["open"] });
   });

   test("the category is matched by trimmed lower-case name", () => {
      const card = makeCard({ category: "  wEEK 1 " });
      const lesson = makeLesson(card);
      const category = makeCategory("Week 1", [card], { preview: { summary: false } });
      const tree = treeWith({}, [category]);
      const resolved = tree.previewFor(lessonNode(lesson));
      assert.equal(resolved.summary, false);
   });

   test("the file type key matches without a dot and in any case", () => {
      const card = makeCard();
      const lesson = makeLesson(card);
      const tree = treeWith({ CS: { preview: { code: false } } }, []);
      const resolved = tree.previewFor(lessonNode(lesson));
      assert.deepEqual(resolved, { summary: true, code: false, actions: ALL_ACTIONS });
   });

   test("file types registered for another library.json do not apply", () => {
      const card = makeCard({}, OTHER_JSON_PATH);
      const lesson = makeLesson(card);
      const tree = treeWith({ ".cs": { preview: false } }, []);
      const resolved = tree.previewFor(lessonNode(lesson));
      assert.deepEqual(resolved, FULL_PREVIEW);
   });
});

describe("LibraryTree.previewFor card", () => {
   test("a card uses its own extension rather than its lessons' extension", () => {
      const card = makeCard();
      makeLesson(card);
      const fileTypes: Record<string, FileTypeMeta> = {
         ".cs": { preview: { code: false } },
         ".md": { preview: { summary: false } },
      };
      const tree = treeWith(fileTypes, []);
      const forCard = tree.previewFor(cardNode(card));
      assert.deepEqual(forCard, { summary: false, code: true, actions: ALL_ACTIONS });
   });

   test("file type, category and card layers stack in that order", () => {
      const card = makeCard({ category: "Week 1", preview: { actions: ["open"] } });
      const category = makeCategory("Week 1", [card], { preview: { summary: false } });
      const tree = treeWith({ ".md": { preview: { code: false } } }, [category]);
      const resolved = tree.previewFor(cardNode(card));
      assert.deepEqual(resolved, { summary: false, code: false, actions: ["open"] });
   });
});

describe("LibraryTree.previewFor category and day", () => {
   test("a category node uses only its own meta", () => {
      const card = makeCard({ category: "Week 1", preview: false });
      const category = makeCategory("Week 1", [card], { preview: { actions: ["addCard"] } });
      const tree = treeWith({ ".md": { preview: { code: false } } }, [category]);
      const node: Node = { kind: "category", category };
      const resolved = tree.previewFor(node);
      assert.deepEqual(resolved, { summary: true, code: true, actions: ["addCard"] });
   });

   test("a category without a preview is fully shown regardless of file types", () => {
      const category = makeCategory("Week 1", [], {});
      const tree = treeWith({ ".md": { preview: false } }, [category]);
      const node: Node = { kind: "category", category };
      const resolved = tree.previewFor(node);
      assert.deepEqual(resolved, FULL_PREVIEW);
   });

   test("a day node gets the full preview", () => {
      const card = makeCard({ preview: false });
      const lesson = makeLesson(card, { preview: false });
      const tree = treeWith({ ".cs": { preview: false } }, []);
      const node: Node = { kind: "day", day: { key: DAY, lessons: [lesson] } };
      const resolved = tree.previewFor(node);
      assert.deepEqual(resolved, FULL_PREVIEW);
   });
});
