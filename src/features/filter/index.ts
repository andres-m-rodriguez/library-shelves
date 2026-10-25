import * as vscode from "vscode";
import type { FeatureContext } from "../../extension";
import { option, orElse } from "../../option";
import { FilterController, STATE_KEY } from "./controller";
import { openFilter } from "./filter";

export function register(ctx: FeatureContext): void {
   const controller = new FilterController(ctx);
   controller.apply(orElse(option(ctx.context.workspaceState.get<string>(STATE_KEY)), ""), false);

   ctx.context.subscriptions.push(
      vscode.commands.registerCommand("library.filter", () => openFilter(ctx, controller)),
      vscode.commands.registerCommand("library.clearFilter", () => controller.clear()),
   );
}
