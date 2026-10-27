import { strict as assert } from "node:assert";
import { afterEach, describe, test } from "node:test";
import * as vscode from "vscode";
import type { Card, CardMeta, Category, CategoryMeta, Lesson, LessonMeta, Node, PreviewConfig } from "../../src/contracts";
import { longDate } from "../../src/dates";
import { FULL_PREVIEW, NO_PREVIEW, resolvePreview } from "../../src/library/preview";
import { HOVER_ACTION_COMMAND, HoverCards } from "../../src/tree/hoverCards";
import { resetFiles, seedFile } from "../stubs/vscode";

const JSON_PATH = "C:/library/library.json";
const CARD_PATH = "C:/library/variables.md";
const LESSON_PATH = "C:/library/declare.cs";
const MARKDOWN_LESSON_PATH = "C:/library/notes.md";
const DAY = "2026-10-27";
const LESSON_TEXT = "using System;\n\nvar count = 1;\nConsole.WriteLine(count);";
const CARD_TEXT = "# Intro to storage\n\nA variable holds a value.\nName it after what it holds.";
const EXPECTED_DATE = longDate(DAY);
const HEADING_ICON = "$(file-code)";
const FENCE = "```";
const SEPARATOR = "---";

function makeCard(meta: CardMeta = {}): Card {
   const uri = vscode.Uri.file(CARD_PATH);
   const jsonUri = vscode.Uri.file(JSON_PATH);
   const fullMeta: CardMeta = { category: "Week 1", ...meta };
   return { uri, name: "variables.md", exists: true, meta: fullMeta, lessons: [], jsonUri, key: "variables.md" };
}

function makeLesson(card: Card, meta: Partial<LessonMeta> = {}, fsPath = LESSON_PATH): Lesson {
   const uri = vscode.Uri.file(fsPath);
   const fullMeta: LessonMeta = { name: "declare.cs", title: "Declaring variables", date: DAY, ...meta };
   const lesson: Lesson = { uri, exists: true, meta: fullMeta, card, day: DAY };
   card.lessons.push(lesson);
   return lesson;
}

function makeCategory(cards: Card[], meta: CategoryMeta = {}): Category {
   const jsonUri = vscode.Uri.file(JSON_PATH);
   return { name: "Week 1", cards, meta, jsonUri };
}

function lessonNode(lesson: Lesson): Node {
   return { kind: "lesson", lesson };
}

function cardNode(card: Card): Node {
   return { kind: "card", card };
}

function categoryNode(category: Category): Node {
   return { kind: "category", category };
}

function dayNode(lessons: Lesson[]): Node {
   return { kind: "day", day: { key: DAY, lessons } };
}

function seededLesson(): Lesson {
   seedFile(LESSON_PATH, LESSON_TEXT);
   const card = makeCard();
   return makeLesson(card);
}

async function render(node: Node, config: PreviewConfig): Promise<string> {
   const cards = new HoverCards();
   const result = await cards.build(node, config);
   assert.ok(result instanceof vscode.MarkdownString);
   return result.value;
}

function linkMarker(label: string): string {
   return `) ${label}](command:${HOVER_ACTION_COMMAND}?`;
}

function hasLink(value: string, label: string): boolean {
   const marker = linkMarker(label);
   return value.includes(marker);
}

function linkArgs(value: string, label: string): unknown {
   const marker = linkMarker(label);
   const start = value.indexOf(marker) + marker.length;
   const end = value.indexOf(")", start);
   const encoded = value.slice(start, end);
   const decoded = decodeURIComponent(encoded);
   return JSON.parse(decoded);
}

function countOf(value: string, needle: string): number {
   return value.split(needle).length - 1;
}

afterEach(() => {
   resetFiles();
});

