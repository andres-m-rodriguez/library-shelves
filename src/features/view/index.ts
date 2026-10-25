import * as vscode from "vscode";
import type { FeatureContext } from "../../extension";
import { VIEW_MODES } from "../../tree/viewModes";

export function register(ctx: FeatureContext): void {
   ctx.context.subscriptions.push(
      vscode.commands.registerCommand("library.sortBy", () => sortBy(ctx)),
      vscode.commands.registerCommand("library.refresh", () => ctx.reload()),
   );
}

async function sortBy(ctx: FeatureContext): Promise<void> {
   const pick = await ctx.dialogs.pick(
      VIEW_MODES.map((m) => ({
         label: `$(${m.icon}) ${m.label}`,
         detail: m.detail,
         description: m.mode === ctx.tree.mode ? "current" : "",
         mode: m.mode,
      })),
      { placeHolder: "Arrange the library by", matchOnDetail: true },
   );
   if (pick.some) {
      ctx.setMode(pick.value.mode);
   }
}
