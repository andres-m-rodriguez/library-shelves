import type { Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { isCardMeta } from "../../library/jsonDocument";
import type { Option } from "../../option";
import { plural } from "../../services";

export async function clearLessons(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const cards = ctx.selection.targetsOfKind(node, "card").map((n) => n.card);
   if (!cards.length) {
      ctx.dialogs.info("Right-click a card in the Library view to clear its lessons.");
      return;
   }
   const total = cards.reduce((sum, c) => sum + c.lessons.length, 0);
   if (!total) {
      ctx.dialogs.info(`${cards.length === 1 ? cards[0].name : "The selected cards"} has no lessons to clear.`);
      return;
   }
   const confirmed = await ctx.dialogs.confirm({
      question: `Clear ${plural(total, "lesson")} from ${plural(cards.length, "card")}?`,
      action: "Clear",
      affected: cards.map((c) => c.name),
      keeps: "The lesson files stay on disk.",
      changes: "Only the lessons list in library.json is emptied.",
   });
   if (!confirmed) {
      return;
   }

   const batch = ctx.library.batch();
   for (const card of cards) {
      const opened = await batch.open(card.jsonUri);
      if (opened.some && isCardMeta(opened.value.doc.data()[card.key])) {
         opened.value.doc.set([card.key, "lessons"], []);
      }
   }
   await batch.saveAll();
   ctx.dialogs.status(`cleared ${plural(total, "lesson")} from ${plural(cards.length, "card")}`);
}