describe("HoverCards lesson", () => {
   test("full config shows the summary, a tagged code excerpt and every lesson link", async () => {
      const lesson = seededLesson();
      const value = await render(lessonNode(lesson), FULL_PREVIEW);
      assert.ok(value.startsWith(`${HEADING_ICON} **Declaring variables**`));
      assert.ok(value.includes("declare.cs"));
      assert.ok(value.includes("$(book) variables.md"));
      assert.ok(value.includes("$(folder) Week 1"));
      assert.ok(value.includes(`$(calendar) ${EXPECTED_DATE}`));
      assert.ok(value.includes(`${FENCE}csharp\nusing System;\n\nvar count = 1;\nConsole.WriteLine(count);\n${FENCE}`));
      assert.ok(hasLink(value, "Run"));
      assert.ok(hasLink(value, "Open"));
      assert.ok(hasLink(value, "Edit Details"));
      assert.ok(hasLink(value, "Open Card"));
      assert.ok(hasLink(value, "Color"));
      assert.ok(hasLink(value, "Preview"));
   });

   test("links carry the action and a lesson ref as encoded json", async () => {
      const lesson = seededLesson();
      const value = await render(lessonNode(lesson), FULL_PREVIEW);
      const args = linkArgs(value, "Run");
      const expectedRef = { kind: "lesson", json: JSON_PATH, cardKey: "variables.md", name: "declare.cs" };
      assert.deepEqual(args, ["run", expectedRef]);
   });

   test("code off with a reduced action list keeps the layout tight", async () => {
      const lesson = seededLesson();
      const config = resolvePreview([{ code: false, actions: ["run", "open", "editDetails"] }]);
      const value = await render(lessonNode(lesson), config);
      assert.ok(value.includes("**Declaring variables**"));
      assert.ok(value.includes(`$(calendar) ${EXPECTED_DATE}`));
      assert.ok(!value.includes(FENCE));
      assert.ok(hasLink(value, "Run"));
      assert.ok(hasLink(value, "Open"));
      assert.ok(hasLink(value, "Edit Details"));
      assert.ok(!hasLink(value, "Open Card"));
      assert.ok(!hasLink(value, "Color"));
      assert.ok(!hasLink(value, "Preview"));
      assert.equal(countOf(value, SEPARATOR), 1);
      assert.ok(!value.includes("\n\n\n"));
      assert.ok(!value.startsWith("\n"));
      assert.ok(!value.endsWith("\n"));
   });

   test("summary off starts straight at the code block", async () => {
      const lesson = seededLesson();
      const config = resolvePreview([{ summary: false }]);
      const value = await render(lessonNode(lesson), config);
      assert.ok(!value.startsWith(HEADING_ICON));
      assert.ok(!value.includes(HEADING_ICON));
      assert.ok(!value.startsWith("\n"));
      assert.ok(value.startsWith(`${FENCE}csharp`));
      assert.ok(hasLink(value, "Run"));
   });

   test("no actions means no separator and no command links", async () => {
      const lesson = seededLesson();
      const config = resolvePreview([{ actions: [] }]);
      const value = await render(lessonNode(lesson), config);
      assert.ok(!value.includes(SEPARATOR));
      assert.ok(!value.includes("command:"));
   });

   test("actions that do not belong to a lesson produce no links", async () => {
      const lesson = seededLesson();
      const config = resolvePreview([{ actions: ["addLesson"] }]);
      const value = await render(lessonNode(lesson), config);
      assert.ok(!value.includes(SEPARATOR));
      assert.ok(!value.includes("command:"));
   });

   test("a lesson that is not runnable has no Run link", async () => {
      seedFile(MARKDOWN_LESSON_PATH, "Some notes");
      const card = makeCard();
      const lesson = makeLesson(card, { name: "notes.md" }, MARKDOWN_LESSON_PATH);
      const value = await render(lessonNode(lesson), FULL_PREVIEW);
      assert.ok(!hasLink(value, "Run"));
      assert.ok(hasLink(value, "Open"));
      assert.ok(value.includes(`${FENCE}markdown\nSome notes\n${FENCE}`));
   });

   test("a missing file still renders the summary and links without a fence", async () => {
      const card = makeCard();
      const lesson = makeLesson(card);
      const value = await render(lessonNode(lesson), FULL_PREVIEW);
      assert.ok(value.startsWith(HEADING_ICON));
      assert.ok(!value.includes(FENCE));
      assert.ok(hasLink(value, "Run"));
      assert.ok(!value.includes("\n\n\n"));
   });

   test("without a title the heading falls back to the file name", async () => {
      const card = makeCard();
      const lesson = makeLesson(card, { title: undefined });
      const value = await render(lessonNode(lesson), FULL_PREVIEW);
      assert.ok(value.startsWith(`${HEADING_ICON} **declare.cs**`));
   });

   test("the excerpt keeps only the first eight lines", async () => {
      const lines = ["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8", "l9", "l10"];
      seedFile(LESSON_PATH, lines.join("\n"));
      const card = makeCard();
      const lesson = makeLesson(card);
      const value = await render(lessonNode(lesson), FULL_PREVIEW);
      assert.ok(value.includes("l8\n```"));
      assert.ok(!value.includes("l9"));
   });
});

