import type * as vscode from "vscode";

export interface IconThemeJson {
   iconDefinitions?: Record<string, { iconPath?: string }>;
   fileNames?: Record<string, string>;
   fileExtensions?: Record<string, string>;
   folderNames?: Record<string, string>;
}

export interface IconDisplay {
   kind: "file" | "folder";
   name: string;
}

export interface IconCatalog {
   themeId: string | undefined;
   ids: string[];
   display: Map<string, IconDisplay>;
   preview: Map<string, vscode.Uri>;
}

export type IconSpec =
   | { kind: "codicon"; name: string }
   | { kind: "theme"; id: string };
