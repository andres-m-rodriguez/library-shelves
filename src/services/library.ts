import * as vscode from "vscode";
import { type JsonPath, LIBRARY_FILE, LIBRARY_GLOB } from "../contracts";
import { type JsonDocument, openForEdit } from "../library/jsonDocument";
import { map, none, option, some, type Option } from "../option";
import type { Dialogs } from "./dialogs";

export type Data = Record<string, unknown>;

export interface Opened {
   doc: JsonDocument;
   data: Data;
}

export const EXCLUDE_GLOB = "**/{node_modules,bin,obj,.git}/**";

export function setOption(doc: JsonDocument, jsonPath: JsonPath, value: Option<unknown>): void {
   if (value.some) {
      doc.set(jsonPath, value.value);
   } else {
      doc.remove(jsonPath);
   }
}

export class Library {
   constructor(private readonly dialogs: Dialogs) {}

   async open(uri: vscode.Uri): Promise<Option<Opened>> {
      const opened = await openForEdit(uri);
      return option(opened);
   }

   async edit(uri: vscode.Uri, edit: (doc: JsonDocument, data: Data) => void): Promise<boolean> {
      const opened = await this.open(uri);
      if (!opened.some) {
         return false;
      }
      edit(opened.value.doc, opened.value.data);
      await opened.value.doc.save();
      return true;
   }

   batch(): Batch {
      return new Batch(this);
   }

   async find(): Promise<Option<vscode.Uri>> {
      const found = await vscode.workspace.findFiles(LIBRARY_GLOB, EXCLUDE_GLOB);
      if (found.length === 0) {
         void this.dialogs.warn(`No ${LIBRARY_FILE} in the workspace. Create one next to your card files first.`);
         return none;
      }
      if (found.length === 1) {
         return some(found[0]);
      }
      // With several libraries, the one open in the active tab is the one being worked on.
      const active = activeTabUri();
      if (active.some && found.some((uri) => uri.fsPath.toLowerCase() === active.value.fsPath.toLowerCase())) {
         return active;
      }
      const pick = await this.dialogs.pick(
         found.map((uri) => ({ label: vscode.workspace.asRelativePath(uri, true), uri })),
         { placeHolder: `Which ${LIBRARY_FILE}?` },
      );
      return map(pick, (item) => item.uri);
   }
}

function activeTabUri(): Option<vscode.Uri> {
   const tab = option(vscode.window.tabGroups.activeTabGroup.activeTab);
   if (!tab.some) {
      return none;
   }
   const input: unknown = tab.value.input;
   return input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText ? some(input.uri) : none;
}

export class Batch {
   private readonly docs = new Map<string, Opened>();

   constructor(private readonly library: Library) {}

   async open(uri: vscode.Uri): Promise<Option<Opened>> {
      const cached = option(this.docs.get(uri.fsPath));
      if (cached.some) {
         return cached;
      }
      const opened = await this.library.open(uri);
      if (opened.some) {
         this.docs.set(uri.fsPath, opened.value);
      }
      return opened;
   }

   async saveAll(): Promise<void> {
      for (const { doc } of this.docs.values()) {
         await doc.save();
      }
   }
}