describe("HoverCards card", () => {
   test("full config quotes the excerpt and drops heading lines", async () => {
      seedFile(CARD_PATH, CARD_TEXT);
      const card = makeCard();
      const value = await render(cardNode(card), FULL_PREVIEW);
      assert.ok(value.startsWith("$(book) **variables.md**"));
      assert.ok(value.includes("> A variable holds a value.\n> Name it after what it holds."));
      assert.ok(!value.includes("Intro to storage"));
      assert.ok(hasLink(value, "Open"));
      assert.ok(hasLink(value, "Add Lesson"));
      assert.ok(hasLink(value, "Move"));
      assert.ok(hasLink(value, "Icon"));
      assert.ok(!hasLink(value, "Run"));
   });

   test("code off leaves no quoted lines", async () => {
      seedFile(CARD_PATH, CARD_TEXT);
      const card = makeCard();
      const config = resolvePreview([{ code: false }]);
      const value = await render(cardNode(card), config);
      assert.ok(!value.includes("> "));
      assert.ok(value.includes("$(folder) Week 1"));
      assert.ok(value.includes("$(list-unordered) 0 lessons"));
   });

   test("actions that do not belong to a card produce no links", async () => {
      seedFile(CARD_PATH, CARD_TEXT);
      const card = makeCard();
      const config = resolvePreview([{ actions: ["run"] }]);
      const value = await render(cardNode(card), config);
      assert.ok(!value.includes(SEPARATOR));
      assert.ok(!value.includes("command:"));
   });

   test("links carry a card ref", async () => {
      const card = makeCard();
      const value = await render(cardNode(card), FULL_PREVIEW);
      const args = linkArgs(value, "Open");
      assert.deepEqual(args, ["open", { kind: "card", json: JSON_PATH, key: "variables.md" }]);
   });
});

describe("HoverCards category", () => {
   test("full config lists the card names", async () => {
      const card = makeCard();
      makeLesson(card);
      const category = makeCategory([card], { description: "First steps" });
      const value = await render(categoryNode(category), FULL_PREVIEW);
      assert.ok(value.startsWith("$(folder) **Week 1**"));
      assert.ok(value.includes("First steps"));
      assert.ok(value.includes("$(book) 1 card"));
      assert.ok(value.includes("$(list-unordered) 1 lesson"));
      assert.ok(value.includes("\n\nvariables.md\n\n"));
      assert.ok(hasLink(value, "Add Card"));
      assert.ok(hasLink(value, "New Card File"));
      assert.ok(hasLink(value, "Rename"));
      assert.ok(hasLink(value, "Preview"));
   });

   test("code off hides the card names but keeps the folder heading", async () => {
      const card = makeCard();
      const category = makeCategory([card]);
      const config = resolvePreview([{ code: false }]);
      const value = await render(categoryNode(category), config);
      assert.ok(value.startsWith("$(folder) **Week 1**"));
      assert.ok(!value.includes("variables.md"));
   });

   test("links carry a category ref", async () => {
      const category = makeCategory([]);
      const value = await render(categoryNode(category), FULL_PREVIEW);
      const args = linkArgs(value, "Rename");
      assert.deepEqual(args, ["rename", { kind: "category", json: JSON_PATH, name: "Week 1" }]);
   });
});

describe("HoverCards visibility", () => {
   test("NO_PREVIEW hides lesson, card and category hovers", async () => {
      const cards = new HoverCards();
      const card = makeCard();
      const lesson = makeLesson(card);
      const category = makeCategory([card]);
      const forLesson = await cards.build(lessonNode(lesson), NO_PREVIEW);
      const forCard = await cards.build(cardNode(card), NO_PREVIEW);
      const forCategory = await cards.build(categoryNode(category), NO_PREVIEW);
      assert.equal(forLesson, undefined);
      assert.equal(forCard, undefined);
      assert.equal(forCategory, undefined);
   });

   test("a day node always renders, even under NO_PREVIEW", async () => {
      const card = makeCard();
      const lesson = makeLesson(card);
      const value = await render(dayNode([lesson]), NO_PREVIEW);
      assert.ok(value.startsWith("$(calendar) **"));
      assert.ok(value.includes("1 lesson"));
      assert.ok(value.includes("variables.md / declare.cs"));
      assert.ok(value.endsWith("Drop a lesson here to set its date."));
      assert.ok(!value.includes("command:"));
   });
});

