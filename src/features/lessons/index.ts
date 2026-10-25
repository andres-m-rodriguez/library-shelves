import * as vscode from "vscode";
import type { Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { option } from "../../option";
import { addLesson } from "./addLesson";
import { clearLessons } from "./clearLessons";
import { newLessonFile } from "./newLessonFile";
import { removeLessons } from "./removeLesson";
import { runLesson, watchTerminal } from "./runLesson";

export { removeLessons } from "./removeLesson";

export function register(ctx: FeatureContext): void {
   ctx.context.subscriptions.push(
      vscode.commands.registerCommand("library.addLesson", (node?: Node) => addLesson(ctx, option(node))),
      vscode.commands.registerCommand("library.newLessonFile", (node?: Node) => newLessonFile(ctx, option(node))),
      vscode.commands.registerCommand("library.removeLesson", (node?: Node) => removeLessons(ctx, option(node))),
      vscode.commands.registerCommand("library.clearLessons", (node?: Node) => clearLessons(ctx, option(node))),
      vscode.commands.registerCommand("library.runLesson", (target?: Node | vscode.Uri) => runLesson(ctx, option(target))),
      watchTerminal(),
   );
}
