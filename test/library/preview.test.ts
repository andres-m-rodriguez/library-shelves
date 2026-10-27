import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import type { PreviewConfig, PreviewSetting, PreviewValue } from "../../src/contracts";
import {
   ALL_ACTIONS,
   CARD_ACTIONS,
   CATEGORY_ACTIONS,
   FULL_PREVIEW,
   LESSON_ACTIONS,
   NO_PREVIEW,
   extensionOf,
   fileTypePreview,
   normalizeExtension,
   resolvePreview,
   showsAnything,
   visibleActions,
} from "../../src/library/preview";

describe("resolvePreview", () => {
   test("no layers yields the full configuration", () => {
      const resolved = resolvePreview([]);
      assert.deepEqual(resolved, { summary: true, code: true, actions: ALL_ACTIONS });
      assert.notEqual(resolved, FULL_PREVIEW);
   });

   test("undefined layers are skipped", () => {
      const resolved = resolvePreview([undefined, undefined]);
      assert.deepEqual(resolved, FULL_PREVIEW);
   });

   test("a false layer hides everything", () => {
      const resolved = resolvePreview([false]);
      assert.deepEqual(resolved, NO_PREVIEW);
   });

   test("a true layer after false restores everything", () => {
      const resolved = resolvePreview([false, true]);
      assert.deepEqual(resolved, FULL_PREVIEW);
   });

   test("partial layers merge per key and later layers win", () => {
      const fileType: PreviewValue = { code: false };
      const category: PreviewValue = { summary: false, actions: ["open"] };
      const card: PreviewValue = { summary: true };
      const lesson: PreviewValue = { actions: ["run", "open"] };
      const resolved = resolvePreview([fileType, category, card, lesson]);
      assert.deepEqual(resolved, { summary: true, code: false, actions: ["run", "open"] });
   });

   test("a partial layer leaves untouched keys at their previous value", () => {
      const resolved = resolvePreview([false, { summary: true }]);
      assert.deepEqual(resolved, { summary: true, code: false, actions: [] });
   });

   test("unknown action names are dropped", () => {
      const layer = { actions: ["run", "bogus", "open", "deleteEverything"] } as unknown as PreviewSetting;
      const resolved = resolvePreview([layer]);
      assert.deepEqual(resolved.actions, ["run", "open"]);
   });

   test("the result never aliases the shared defaults", () => {
      const resolved = resolvePreview([{ actions: ["run"] }]);
      assert.deepEqual(FULL_PREVIEW.actions, ALL_ACTIONS);
      assert.deepEqual(resolved.actions, ["run"]);
   });
});

describe("visibleActions", () => {
   test("run shows for a lesson but not for a card", () => {
      const forLesson = visibleActions(FULL_PREVIEW, "lesson");
      const forCard = visibleActions(FULL_PREVIEW, "card");
      assert.ok(forLesson.includes("run"));
      assert.ok(!forCard.includes("run"));
   });

   test("each kind sees exactly its own actions under the full configuration", () => {
      const forLesson = visibleActions(FULL_PREVIEW, "lesson");
      const forCard = visibleActions(FULL_PREVIEW, "card");
      const forCategory = visibleActions(FULL_PREVIEW, "category");
      const forDay = visibleActions(FULL_PREVIEW, "day");
      assert.deepEqual(forLesson, LESSON_ACTIONS);
      assert.deepEqual(forCard, CARD_ACTIONS);
      assert.deepEqual(forCategory, CATEGORY_ACTIONS);
      assert.deepEqual(forDay, []);
   });

   test("filters to the intersection of configured and allowed actions", () => {
      const config: PreviewConfig = { summary: true, code: true, actions: ["run", "setColor", "addCard"] };
      const forLesson = visibleActions(config, "lesson");
      const forCategory = visibleActions(config, "category");
      assert.deepEqual(forLesson, ["run", "setColor"]);
      assert.deepEqual(forCategory, ["addCard", "setColor"]);
   });
});

