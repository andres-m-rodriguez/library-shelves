import type { Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import type { Option } from "../../option";
import { plural } from "../../services";

export async function removeCards(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const cards = ctx.selection.targetsOfKind(node, "card").map((n) => n.card);
   if (!cards.length) {
      ctx.dialogs.info("Select one or more markdown cards in the Library view to remove them.");
      return;
   }
   const confirmed = await ctx.dialogs.confirm({
      question: `Remove ${plural(cards.length, "card")} from the library?`,
      action: "Remove",
      affected: cards.map((c) => c.name),
      keeps: "The markdown files and their lesson files stay on disk.",
      changes: "Only the entries in library.json go away.",
   });
   if (!confirmed) {
      return;
   }

   const batch = ctx.library.batch();
   let removed = 0;
   for (const card of cards) {
      const opened = await batch.open(card.jsonUri);
      if (opened.some && card.key in opened.value.doc.data()) {
         opened.value.doc.remove([card.key]);
         removed += 1;
      }
   }
   await batch.saveAll();
   ctx.dialogs.status(`removed ${plural(removed, "card")}`);
}
