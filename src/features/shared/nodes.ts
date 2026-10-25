import * as path from "path";
import type * as vscode from "vscode";
import type { CardMeta, Node } from "../../contracts";
import { flatMap, nonEmpty, none, option, orElse, type Option } from "../../option";
import { parsers } from "../../parsers";
import type { Data } from "../../services";

export function nodeLabel(node: Node): string {
   switch (node.kind) {
      case "category":
         return node.category.name;
      case "day":
         return node.day.key;
      case "card":
         return node.card.name;
      case "lesson":
         return path.basename(node.lesson.uri.fsPath);
   }
}

export function nodeColor(node: Node): Option<string> {
   switch (node.kind) {
      case "category":
         return option(node.category.meta.color);
      case "card":
         return option(node.card.meta.color);
      case "lesson":
         return option(node.lesson.meta.color);
      case "day":
         return none;
   }
}

export function jsonUriOf(node: Node): vscode.Uri {
   switch (node.kind) {
      case "category":
         return node.category.jsonUri;
      case "card":
         return node.card.jsonUri;
      case "lesson":
         return node.lesson.card.jsonUri;
      case "day":
         return node.day.lessons[0].card.jsonUri;
   }
}

export function groupByJson<T extends { jsonUri: vscode.Uri }>(items: T[]): Map<vscode.Uri, T[]> {
   const byPath = new Map<string, { uri: vscode.Uri; items: T[] }>();
   for (const item of items) {
      const group = orElse(option(byPath.get(item.jsonUri.fsPath)), { uri: item.jsonUri, items: [] });
      group.items.push(item);
      byPath.set(item.jsonUri.fsPath, group);
   }
   const entries = [...byPath.values()].map((group): [vscode.Uri, T[]] => [group.uri, group.items]);
   return new Map(entries);
}

export function categoryOf(meta: CardMeta): Option<string> {
   return flatMap(option(meta.category), nonEmpty);
}

export function sameName(a: Option<string>, b: Option<string>): boolean {
   const fold = (o: Option<string>) => (o.some ? o.value.trim().toLowerCase() : "");
   return fold(a) === fold(b);
}

export function nextCardOrder(data: Data, category: Option<string>, excluded: Set<string>): number {
   let highest = 0;
   for (const [key, meta] of parsers.libraryFile.cards(data)) {
      const order = option(meta.order);
      if (!excluded.has(key) && sameName(categoryOf(meta), category) && order.some && order.value > highest) {
         highest = order.value;
      }
   }
   return highest + 1;
}