describe("showsAnything", () => {
   test("false only when summary, code and actions are all hidden", () => {
      const hidden = showsAnything(NO_PREVIEW, "lesson");
      assert.equal(hidden, false);
   });

   test("true when only the summary is visible", () => {
      const config: PreviewConfig = { summary: true, code: false, actions: [] };
      const shown = showsAnything(config, "card");
      assert.equal(shown, true);
   });

   test("true when only the code is visible", () => {
      const config: PreviewConfig = { summary: false, code: true, actions: [] };
      const shown = showsAnything(config, "category");
      assert.equal(shown, true);
   });

   test("actions count only when the node kind can show them", () => {
      const config: PreviewConfig = { summary: false, code: false, actions: ["run"] };
      const forLesson = showsAnything(config, "lesson");
      const forCard = showsAnything(config, "card");
      assert.equal(forLesson, true);
      assert.equal(forCard, false);
   });
});

describe("extensionOf", () => {
   test("lowercases the extension of the last path segment", () => {
      assert.equal(extensionOf("a/b/c.CS"), ".cs");
   });

   test("returns an empty string without an extension", () => {
      assert.equal(extensionOf("noext"), "");
   });

   test("treats a leading dot as part of the name", () => {
      assert.equal(extensionOf(".gitignore"), "");
   });

   test("ignores dots in directory names", () => {
      assert.equal(extensionOf("v1.2/readme"), "");
   });

   test("handles windows separators", () => {
      assert.equal(extensionOf("C:\\lessons\\intro.MD"), ".md");
   });
});

describe("fileTypePreview", () => {
   test("matches keys written with the leading dot", () => {
      const fileTypes = { ".cs": { preview: { code: false } } };
      const preview = fileTypePreview(fileTypes, "declare.cs");
      assert.deepEqual(preview, { code: false });
   });

   test("matches keys written without the leading dot", () => {
      const fileTypes = { cs: { preview: false as PreviewValue } };
      const preview = fileTypePreview(fileTypes, "declare.cs");
      assert.equal(preview, false);
   });

   test("matches case-insensitively", () => {
      const fileTypes = { ".CS": { preview: true as PreviewValue } };
      const preview = fileTypePreview(fileTypes, "DECLARE.Cs");
      assert.equal(preview, true);
   });

   test("returns undefined when no key matches", () => {
      const fileTypes = { ".md": { preview: false as PreviewValue } };
      const preview = fileTypePreview(fileTypes, "declare.cs");
      assert.equal(preview, undefined);
   });

   test("returns undefined when the file has no extension", () => {
      const fileTypes = { "": { preview: false as PreviewValue } };
      const preview = fileTypePreview(fileTypes, "Makefile");
      assert.equal(preview, undefined);
   });

   test("returns undefined when the matching entry has no preview", () => {
      const fileTypes = { ".cs": {} };
      const preview = fileTypePreview(fileTypes, "declare.cs");
      assert.equal(preview, undefined);
   });
});

describe("normalizeExtension", () => {
   test("adds a leading dot", () => {
      assert.equal(normalizeExtension("cs"), ".cs");
   });

   test("keeps an existing leading dot", () => {
      assert.equal(normalizeExtension(".cs"), ".cs");
   });

   test("trims and lowercases", () => {
      assert.equal(normalizeExtension("  .CS "), ".cs");
   });

   test("returns an empty string for blank input", () => {
      assert.equal(normalizeExtension(""), "");
      assert.equal(normalizeExtension("   "), "");
   });
});

describe("malformed preview values", () => {
   test("null and other non-object values are ignored", () => {
      const layers = [null, "yes", 3, ["run"]] as unknown as (PreviewValue | undefined)[];
      const resolved = resolvePreview(layers);
      assert.deepEqual(resolved, FULL_PREVIEW);
   });

   test("non-boolean summary and non-array actions are dropped while valid keys apply", () => {
      const layer = { summary: "no", code: false, actions: "run" } as unknown as PreviewValue;
      const resolved = resolvePreview([layer]);
      assert.deepEqual(resolved, { summary: true, code: false, actions: ALL_ACTIONS });
   });

   test("non-string entries inside actions are dropped", () => {
      const layer = { actions: ["run", 7, null, "bogus", "open"] } as unknown as PreviewValue;
      const resolved = resolvePreview([layer]);
      assert.deepEqual(resolved.actions, ["run", "open"]);
   });

   test("a dotfile on a windows path has no extension", () => {
      assert.equal(extensionOf("C:/lib/.env"), "");
   });
});
