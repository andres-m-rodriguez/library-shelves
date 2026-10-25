import * as path from "path";
import * as vscode from "vscode";
import { parse as parseJsonc } from "jsonc-parser";
import type { IconCatalog, IconDisplay, IconThemeJson } from "../contracts";

export class IconThemeParser {
   parseText(themeId: string, text: string, themeDir: string): IconCatalog {
      const json = parseJsonc(text) as IconThemeJson | undefined;
      return this.parse(themeId, json ?? {}, themeDir);
   }

   parse(themeId: string, json: IconThemeJson, themeDir: string): IconCatalog {
      const display = new Map<string, IconDisplay>();

      for (const [name, id] of Object.entries(json.fileNames ?? {})) {
         if (!display.has(id)) {
            display.set(id, { kind: "file", name });
         }
      }
      for (const [ext, id] of Object.entries(json.fileExtensions ?? {})) {
         if (!display.has(id)) {
            display.set(id, { kind: "file", name: `sample.${ext}` });
         }
      }
      for (const [name, id] of Object.entries(json.folderNames ?? {})) {
         if (!display.has(id)) {
            display.set(id, { kind: "folder", name });
         }
      }
      const preview = new Map<string, vscode.Uri>();
      for (const id of display.keys()) {
         const iconPath = json.iconDefinitions?.[id]?.iconPath;
         if (iconPath) {
            const absolute = path.resolve(themeDir, iconPath);
            preview.set(id, vscode.Uri.file(absolute));
         }
      }
      const ids = [...display.keys()].sort();
      return { themeId, ids, display, preview };
   }
}
