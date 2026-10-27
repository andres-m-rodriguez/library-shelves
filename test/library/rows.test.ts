import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import type { RowSetting } from "../../src/contracts";
import { dayKey, longDate, parseDay } from "../../src/dates";
import { DATE_FORMATS, DEFAULT_ROW, SMART_DATE, formatDay, resolveRow, sanitizeRow } from "../../src/library/rows";

const MONDAY = "2026-10-19";
const EARLY_MARCH = "2026-03-05";
const DAY_MS = 86_400_000;

function localeName(key: string, options: Intl.DateTimeFormatOptions): string {
   const date = parseDay(key);
   return date.toLocaleDateString(undefined, options);
}

describe("resolveRow", () => {
   test("no layers yields the default row", () => {
      const resolved = resolveRow([]);
      assert.deepEqual(resolved, { label: "fileName", parts: ["title", "description"], date: SMART_DATE });
      assert.deepEqual(resolved, DEFAULT_ROW);
      assert.notEqual(resolved, DEFAULT_ROW);
   });

   test("undefined layers are skipped", () => {
      const resolved = resolveRow([undefined, undefined]);
      assert.deepEqual(resolved, DEFAULT_ROW);
   });

   test("file type, category, card and lesson layers merge per key with later layers winning", () => {
      const fileType: RowSetting = { date: "YYYY-MM-DD" };
      const category: RowSetting = { label: "title", parts: ["date"] };
      const card: RowSetting = { date: "MM/DD" };
      const lesson: RowSetting = { parts: ["description", "tags"] };
      const resolved = resolveRow([fileType, category, card, lesson]);
      assert.deepEqual(resolved, { label: "title", parts: ["description", "tags"], date: "MM/DD" });
   });

   test("a later layer only overrides the keys it sets", () => {
      const resolved = resolveRow([{ label: "title", date: "M/D" }, { parts: ["tags"] }]);
      assert.deepEqual(resolved, { label: "title", parts: ["tags"], date: "M/D" });
   });

   test("an empty object layer changes nothing", () => {
      const resolved = resolveRow([{ label: "title" }, {}]);
      assert.deepEqual(resolved, { label: "title", parts: ["title", "description"], date: SMART_DATE });
   });

   test("malformed layers passed as unknown are ignored", () => {
      const layers = [null, "title", 7, ["title"], true] as unknown as (RowSetting | undefined)[];
      const resolved = resolveRow(layers);
      assert.deepEqual(resolved, DEFAULT_ROW);
   });

   test("invalid keys inside a layer are dropped while valid keys apply", () => {
      const layer = { label: "bogus", parts: ["date", 4, "nope"], date: "   " } as unknown as RowSetting;
      const resolved = resolveRow([layer]);
      assert.deepEqual(resolved, { label: "fileName", parts: ["date"], date: SMART_DATE });
   });

   test("the result never aliases the shared default", () => {
      const resolved = resolveRow([{ parts: ["tags"] }]);
      resolved.parts.push("date");
      assert.deepEqual(DEFAULT_ROW.parts, ["title", "description"]);
   });
});

describe("sanitizeRow", () => {
   test("returns undefined for null", () => {
      assert.equal(sanitizeRow(null), undefined);
   });

   test("returns undefined for arrays", () => {
      assert.equal(sanitizeRow(["title"]), undefined);
   });

   test("returns undefined for strings", () => {
      assert.equal(sanitizeRow("title"), undefined);
   });

   test("keeps a complete valid setting", () => {
      const clean = sanitizeRow({ label: "title", parts: ["date", "tags"], date: "DD/MM" });
      assert.deepEqual(clean, { label: "title", parts: ["date", "tags"], date: "DD/MM" });
   });

   test("drops an invalid label value", () => {
      const clean = sanitizeRow({ label: "description" });
      assert.deepEqual(clean, {});
   });

   test("drops non-string parts", () => {
      const clean = sanitizeRow({ parts: ["title", 3, null, "date"] });
      assert.deepEqual(clean, { parts: ["title", "date"] });
   });

   test("drops unknown part names", () => {
      const clean = sanitizeRow({ parts: ["title", "author", "date"] });
      assert.deepEqual(clean, { parts: ["title", "date"] });
   });

   test("a non-array parts value is dropped", () => {
      const clean = sanitizeRow({ parts: "title" });
      assert.deepEqual(clean, {});
   });

   test("drops a blank date string", () => {
      const clean = sanitizeRow({ date: "   " });
      assert.deepEqual(clean, {});
   });

   test("drops a non-string date", () => {
      const clean = sanitizeRow({ date: 20261019 });
      assert.deepEqual(clean, {});
   });

   test("trims the date pattern", () => {
      const clean = sanitizeRow({ date: "  MM/DD " });
      assert.deepEqual(clean, { date: "MM/DD" });
   });

   test("an empty object stays empty", () => {
      assert.deepEqual(sanitizeRow({}), {});
   });
});

