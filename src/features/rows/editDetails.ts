import type { Card, Lesson, Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { none, some, type Option } from "../../option";
import { parsers } from "../../parsers";
import { ALL_FIELDS } from "../../services";

const CARD_FIELDS = ALL_FIELDS.filter((spec) => spec.field !== "tags" && spec.field !== "date");

export async function editDetails(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const target = ctx.selection.first(node);
   if (!target.some) {
      ctx.dialogs.info("Select a markdown card or a lesson in the Library view first.");
      return;
   }
   switch (target.value.kind) {
      case "card":
         return editCard(ctx, target.value.card);
      case "lesson":
         return editLesson(ctx, target.value.lesson);
      default:
         ctx.dialogs.info("Select a markdown card or a lesson in the Library view first.");
   }
}

function editCard(ctx: FeatureContext, card: Card): Promise<void> {
   return ctx.fields.edit({
      label: card.name,
      jsonUri: card.jsonUri,
      fields: CARD_FIELDS,
      locate: (data) => (parsers.libraryFile.isCardMeta(data[card.key]) ? some([card.key]) : none),
   });
}

function editLesson(ctx: FeatureContext, lesson: Lesson): Promise<void> {
   return ctx.fields.edit({
      label: lesson.meta.name,
      jsonUri: lesson.card.jsonUri,
      fields: ALL_FIELDS,
      locate: (data) => {
         const index = parsers.libraryFile.lessonIndex(data, lesson.card.key, lesson.meta.name);
         return index < 0 ? none : some([lesson.card.key, "lessons", index]);
      },
   });
}
