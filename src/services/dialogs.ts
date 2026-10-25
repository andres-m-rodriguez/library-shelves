import * as vscode from "vscode";
import { pickIcon } from "../library/icons";
import { map, option, raw, type Option } from "../option";
import type { LibraryTree } from "../tree/libraryTree";

const STATUS_MS = 4000;


export interface Confirmation {

   question: string;

   action: string;

   affected: string[];

   keeps: string;

   changes: string;
}


export class Dialogs {
   info(message: string): void {
      void vscode.window.showInformationMessage(message);
   }

   async warn(message: string, ...actions: string[]): Promise<Option<string>> {
      const choice = await vscode.window.showWarningMessage(message, ...actions);
      return option(choice);
   }

   async ask(message: string, ...actions: string[]): Promise<Option<string>> {
      const choice = await vscode.window.showWarningMessage(message, { modal: true }, ...actions);
      return option(choice);
   }

   async confirm({ question, action, affected, keeps, changes }: Confirmation): Promise<boolean> {
      const detail = [affected.join("\n"), `${keeps} ${changes}`].filter(Boolean).join("\n\n");
      const choice = await vscode.window.showWarningMessage(question, { modal: true, detail }, action);
      return choice === action;
   }

   status(text: string): void {
      vscode.window.setStatusBarMessage(`Library: ${text}`, STATUS_MS);
   }


   async input(options: vscode.InputBoxOptions): Promise<Option<string>> {
      const typed = await vscode.window.showInputBox(options);
      return map(option(typed), (text) => text.trim());
   }

   async pick<T extends vscode.QuickPickItem>(items: T[], options: vscode.QuickPickOptions): Promise<Option<T>> {
      const pick = await vscode.window.showQuickPick(items, options);
      return option(pick);
   }

   async pickMany<T extends vscode.QuickPickItem>(items: T[], options: vscode.QuickPickOptions): Promise<Option<T[]>> {
      const picks = await vscode.window.showQuickPick(items, { ...options, canPickMany: true });
      return option(picks);
   }


   pickIcon(tree: LibraryTree, label: string, current: Option<string>, write: (icon: Option<string>) => Promise<void>): Promise<void> {
      return pickIcon(tree.icons, label, raw(current), (icon) => write(option(icon)));
   }


   pickManyInOrder<T extends vscode.QuickPickItem>(items: T[], placeholder: string): Promise<T[]> {
      return new Promise((resolve) => {
         const quickPick = vscode.window.createQuickPick<T>();
         quickPick.items = items;
         quickPick.canSelectMany = true;
         quickPick.matchOnDescription = true;
         quickPick.placeholder = placeholder;
         let ordered: T[] = [];
         quickPick.onDidChangeSelection((selected) => {
            ordered = [...ordered.filter((item) => selected.includes(item)), ...selected.filter((item) => !ordered.includes(item))];
         });
         quickPick.onDidAccept(() => {
            quickPick.hide();
            resolve(ordered);
         });
         quickPick.onDidHide(() => {
            quickPick.dispose();
            resolve([]);
         });
         quickPick.show();
      });
   }
}

export function plural(count: number, word: string): string {
   return `${count} ${word}${count === 1 ? "" : "s"}`;
}
