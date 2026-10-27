import * as vscode from "vscode";
import type { Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { writeCardIcon, writeCategoryIcon } from "../../library/writes";
import { none, option, raw, type Option } from "../../option";
import { removeCards } from "../cards";
import { removeCategory } from "../categories";
import { removeLessons } from "../lessons";
import { configurePreview } from "./configurePreview";
import { configureRow } from "./configureRow";
import { editDetails } from "./editDetails";
import { setColor } from "./setColor";

export function register(ctx: FeatureContext): void {
   ctx.context.subscriptions.push(
      vscode.commands.registerCommand("library.editDetails", (node?: Node) => editDetails(ctx, option(node))),
      vscode.commands.registerCommand("library.setColor", (node?: Node) => setColor(ctx, option(node))),
      vscode.commands.registerCommand("library.setIcon", (node?: Node) => setIcon(ctx, option(node))),
      vscode.commands.registerCommand("library.configurePreview", (node?: Node) => configurePreview(ctx, option(node))),
      vscode.commands.registerCommand("library.configureRow", (node?: Node) => configureRow(ctx, option(node))),
      vscode.commands.registerCommand("library.remove", () => removeSelection(ctx)),
   );
}

async function setIcon(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   if (node.some && node.value.kind === "card") {
      const { card } = node.value;
      return ctx.dialogs.pickIcon(ctx.tree, card.name, option(card.meta.icon), (icon) => writeCardIcon(card, raw(icon)));
   }
   if (node.some && node.value.kind === "category") {
      const { category } = node.value;
      return ctx.dialogs.pickIcon(ctx.tree, category.name, option(category.meta.icon), (icon) => writeCategoryIcon(category, raw(icon)));
   }
   ctx.dialogs.info("Right-click a category or card in the Library view to set its icon.");
}

async function removeSelection(ctx: FeatureContext): Promise<void> {
   const first = ctx.selection.first(none);
   if (!first.some) {
      ctx.dialogs.info("Select a lesson, card or category in the Library view to remove it.");
      return;
   }
   switch (first.value.kind) {
      case "lesson":
         return removeLessons(ctx, none);
      case "card":
         return removeCards(ctx, none);
      case "category":
         return removeCategory(ctx, none);
      case "day":
         ctx.dialogs.info("Select a lesson, card or category in the Library view to remove it.");
   }
}
