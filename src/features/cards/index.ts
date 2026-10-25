import * as vscode from "vscode";
import type { Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { option } from "../../option";
import { addCard } from "./addCard";
import { moveToCategory } from "./moveToCategory";
import { newCardFile } from "./newCardFile";
import { removeCards } from "./removeCard";

export { removeCards } from "./removeCard";

export function register(ctx: FeatureContext): void {
   ctx.context.subscriptions.push(
      vscode.commands.registerCommand("library.addCard", (node?: Node) => addCard(ctx, option(node))),
      vscode.commands.registerCommand("library.newCardFile", (node?: Node) => newCardFile(ctx, option(node))),
      vscode.commands.registerCommand("library.moveToCategory", (node?: Node) => moveToCategory(ctx, option(node))),
      vscode.commands.registerCommand("library.removeCard", (node?: Node) => removeCards(ctx, option(node))),
   );
}
