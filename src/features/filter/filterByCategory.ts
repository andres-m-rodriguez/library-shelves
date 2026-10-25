import * as vscode from "vscode";
import type { FeatureContext } from "../../extension";
import { parsers } from "../../parsers";
import { plural } from "../../services";
import type { FilterController } from "./controller";

type Item = vscode.QuickPickItem & ({ role: "category"; name: string } | { role: "any" } | { role: "separator" });

export async function pickCategory(ctx: FeatureContext, controller: FilterController): Promise<void> {
   if (!ctx.tree.categories.length) {
      ctx.dialogs.info("The library has no categories yet.");
      return;
   }
   const active = new Set(parsers.filterQuery.termsFor(controller.current, "cat"));
   const items = ctx.tree.categories.map(
      (category): Item => ({
         role: "category",
         name: category.name,
         label: `$(folder) ${category.name}`,
         description: active.has(category.name.toLowerCase()) ? `${plural(category.cards.length, "card")} · current` : plural(category.cards.length, "card"),
      }),
   );
   if (active.size) {
      items.unshift(
         { role: "any", label: "$(clear-all) Any category" },
         { role: "separator", label: "", kind: vscode.QuickPickItemKind.Separator },
      );
   }

   const pick = await ctx.dialogs.pick(items, { placeHolder: "Show only this category", matchOnDescription: true });
   if (!pick.some || pick.value.role === "separator") {
      return;
   }
   controller.setField("cat", pick.value.role === "category" ? [pick.value.name] : []);
}
