import * as path from "path";
import * as vscode from "vscode";
import type { Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { none, option, orElse, some, type Option } from "../../option";

const TERMINAL_NAME = "Library";
const DEFAULT_COMMAND = 'dotnet run "${file}"';

let terminal: Option<vscode.Terminal> = none;

export function watchTerminal(): vscode.Disposable {
   return vscode.window.onDidCloseTerminal((closed) => {
      if (terminal.some && closed === terminal.value) {
         terminal = none;
      }
   });
}


export function runLesson(ctx: FeatureContext, target: Option<Node | vscode.Uri>): void {
   const uri = uriOf(target);
   if (!uri.some) {
      ctx.dialogs.info("Open or select a lesson file to run.");
      return;
   }
   const template = orElse(option(vscode.workspace.getConfiguration("library").get<string>("runCommand")), DEFAULT_COMMAND);
   const open = terminal.some && !terminal.value.exitStatus ? terminal.value : vscode.window.createTerminal({ name: TERMINAL_NAME, cwd: path.dirname(uri.value.fsPath) });
   terminal = some(open);
   open.show(true);
   open.sendText(template.replace("${file}", uri.value.fsPath), true);
}

function uriOf(target: Option<Node | vscode.Uri>): Option<vscode.Uri> {
   if (!target.some) {
      const editor = option(vscode.window.activeTextEditor);
      return editor.some ? some(editor.value.document.uri) : none;
   }
   if (target.value instanceof vscode.Uri) {
      return some(target.value);
   }
   return target.value.kind === "lesson" ? some(target.value.lesson.uri) : none;
}
