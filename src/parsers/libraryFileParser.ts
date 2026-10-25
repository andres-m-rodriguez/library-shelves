import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";
import {
   CATEGORIES_KEY,
   SCHEMA_KEY,
   type CardMeta,
   type CategoryMeta,
   type LessonMeta,
   type LibraryFile,
   type ParseIssue,
   type ParseResult,
} from "../contracts";

export class LibraryFileParser {
   parseRoot(text: string): Record<string, unknown> {
      const errors: ParseError[] = [];
      const parsed: unknown = parseJsonc(text, errors, { allowTrailingComma: true });
      if (errors.length) {
         const first = errors[0];
         const line = text.slice(0, first.offset).split("\n").length;
         throw new Error(`${printParseErrorCode(first.error)} at line ${line}`);
      }
      if (!isPlainObject(parsed)) {
         throw new Error("expected an object whose keys are markdown files");
      }
      return parsed;
   }

   parse(text: string): ParseResult<LibraryFile> {
      return this.fromRoot(this.parseRoot(text));
   }

   fromRoot(root: Record<string, unknown>): ParseResult<LibraryFile> {
      const value: LibraryFile = { cards: {}, categories: {} };
      const issues: ParseIssue[] = [];
      for (const [key, raw] of Object.entries(root)) {
         if (key === SCHEMA_KEY) {
            continue;
         }
         if (key === CATEGORIES_KEY) {
            this.readCategories(raw, value, issues);
            continue;
         }
         if (this.isCardMeta(raw)) {
            value.cards[key] = raw;
         } else {
            issues.push({ message: `"${key}" is not a card: expected an object with an optional lessons array` });
         }
      }
      return { value, issues };
   }

   *cards(root: Record<string, unknown>): IterableIterator<[string, CardMeta]> {
      for (const [key, raw] of Object.entries(root)) {
         if (key !== SCHEMA_KEY && key !== CATEGORIES_KEY && this.isCardMeta(raw)) {
            yield [key, raw];
         }
      }
   }

   categoriesOf(root: Record<string, unknown>): Record<string, CategoryMeta> {
      const block = root[CATEGORIES_KEY];
      const categories: Record<string, CategoryMeta> = {};
      if (!isPlainObject(block)) {
         return categories;
      }
      for (const [name, raw] of Object.entries(block)) {
         if (this.isCategoryMeta(raw)) {
            categories[name] = raw;
         }
      }
      return categories;
   }

   categoryKey(root: Record<string, unknown>, name: string): string | undefined {
      const wanted = name.trim().toLowerCase();
      return Object.keys(this.categoriesOf(root)).find((key) => key.trim().toLowerCase() === wanted);
   }

   lessonIndex(root: Record<string, unknown>, cardKey: string, lessonName: string): number {
      const card = root[cardKey];
      if (!this.isCardMeta(card) || !card.lessons) {
         return -1;
      }
      return card.lessons.findIndex((lesson) => lesson.name === lessonName);
   }

   isCardMeta(value: unknown): value is CardMeta {
      if (!isPlainObject(value)) {
         return false;
      }
      const lessons = (value as CardMeta).lessons;
      return lessons === undefined || (Array.isArray(lessons) && lessons.every((l) => this.isLessonMeta(l)));
   }

   isLessonMeta(value: unknown): value is LessonMeta {
      return isPlainObject(value) && typeof value.name === "string";
   }

   isCategoryMeta(value: unknown): value is CategoryMeta {
      return isPlainObject(value);
   }

   private readCategories(raw: unknown, into: LibraryFile, issues: ParseIssue[]): void {
      if (!isPlainObject(raw)) {
         issues.push({ message: `${CATEGORIES_KEY} must be an object keyed by category name` });
         return;
      }
      for (const [name, meta] of Object.entries(raw)) {
         if (this.isCategoryMeta(meta)) {
            into.categories[name] = meta;
         } else {
            issues.push({ message: `${CATEGORIES_KEY}["${name}"] must be an object` });
         }
      }
   }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
   return typeof value === "object" && value !== null && !Array.isArray(value);
}
