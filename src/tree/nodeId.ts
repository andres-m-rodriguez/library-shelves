import type { Node } from "../contracts";

export function nodeId(node: Node): string {
   switch (node.kind) {
      case "category":
         return `category:${node.category.name.toLowerCase()}`;
      case "day":
         return `day:${node.day.key}`;
      case "card":
         return `card:${node.card.jsonUri.fsPath}:${node.card.key}`;
      case "lesson":
         return `lesson:${node.lesson.card.jsonUri.fsPath}:${node.lesson.card.key}:${node.lesson.meta.name}`;
   }
}
