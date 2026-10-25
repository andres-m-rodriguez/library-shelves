import type * as vscode from "vscode";
import type { Lesson, Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { option, orElse, type Option } from "../../option";
import { plural } from "../../services";
import { removeLessonEntries } from "./lessonWrites";

export async function removeLessons(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const lessons = ctx.selection.targetsOfKind(node, "lesson").map((n) => n.lesson);
   if (!lessons.length) {
      ctx.dialogs.info("Select one or more lessons in the Library view to remove them.");
      return;
   }
   const confirmed = await ctx.dialogs.confirm({
      question: `Remove ${plural(lessons.length, "lesson")} from the library?`,
      action: "Remove",
      affected: lessons.map((l) => l.meta.name),
      keeps: "The files stay on disk.",
      changes: "Only their entries in library.json go away.",
   });
   if (!confirmed) {
      return;
   }

   const batch = ctx.library.batch();
   let removed = 0;
   for (const group of groupByCard(lessons)) {
      const opened = await batch.open(group.jsonUri);
      if (opened.some) {
         removed += removeLessonEntries(opened.value.doc, group.cardKey, group.names);
      }
   }
   await batch.saveAll();
   ctx.dialogs.status(`removed ${plural(removed, "lesson")}`);
}

interface LessonGroup {
   jsonUri: vscode.Uri;
   cardKey: string;
   names: Set<string>;
}

function groupByCard(lessons: Lesson[]): LessonGroup[] {
   const groups = new Map<string, LessonGroup>();
   for (const { card, meta } of lessons) {
      const id = `${card.jsonUri.fsPath}:${card.key}`;
      const group = orElse(option(groups.get(id)), { jsonUri: card.jsonUri, cardKey: card.key, names: new Set<string>() });
      group.names.add(meta.name);
      groups.set(id, group);
   }
   return [...groups.values()];
}
