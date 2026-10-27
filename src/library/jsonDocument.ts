import * as vscode from "vscode";
import { applyEdits, findNodeAtLocation, modify, parseTree } from "jsonc-parser";
import { LIBRARY_FILE, type CardMeta, type CategoryMeta, type JsonPath, type LibraryFile } from "../contracts";
import { parsers } from "../parsers";

export const FORMAT = { formattingOptions: { tabSize: 2, insertSpaces: true, eol: "\n" } };

export class JsonDocument {
   constructor(readonly uri: vscode.Uri, private text: string) {}

   static async open(uri: vscode.Uri): Promise<JsonDocument> {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(bytes).toString("utf8");
      return new JsonDocument(uri, text);
   }

   data(): Record<string, unknown> {
      return parsers.libraryFile.parseRoot(this.text);
   }

   textOf(): string {
      return this.text;
   }

   set(jsonPath: JsonPath, value: unknown): void {
      if (value === undefined && this.removeDirectly(jsonPath)) {
         return;
      }
      const edits = modify(this.text, jsonPath, value, FORMAT);
      this.text = applyEdits(this.text, edits);
   }

   remove(jsonPath: JsonPath): void {
      this.set(jsonPath, undefined);
   }

   private removeDirectly(jsonPath: JsonPath): boolean {
      if (!jsonPath.length) {
         return false;
      }
      const root = parseTree(this.text, [], { allowTrailingComma: true });
      const parent = root ? findNodeAtLocation(root, jsonPath.slice(0, -1)) : undefined;
      if (!parent) {
         return true;
      }
      const lastSegment = jsonPath[jsonPath.length - 1];
      const onlyProperty = parent.type === "object" && typeof lastSegment === "string" && parent.children?.length === 1;
      if (!onlyProperty || findNodeAtLocation(parent, [lastSegment]) === undefined) {
         return false;
      }
      const inner = { offset: parent.offset + 1, length: parent.length - 2, content: "" };
      this.text = applyEdits(this.text, [inner]);
      return true;
   }

   async save(): Promise<void> {
      const bytes = Buffer.from(this.text, "utf8");
      await vscode.workspace.fs.writeFile(this.uri, bytes);
   }
}

export interface OpenedDocument {
   doc: JsonDocument;
   data: Record<string, unknown>;
}

export function isCardMeta(value: unknown): value is CardMeta {
   return parsers.libraryFile.isCardMeta(value);
}

export function isCategoryMeta(value: unknown): value is CategoryMeta {
   return parsers.libraryFile.isCategoryMeta(value);
}

export function warn(error: unknown): void {
   const message = error instanceof Error ? error.message : String(error);
   vscode.window.showWarningMessage(`${LIBRARY_FILE}: ${message}`);
}

export async function readMapping(uri: vscode.Uri): Promise<LibraryFile> {
   try {
      const doc = await JsonDocument.open(uri);
      return parsers.libraryFile.parse(doc.textOf()).value;
   } catch (error) {
      warn(error);
      return { cards: {}, categories: {}, fileTypes: {} };
   }
}

export async function openForEdit(uri: vscode.Uri): Promise<OpenedDocument | undefined> {
   try {
      const doc = await JsonDocument.open(uri);
      return { doc, data: doc.data() };
   } catch (error) {
      warn(error);
      return undefined;
   }
}