describe("formatDay fixed patterns", () => {
   test("YYYY-MM-DD", () => {
      assert.equal(formatDay(MONDAY, "YYYY-MM-DD"), "2026-10-19");
   });

   test("MM/DD", () => {
      assert.equal(formatDay(MONDAY, "MM/DD"), "10/19");
   });

   test("M/D", () => {
      assert.equal(formatDay(MONDAY, "M/D"), "10/19");
   });

   test("DD/MM", () => {
      assert.equal(formatDay(MONDAY, "DD/MM"), "19/10");
   });

   test("MM/DD/YYYY", () => {
      assert.equal(formatDay(MONDAY, "MM/DD/YYYY"), "10/19/2026");
   });

   test("DD/MM/YYYY", () => {
      assert.equal(formatDay(MONDAY, "DD/MM/YYYY"), "19/10/2026");
   });

   test("DD.MM.YYYY", () => {
      assert.equal(formatDay(MONDAY, "DD.MM.YYYY"), "19.10.2026");
   });

   test("MMM D", () => {
      const shortMonth = localeName(MONDAY, { month: "short" });
      assert.equal(formatDay(MONDAY, "MMM D"), `${shortMonth} 19`);
   });

   test("D MMM", () => {
      const shortMonth = localeName(MONDAY, { month: "short" });
      assert.equal(formatDay(MONDAY, "D MMM"), `19 ${shortMonth}`);
   });

   test("MMM D, YYYY", () => {
      const shortMonth = localeName(MONDAY, { month: "short" });
      assert.equal(formatDay(MONDAY, "MMM D, YYYY"), `${shortMonth} 19, 2026`);
   });

   test("ddd, MMM D", () => {
      const shortWeekday = localeName(MONDAY, { weekday: "short" });
      const shortMonth = localeName(MONDAY, { month: "short" });
      assert.equal(formatDay(MONDAY, "ddd, MMM D"), `${shortWeekday}, ${shortMonth} 19`);
   });

   test("dddd", () => {
      const longWeekday = localeName(MONDAY, { weekday: "long" });
      assert.equal(formatDay(MONDAY, "dddd"), longWeekday);
   });

   test("MMMM", () => {
      const longMonth = localeName(MONDAY, { month: "long" });
      assert.equal(formatDay(MONDAY, "MMMM"), longMonth);
   });

   test("english names for the monday in october", { skip: !isEnglishLocale() }, () => {
      assert.equal(formatDay(MONDAY, "MMM D"), "Oct 19");
      assert.equal(formatDay(MONDAY, "ddd, MMM D"), "Mon, Oct 19");
      assert.equal(formatDay(MONDAY, "dddd"), "Monday");
   });

   test("two digit tokens keep leading zeros", () => {
      assert.equal(formatDay(EARLY_MARCH, "MM/DD"), "03/05");
   });

   test("single letter tokens drop leading zeros", () => {
      assert.equal(formatDay(EARLY_MARCH, "M/D"), "3/5");
   });

   test("YY gives the two digit year", () => {
      assert.equal(formatDay(EARLY_MARCH, "YY"), "26");
   });

   test("literal text between tokens is preserved", () => {
      assert.equal(formatDay(MONDAY, "D of M"), "19 of 10");
      assert.equal(formatDay(MONDAY, "[D] (M) YY!"), "[19] (10) 26!");
   });

   test("a pattern without tokens is returned as written", () => {
      assert.equal(formatDay(MONDAY, "no tokens here"), "no tokens here");
   });
});

describe("formatDay smart pattern", () => {
   test("today's key reads Today", () => {
      const today = dayKey(Date.now());
      assert.equal(formatDay(today, SMART_DATE), "Today");
   });

   test("yesterday's key reads Yesterday", () => {
      const yesterday = dayKey(Date.now() - DAY_MS);
      assert.equal(formatDay(yesterday, SMART_DATE), "Yesterday");
   });

   test("a key thirty days ago reads as the long date", () => {
      const key = dayKey(Date.now() - 30 * DAY_MS);
      assert.equal(formatDay(key, SMART_DATE), longDate(key));
   });
});

describe("DATE_FORMATS", () => {
   test("every pattern is unique", () => {
      const patterns = DATE_FORMATS.map((format) => format.pattern);
      const unique = new Set(patterns);
      assert.equal(unique.size, patterns.length);
   });

   test("the smart pattern comes first", () => {
      assert.equal(DATE_FORMATS[0].pattern, SMART_DATE);
   });

   test("every pattern has a label", () => {
      for (const format of DATE_FORMATS) {
         assert.ok(format.label.trim().length > 0, format.pattern);
      }
   });

   test("every fixed pattern formats the monday to something other than itself", () => {
      const fixed = DATE_FORMATS.filter((format) => format.pattern !== SMART_DATE);
      for (const format of fixed) {
         const formatted = formatDay(MONDAY, format.pattern);
         assert.notEqual(formatted, format.pattern, format.pattern);
      }
   });
});

function isEnglishLocale(): boolean {
   return localeName(MONDAY, { month: "short" }) === "Oct";
}
