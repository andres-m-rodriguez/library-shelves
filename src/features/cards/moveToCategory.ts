import * as vscode from "vscode";
import { CATEGORIES_KEY, type Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { isCardMeta } from "../../library/jsonDocument";
import { none, option, some, type Option } from "../../option";
import { parsers } from "../../parsers";
import { setOption } from "../../services";
import { promptCategoryName } from "../categories/categoryPrompts";
import { categoryOf, groupByJson, nextCardOrder, sameName } from "../shared/nodes";


type Item = vscode.QuickPickItem & ({ role: "category"; name: Option<string> } | { role: "new" } | { role: "separator" });

export async function moveToCategory(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const cards = ctx.selection.targetsOf(node).flatMap((n) => (n.kind === "card" ? [n.card] : []));
   if (!cards.length) {
      ctx.dialogs.info("Select one or more markdown cards in the Library view to move them.");
      return;
   }
   const single = cards.length === 1 ? some(cards[0]) : none;
   const current = single.some ? categoryOf(single.value.meta) : none;
   const items = ctx.tree.categories.map((c): Item => ({
      role: "category",
      name: some(c.name),
      label: `$(folder) ${c.name}`,
      description: single.some && sameName(current, some(c.name)) ? "current" : `${c.cards.length} card${c.cards.length === 1 ? "" : "s"}`,
   }));
   items.push(
      { role: "separator", label: "", kind: vscode.QuickPickItemKind.Separator },
      {
         role: "category",
         name: none,
         label: "$(circle-slash) No category",
         description: single.some && !current.some ? "current" : "shown at the top level",
      },
      { role: "new", label: "$(new-folder) New category..." },
   );
   const pick = await ctx.dialogs.pick(items, {
      placeHolder: `Move ${single.some ? single.value.name : `${cards.length} cards`} to`,
      matchOnDescription: true,
   });
   if (!pick.some || pick.value.role === "separator") {
      return;
   }

   let target: Option<string>;
   if (pick.value.role === "new") {
      target = await promptCategoryName(ctx, "Name of the new category", none);
      if (!target.some) {
         return;
      }
   } else {
      target = pick.value.name;
   }
   const declare = pick.value.role === "new";

   for (const [jsonUri, group] of groupByJson(cards)) {
      await ctx.library.edit(jsonUri, (doc, data) => {
         if (declare && target.some && !option(parsers.libraryFile.categoryKey(data, target.value)).some) {
            doc.set([CATEGORIES_KEY, target.value], {});
         }
         const movingKeys = new Set(group.map((c) => c.key));
         let order = nextCardOrder(data, target, movingKeys);
         for (const card of group) {
            if (isCardMeta(data[card.key])) {
               setOption(doc, [card.key, "category"], target);
               doc.set([card.key, "order"], order++);
            }
         }
      });
   }
}
