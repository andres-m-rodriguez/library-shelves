import * as vscode from "vscode";
import type { FeatureContext } from "../../extension";
import { option } from "../../option";
import { parsers } from "../../parsers";
import { plural } from "../../services";
import { bump, sortedByCount, type FilterController } from "./controller";

type Item = vscode.QuickPickItem & ({ role: "color"; color: string } | { role: "any" } | { role: "separator" });

export async function pickColor(ctx: FeatureContext, controller: FilterController): Promise<void> {
   const counts = new Map<string, number>();
   for (const category of ctx.tree.categories) {
      bump(counts, option(category.meta.color));
   }
   for (const card of ctx.tree.cards) {
      bump(counts, option(card.meta.color));
      for (const lesson of card.lessons) {
         bump(counts, option(lesson.meta.color));
      }
   }
   if (!counts.size) {
      ctx.dialogs.info("No row in the library has a color yet.");
      return;
   }

   const active = new Set(parsers.filterQuery.termsFor(controller.current, "color"));
   const items = sortedByCount(counts).map(
      ([color, count]): Item => ({
         role: "color",
         color,
         label: color,
         description: active.has(color) ? `${plural(count, "row")} · current` : plural(count, "row"),
         iconPath: new vscode.ThemeIcon("circle-filled", parsers.color.toThemeColor(color)),
      }),
   );
   if (active.size) {
      items.unshift(
         { role: "any", label: "$(clear-all) Any color" },
         { role: "separator", label: "", kind: vscode.QuickPickItemKind.Separator },
      );
   }

   const pick = await ctx.dialogs.pick(items, { placeHolder: "Show only rows with this color", matchOnDescription: true });
   if (!pick.some || pick.value.role === "separator") {
      return;
   }
   controller.setField("color", pick.value.role === "color" ? [pick.value.color] : []);
}
