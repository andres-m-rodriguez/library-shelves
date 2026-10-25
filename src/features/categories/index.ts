import * as vscode from "vscode";
import type { Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { option } from "../../option";
import { newCategory } from "./newCategory";
import { removeCategory } from "./removeCategory";
import { renameCategory } from "./renameCategory";
import { registerTypedCategories } from "./typedCategories";

export { removeCategory } from "./removeCategory";

export function register(ctx: FeatureContext): void {
   ctx.context.subscriptions.push(
      vscode.commands.registerCommand("library.newCategory", () => newCategory(ctx)),
      vscode.commands.registerCommand("library.renameCategory", (node?: Node) => renameCategory(ctx, option(node))),
      vscode.commands.registerCommand("library.removeCategory", (node?: Node) => removeCategory(ctx, option(node))),
   );
   registerTypedCategories(ctx);
}
