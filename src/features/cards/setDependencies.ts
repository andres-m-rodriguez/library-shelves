import * as path from "path";
import type * as vscode from "vscode";
import type { Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { dependencyMap, dependentsOf } from "../../library/graph";
import { option, orElse, type Option } from "../../option";
import { parsers } from "../../parsers";

type Item = vscode.QuickPickItem & { key: string };

// Picks which other cards this card builds on. Cards that already build on it are
// left out, because choosing one of them would make a loop.
export async function setDependencies(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const card = ctx.selection.cardOf(node);
   if (!card.some) {
      ctx.dialogs.info("Select a card to choose what it depends on.");
      return;
   }
   const opened = await ctx.library.open(card.value.jsonUri);
   if (!opened.some) {
      return;
   }
   const cards = [...parsers.libraryFile.cards(opened.value.data)];
   const dependencies = dependencyMap(cards);
   const current = orElse(option(dependencies.get(card.value.key)), []);
   const dependents = dependentsOf(dependencies, card.value.key);

   const items: Item[] = cards
      .filter(([key]) => key !== card.value.key && !dependents.has(key))
      .map(([key, meta]) => ({
         key,
         label: orElse(option(meta.title), path.basename(key)),
         description: [option(meta.title).some ? key : "", orElse(option(meta.category), "")].filter(Boolean).join(" · "),
         picked: current.includes(key),
      }));
   if (!items.length) {
      ctx.dialogs.info(`There is no other card ${card.value.name} could depend on.`);
      return;
   }
   const picks = await ctx.dialogs.pickMany(items, {
      placeHolder: `Cards that ${card.value.name} builds on`,
      matchOnDescription: true,
   });
   if (!picks.some) {
      return;
   }
   const chosen = picks.value.map((item) => item.key);
   await ctx.library.edit(card.value.jsonUri, (doc) => {
      if (chosen.length) {
         doc.set([card.value.key, "dependsOn"], chosen);
      } else {
         doc.remove([card.value.key, "dependsOn"]);
      }
   });
}
