import * as path from "path";
import * as vscode from "vscode";
import { CATEGORIES_KEY, FILE_TYPES_KEY, LIBRARY_FILE, SCHEMA_KEY } from "../contracts";
import { parsers } from "../parsers";
import { JsonDocument, isCardMeta, type OpenedDocument } from "./jsonDocument";

export type Rename = { readonly oldUri: vscode.Uri; readonly newUri: vscode.Uri };

export async function statOrUndefined(uri: vscode.Uri): Promise<vscode.FileStat | undefined> {
   try {
      return await vscode.workspace.fs.stat(uri);
   } catch {
      return undefined;
   }
}

export async function exists(uri: vscode.Uri): Promise<boolean> {
   try {
      await vscode.workspace.fs.stat(uri);
      return true;
   } catch {
      return false;
   }
}

export async function isDirectory(uri: vscode.Uri): Promise<boolean> {
   try {
      const stat = await vscode.workspace.fs.stat(uri);
      return (stat.type & vscode.FileType.Directory) !== 0;
   } catch {
      return false;
   }
}

export function toRelative(folder: string, absolute: string): string {
   return parsers.fileName.toRelative(folder, absolute);
}

export async function applyRenames(renames: readonly Rename[]): Promise<void> {
   const jsonFiles = await vscode.workspace.findFiles(`**/${LIBRARY_FILE}`, "**/node_modules/**");
   for (const jsonUri of jsonFiles) {
      const folder = path.dirname(jsonUri.fsPath);
      let opened: OpenedDocument;
      try {
         const doc = await JsonDocument.open(jsonUri);
         opened = { doc, data: doc.data() };
      } catch {
         continue;
      }
      const { doc, data } = opened;
      let changed = false;

      for (const [key, value] of Object.entries(data)) {
         if (key === SCHEMA_KEY || key === CATEGORIES_KEY || key === FILE_TYPES_KEY || !isCardMeta(value)) {
            continue;
         }
         value.lessons?.forEach((lesson, i) => {
            const moved = relocate(path.resolve(folder, lesson.name), renames);
            if (moved) {
               doc.set([key, "lessons", i, "name"], toRelative(folder, moved));
               changed = true;
            }
         });
         const movedCard = relocate(path.resolve(folder, key), renames);
         if (movedCard) {
            const fresh = doc.data()[key];
            doc.remove([key]);
            doc.set([toRelative(folder, movedCard)], fresh);
            changed = true;
         }
      }

      if (changed) {
         await doc.save();
      }
   }
}

function relocate(absolute: string, renames: readonly Rename[]): string | undefined {
   const target = absolute.toLowerCase();
   for (const rename of renames) {
      const oldPath = rename.oldUri.fsPath;
      const oldLower = oldPath.toLowerCase();
      if (target === oldLower) {
         return rename.newUri.fsPath;
      }
      if (target.startsWith(oldLower + path.sep)) {
         return path.join(rename.newUri.fsPath, absolute.slice(oldPath.length + 1));
      }
   }
   return undefined;
}
