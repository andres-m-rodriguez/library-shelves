import * as path from "path";
import type * as vscode from "vscode";
import { CATEGORIES_KEY, FILE_TYPES_KEY, type Card, type CardNode, type JsonPath, type Lesson, type LessonNode, type Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { extensionOf, normalizeExtension } from "../../library/preview";
import { none, option, orElse, some, type Option } from "../../option";
import { parsers } from "../../parsers";
import type { Data } from "../../services";
import { categoryOf } from "../shared/nodes";

export type RowNode = Exclude<Node, { kind: "day" }>;

export type Scope =
   | { role: "lesson"; lesson: Lesson }
   | { role: "card"; card: Card }
   | { role: "category"; name: string }
   | { role: "fileType"; extension: string };

export type SettingField = "preview" | "row";

type ScopeItem = vscode.QuickPickItem & Scope;

const LAYER_INDEX: Record<Scope["role"], number> = { fileType: 0, category: 1, card: 2, lesson: 3 };

export function layerIndex(row: RowNode, scope: Scope): number {
   return row.kind === "category" ? 0 : LAYER_INDEX[scope.role];
}

export async function pickScope(ctx: FeatureContext, row: RowNode, subject: string): Promise<Option<Scope>> {
   if (row.kind === "category") {
      return some({ role: "category", name: row.category.name });
   }
   const items = row.kind === "lesson" ? lessonScopes(row) : cardScopes(row);
   const pick = await ctx.dialogs.pick(items, { placeHolder: `Which rows should this ${subject} setting apply to?`, matchOnDescription: true });
   return pick;
}

export function scopeLabel(scope: Scope): string {
   switch (scope.role) {
      case "lesson":
         return path.basename(scope.lesson.uri.fsPath);
      case "card":
         return scope.card.name;
      case "category":
         return `category ${scope.name}`;
      case "fileType":
         return `${scope.extension} files`;
   }
}

export function settingPathOf(data: Data, scope: Scope, field: SettingField): Option<JsonPath> {
   switch (scope.role) {
      case "lesson": {
         const index = parsers.libraryFile.lessonIndex(data, scope.lesson.card.key, scope.lesson.meta.name);
         return index < 0 ? none : some([scope.lesson.card.key, "lessons", index, field]);
      }
      case "card":
         return parsers.libraryFile.isCardMeta(data[scope.card.key]) ? some([scope.card.key, field]) : none;
      case "category": {
         const key = orElse(option(parsers.libraryFile.categoryKey(data, scope.name)), scope.name);
         return some([CATEGORIES_KEY, key, field]);
      }
      case "fileType": {
         const existing = Object.keys(parsers.libraryFile.fileTypesOf(data)).find((key) => normalizeExtension(key) === scope.extension);
         return some([FILE_TYPES_KEY, orElse(option(existing), scope.extension), field]);
      }
   }
}

function lessonScopes(row: LessonNode): ScopeItem[] {
   const { lesson } = row;
   const fileName = path.basename(lesson.uri.fsPath);
   const items: ScopeItem[] = [{ role: "lesson", lesson, label: "This lesson", description: `only ${fileName}` }];
   items.push(...fileTypeScope(fileName, "every lesson of this type in this library.json"));
   items.push({ role: "card", card: lesson.card, label: `Card ${lesson.card.name}`, description: "every lesson in this card" });
   items.push(...categoryScope(lesson.card));
   return items;
}

function cardScopes(row: CardNode): ScopeItem[] {
   const { card } = row;
   const fileName = path.basename(card.uri.fsPath);
   const items: ScopeItem[] = [{ role: "card", card, label: "This card", description: `${card.name} and its lessons` }];
   items.push(...fileTypeScope(fileName, "every file of this type in this library.json"));
   items.push(...categoryScope(card));
   return items;
}

function fileTypeScope(fileName: string, description: string): ScopeItem[] {
   const extension = extensionOf(fileName);
   if (!extension) {
      return [];
   }
   return [{ role: "fileType", extension, label: `All ${extension} files`, description }];
}

function categoryScope(card: Card): ScopeItem[] {
   const category = categoryOf(card.meta);
   if (!category.some) {
      return [];
   }
   return [{ role: "category", name: category.value, label: `Category ${category.value}`, description: "every card and lesson in this category" }];
}
