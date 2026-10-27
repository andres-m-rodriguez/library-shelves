import * as vscode from "vscode";
import type { HoverAction, HoverRef, Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { none, option, some, type Option } from "../../option";
import { HOVER_ACTION_COMMAND } from "../../tree/hoverCards";

const COMMANDS: Record<Exclude<HoverAction, "open" | "openCard">, string> = {
   run: "library.runLesson",
   editDetails: "library.editDetails",
   addLesson: "library.addLesson",
   addCard: "library.addCard",
   newCardFile: "library.newCardFile",
   rename: "library.renameCategory",
   moveToCategory: "library.moveToCategory",
   setIcon: "library.setIcon",
   setColor: "library.setColor",
   configurePreview: "library.configurePreview",
};

export function register(ctx: FeatureContext): void {
   ctx.context.subscriptions.push(
      vscode.commands.registerCommand(HOVER_ACTION_COMMAND, (action: HoverAction, ref: HoverRef) => dispatch(ctx, action, ref)),
   );
}

async function dispatch(ctx: FeatureContext, action: HoverAction, ref: HoverRef): Promise<void> {
   const node = option(ctx.tree.resolveRef(ref));
   if (!node.some) {
      ctx.dialogs.info("That row is no longer in the library. Hover again after the view refreshes.");
      return;
   }
   switch (action) {
      case "open": {
         const uri = fileOf(node.value);
         if (uri.some) {
            await vscode.commands.executeCommand("vscode.open", uri.value);
         }
         return;
      }
      case "openCard": {
         const card = ctx.selection.cardOf(node);
         if (card.some) {
            await vscode.commands.executeCommand("vscode.open", card.value.uri);
         }
         return;
      }
      default:
         await vscode.commands.executeCommand(COMMANDS[action], node.value);
   }
}

function fileOf(node: Node): Option<vscode.Uri> {
   switch (node.kind) {
      case "lesson":
         return some(node.lesson.uri);
      case "card":
         return some(node.card.uri);
      default:
         return none;
   }
}
