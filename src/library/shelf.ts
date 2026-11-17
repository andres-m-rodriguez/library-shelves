import * as path from "path";
import type { Card, Category, Lesson, Node, ShelfCard, ShelfLesson, ShelfModel, ShelfRef } from "../contracts";
import { parsers } from "../parsers";
import { dependenciesOf, positionOf } from "./graph";
import { isRunnable } from "./running";

// The shelf view of one library file: its categories as shelves and its cards as tiles.
export function buildShelf(libraryPath: string, categories: Category[], uncategorized: Card[]): ShelfModel {
   const model: ShelfModel = { categories: [], uncategorized: [] };
   for (const category of categories) {
      if (!onShelf(libraryPath, category)) {
         continue;
      }
      model.categories.push({
         name: category.name,
         description: category.meta.description ?? "",
         color: cssColor(category.meta.color),
         cards: category.cards.filter((card) => samePath(card.jsonUri.fsPath, libraryPath)).map(toShelfCard),
      });
   }
   model.uncategorized = uncategorized.filter((card) => samePath(card.jsonUri.fsPath, libraryPath)).map(toShelfCard);
   return model;
}

export function resolveShelfRef(libraryPath: string, categories: Category[], uncategorized: Card[], ref: ShelfRef): Node | undefined {
   if (ref.kind === "category") {
      const wanted = ref.name.trim().toLowerCase();
      const category = categories.find((c) => c.name.toLowerCase() === wanted && onShelf(libraryPath, c));
      return category ? { kind: "category", category } : undefined;
   }
   const cards = [...categories.flatMap((c) => c.cards), ...uncategorized].filter((card) => samePath(card.jsonUri.fsPath, libraryPath));
   if (ref.kind === "card") {
      const card = cards.find((c) => c.key === ref.key);
      return card ? { kind: "card", card } : undefined;
   }
   const lesson = cards.find((c) => c.key === ref.cardKey)?.lessons.find((l) => l.meta.name === ref.name);
   return lesson ? { kind: "lesson", lesson } : undefined;
}

// A theme color id like charts.red is exposed to webviews as the CSS variable --vscode-charts-red.
export function cssColor(raw: string | undefined): string {
   const spec = parsers.color.parse(raw);
   if (!spec) {
      return "";
   }
   const id = spec.kind === "named" ? spec.themeId : spec.id;
   return `var(--vscode-${id.replace(/\./g, "-")})`;
}

function onShelf(libraryPath: string, category: Category): boolean {
   return samePath(category.jsonUri.fsPath, libraryPath) || category.cards.some((card) => samePath(card.jsonUri.fsPath, libraryPath));
}

function samePath(a: string, b: string): boolean {
   return a.toLowerCase() === b.toLowerCase();
}

function toShelfCard(card: Card): ShelfCard {
   return {
      key: card.key,
      label: card.meta.title || card.name,
      fileName: card.name,
      description: card.meta.description ?? "",
      color: cssColor(card.meta.color),
      exists: card.exists,
      runnable: isRunnable(card.uri.fsPath),
      lessons: card.lessons.map(toShelfLesson),
      dependsOn: dependenciesOf(card.meta),
      position: positionOf(card.meta),
   };
}

function toShelfLesson(lesson: Lesson): ShelfLesson {
   const fileName = path.basename(lesson.uri.fsPath);
   return {
      name: lesson.meta.name,
      label: lesson.meta.title || fileName,
      fileName,
      detail: lesson.meta.description ?? "",
      tags: (lesson.meta.tags ?? []).filter((tag) => typeof tag === "string"),
      color: cssColor(lesson.meta.color),
      exists: lesson.exists,
      runnable: isRunnable(lesson.uri.fsPath),
   };
}
