import * as vscode from "vscode";
import { SHELF_VIEW_TYPE } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { setBackground } from "./background";
import { newLibrary } from "./newLibrary";
import { ShelfEditor } from "./shelfEditor";

export function register(ctx: FeatureContext): void {
   ctx.context.subscriptions.push(
      vscode.window.registerCustomEditorProvider(SHELF_VIEW_TYPE, new ShelfEditor(ctx), {
         webviewOptions: { retainContextWhenHidden: true },
      }),
      vscode.commands.registerCommand("library.newLibrary", () => newLibrary(ctx)),
      vscode.commands.registerCommand("library.setBackground", () => setBackground(ctx)),
   );
}