describe("HoverCards excerpt cache", () => {
   test("a newer mtime refreshes the excerpt and the same mtime keeps it", async () => {
      const cards = new HoverCards();
      const card = makeCard();
      const lesson = makeLesson(card);
      const node = lessonNode(lesson);

      seedFile(LESSON_PATH, "first version", 1000);
      const first = await cards.build(node, FULL_PREVIEW);
      assert.ok(first);
      assert.ok(first.value.includes("first version"));

      seedFile(LESSON_PATH, "second version", 2000);
      const second = await cards.build(node, FULL_PREVIEW);
      assert.ok(second);
      assert.ok(second.value.includes("second version"));
      assert.ok(!second.value.includes("first version"));

      seedFile(LESSON_PATH, "third version", 2000);
      const third = await cards.build(node, FULL_PREVIEW);
      assert.ok(third);
      assert.ok(third.value.includes("second version"));
      assert.ok(!third.value.includes("third version"));
   });

   test("each HoverCards instance has its own cache", async () => {
      const card = makeCard();
      const lesson = makeLesson(card);
      const node = lessonNode(lesson);
      seedFile(LESSON_PATH, "first version", 1000);
      const warm = new HoverCards();
      await warm.build(node, FULL_PREVIEW);
      seedFile(LESSON_PATH, "replaced at the same mtime", 1000);
      const cold = new HoverCards();
      const result = await cold.build(node, FULL_PREVIEW);
      assert.ok(result);
      assert.ok(result.value.includes("replaced at the same mtime"));
   });
});

describe("HoverCards rendering edge cases", () => {
   test("nothing rendered yields undefined instead of an empty hover", async () => {
      const cards = new HoverCards();
      const card = makeCard();
      const lesson = makeLesson(card);
      const config = resolvePreview([{ summary: false, code: true, actions: [] }]);
      const result = await cards.build(lessonNode(lesson), config);
      assert.equal(result, undefined);
   });

   test("card excerpt drops the blank line left behind by the heading", async () => {
      seedFile(CARD_PATH, CARD_TEXT);
      const card = makeCard();
      const value = await render(cardNode(card), FULL_PREVIEW);
      assert.ok(!value.includes("> \n"));
      assert.ok(value.includes("> A variable holds a value."));
   });

   test("a card that is only a heading renders no quote section", async () => {
      seedFile(CARD_PATH, "# Only a heading\n");
      const card = makeCard();
      const value = await render(cardNode(card), FULL_PREVIEW);
      assert.ok(!value.includes("> "));
   });

   test("a lesson containing a triple backtick fence uses a longer fence", async () => {
      seedFile(LESSON_PATH, "var text = \"```\";\nConsole.WriteLine(text);");
      const card = makeCard();
      const lesson = makeLesson(card);
      const value = await render(lessonNode(lesson), FULL_PREVIEW);
      assert.ok(value.includes("````csharp\n"));
      assert.ok(value.endsWith("````") || value.includes("\n````\n"));
   });

   test("parentheses in paths are encoded inside command links", async () => {
      const card = makeCard();
      const lesson = makeLesson(card, {}, "C:/Program Files (x86)/notes (draft).cs");
      const value = await render(lessonNode(lesson), FULL_PREVIEW);
      const encodedPath = encodeURIComponent(JSON.stringify(["open", { kind: "lesson", json: JSON_PATH, cardKey: "variables.md", name: "declare.cs" }]));
      assert.ok(value.includes(encodedPath.replace(/[()]/g, (paren) => (paren === "(" ? "%28" : "%29"))));
      const args = linkArgs(value, "Open") as [string, { name: string }];
      assert.equal(args[0], "open");
      assert.equal(args[1].name, "declare.cs");
   });
});

describe("HoverCards non-markdown cards", () => {
   test("a script card shows a fenced code block instead of a quote", async () => {
      const scriptPath = "C:/library/setup.py";
      seedFile(scriptPath, "# install deps\nimport os\nprint(os.name)");
      const uri = vscode.Uri.file(scriptPath);
      const jsonUri = vscode.Uri.file(JSON_PATH);
      const card: Card = { uri, name: "setup.py", exists: true, meta: {}, lessons: [], jsonUri, key: "setup.py" };
      const value = await render(cardNode(card), FULL_PREVIEW);
      assert.ok(value.includes("```python\n# install deps\nimport os"));
      assert.ok(!value.includes("> "));
   });
});
