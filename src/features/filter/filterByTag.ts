import type * as vscode from "vscode";
import type { FeatureContext } from "../../extension";
import { option, orElse, some } from "../../option";
import { parsers } from "../../parsers";
import { plural } from "../../services";
import { bump, sortedByCount, type FilterController } from "./controller";

type Item = vscode.QuickPickItem & { tag: string };

export async function pickTag(ctx: FeatureContext, controller: FilterController): Promise<void> {
   const counts = new Map<string, number>();
   const spelling = new Map<string, string>();
   for (const card of ctx.tree.cards) {
      for (const lesson of card.lessons) {
         for (const tag of orElse(option(lesson.meta.tags), [])) {
            bump(counts, some(tag));
            const key = tag.trim().toLowerCase();
            if (key && !spelling.has(key)) {
               spelling.set(key, tag.trim());
            }
         }
      }
   }
   if (!counts.size) {
      ctx.dialogs.info("No lesson has tags yet.");
      return;
   }

   const active = new Set(parsers.filterQuery.termsFor(controller.current, "tag"));
   const items = sortedByCount(counts).map(([key, count]): Item => {
      const shown = orElse(option(spelling.get(key)), key);
      return { label: shown, description: plural(count, "lesson"), picked: active.has(key), tag: shown };
   });
   const picks = await ctx.dialogs.pickMany(items, {
      placeHolder: "Show only lessons with all of these tags. Pick none to drop the tag filter",
      matchOnDescription: true,
   });
   if (picks.some) {
      controller.setField("tag", picks.value.map((p) => p.tag));
   }
}
