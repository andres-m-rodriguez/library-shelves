import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { previewValueOf } from "../../src/features/rows/configurePreview";
import { settingPathOf, type Scope } from "../../src/features/rows/scopes";
import * as vscode from "vscode";
import type { Card, HoverAction, Lesson, LessonMeta, PreviewConfig } from "../../src/contracts";
import { ALL_ACTIONS, FULL_PREVIEW, LESSON_ACTIONS } from "../../src/library/preview";

function makeCard(): Card {
   const uri = vscode.Uri.file("C:/library/variables.md");
   const jsonUri = vscode.Uri.file("C:/library/library.json");
   return { uri, name: "variables.md", exists: true, meta: { category: "Week 1" }, lessons: [], jsonUri, key: "variables.md" };
}

function makeLesson(card: Card, meta: Partial<LessonMeta> = {}): Lesson {
   const fullMeta: LessonMeta = { name: "declare.cs", ...meta };
   const uri = vscode.Uri.file(`C:/library/${fullMeta.name}`);
   const lesson: Lesson = { uri, exists: true, meta: fullMeta, card, day: "2026-10-27" };
   card.lessons.push(lesson);
   return lesson;
}

const LESSON_FULL: PreviewConfig = { summary: true, code: true, actions: LESSON_ACTIONS };

describe("previewValueOf", () => {
   test("matching the inherited configuration removes the setting", () => {
      const parts = { summary: true, code: true, actions: LESSON_ACTIONS };
      const value = previewValueOf(parts, LESSON_FULL, LESSON_ACTIONS);
      assert.equal(value.some, false);
   });

   test("writes only the keys that differ from what is inherited", () => {
      const inherited: PreviewConfig = { summary: true, code: false, actions: LESSON_ACTIONS };
      const parts = { summary: true, code: false, actions: LESSON_ACTIONS.filter((action) => action !== "setColor") };
      const value = previewValueOf(parts, inherited, LESSON_ACTIONS);
      assert.deepEqual(value, { some: true, value: { actions: parts.actions } });
   });

   test("everything checked over a restricted parent writes true", () => {
      const inherited: PreviewConfig = { summary: true, code: false, actions: [] };
      const parts = { summary: true, code: true, actions: LESSON_ACTIONS };
      const value = previewValueOf(parts, inherited, LESSON_ACTIONS);
      assert.deepEqual(value, { some: true, value: true });
   });

   test("nothing checked writes false", () => {
      const parts = { summary: false, code: false, actions: [] as HoverAction[] };
      const value = previewValueOf(parts, FULL_PREVIEW, ALL_ACTIONS);
      assert.deepEqual(value, { some: true, value: false });
   });

   test("inherited actions outside the listed set do not count as a difference", () => {
      const parts = { summary: true, code: true, actions: LESSON_ACTIONS };
      const value = previewValueOf(parts, FULL_PREVIEW, LESSON_ACTIONS);
      assert.equal(value.some, false);
   });

   test("only the summary differing writes just summary", () => {
      const parts = { summary: false, code: true, actions: ALL_ACTIONS };
      const value = previewValueOf(parts, FULL_PREVIEW, ALL_ACTIONS);
      assert.deepEqual(value, { some: true, value: { summary: false } });
   });
});

describe("settingPathOf", () => {
   const card = makeCard();
   const lesson = makeLesson(card);
   const data = {
      "$categories": { " Week 1 ": { color: "red" } },
      "$fileTypes": { CS: { preview: false } },
      "variables.md": { category: "Week 1", lessons: [{ name: "other.cs" }, { name: "declare.cs" }] },
   };

   test("lesson path points at the lesson index", () => {
      const scope: Scope = { role: "lesson", lesson };
      assert.deepEqual(settingPathOf(data, scope, "preview"), { some: true, value: ["variables.md", "lessons", 1, "preview"] });
   });

   test("missing lesson yields none", () => {
      const gone = makeLesson(card, { name: "gone.cs" });
      const scope: Scope = { role: "lesson", lesson: gone };
      assert.equal(settingPathOf(data, scope, "preview").some, false);
   });

   test("card path", () => {
      const scope: Scope = { role: "card", card };
      assert.deepEqual(settingPathOf(data, scope, "preview"), { some: true, value: ["variables.md", "preview"] });
   });

   test("category path reuses the declared key even with different spacing", () => {
      const scope: Scope = { role: "category", name: "week 1" };
      assert.deepEqual(settingPathOf(data, scope, "preview"), { some: true, value: ["$categories", " Week 1 ", "preview"] });
   });

   test("undeclared category falls back to the row name", () => {
      const scope: Scope = { role: "category", name: "Week 2" };
      assert.deepEqual(settingPathOf(data, scope, "preview"), { some: true, value: ["$categories", "Week 2", "preview"] });
   });

   test("file type path reuses an existing key written without the dot", () => {
      const scope: Scope = { role: "fileType", extension: ".cs" };
      assert.deepEqual(settingPathOf(data, scope, "preview"), { some: true, value: ["$fileTypes", "CS", "preview"] });
   });

   test("new file type uses the normalized extension", () => {
      const scope: Scope = { role: "fileType", extension: ".py" };
      assert.deepEqual(settingPathOf(data, scope, "preview"), { some: true, value: ["$fileTypes", ".py", "preview"] });
   });
});
