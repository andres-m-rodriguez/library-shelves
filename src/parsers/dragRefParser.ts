import type * as vscode from "vscode";
import { TREE_MIME, type DragRef } from "../contracts";

export class DragRefParser {
   fromTransfer(dataTransfer: vscode.DataTransfer): DragRef[] | undefined {
      const item = dataTransfer.get(TREE_MIME);
      if (!item) {
         return undefined;
      }
      return this.parse(item.value);
   }

   parse(value: unknown): DragRef[] {
      if (!Array.isArray(value)) {
         return [];
      }
      return value.filter((entry): entry is DragRef => this.isDragRef(entry));
   }

   private isDragRef(value: unknown): value is DragRef {
      if (typeof value !== "object" || value === null) {
         return false;
      }
      const ref = value as Partial<DragRef>;
      if (typeof ref.json !== "string") {
         return false;
      }
      if (ref.kind === "category") {
         return typeof ref.name === "string";
      }
      if (ref.kind === "card") {
         return typeof ref.key === "string";
      }
      if (ref.kind === "lesson") {
         return typeof ref.cardKey === "string" && typeof ref.name === "string";
      }
      return false;
   }
}
