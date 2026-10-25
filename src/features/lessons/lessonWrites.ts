import type { Card, LessonMeta } from "../../contracts";
import { type JsonDocument, isCardMeta } from "../../library/jsonDocument";
import { option, orElse } from "../../option";
import { parsers } from "../../parsers";
import type { Library } from "../../services/library";



export function appendLessons(library: Library, card: Card, added: LessonMeta[]): Promise<boolean> {
   return library.edit(card.jsonUri, (doc, data) => {
      const addedNames = new Set(added.map((l) => l.name));
      const pool = new Map<string, LessonMeta>();
      let own: LessonMeta[] = [];

      for (const [key, meta] of parsers.libraryFile.cards(data)) {
         const lessons = orElse(option(meta.lessons), []);
         if (key === card.key) {
            own = lessons;
            continue;
         }
         const indexes: number[] = [];
         lessons.forEach((lesson, i) => {
            if (addedNames.has(lesson.name)) {
               pool.set(lesson.name, lesson);
               indexes.push(i);
            }
         });

         for (const index of indexes.reverse()) {
            doc.remove([key, "lessons", index]);
         }
      }

      let order = Math.max(0, ...own.map((l) => orElse(option(l.order), 0)));
      for (const lesson of added) {
         order += 1;

         const moved = option(pool.get(lesson.name));
         doc.set([card.key, "lessons", -1], { ...(moved.some ? moved.value : {}), ...lesson, order });
      }
   });
}



export function removeLessonEntries(doc: JsonDocument, cardKey: string, names: Set<string>): number {
   const card = option(doc.data()[cardKey]);
   if (!card.some || !isCardMeta(card.value)) {
      return 0;
   }
   const lessons = orElse(option(card.value.lessons), []);
   const removedIndexes = lessons.map((l, i) => (names.has(l.name) ? i : -1)).filter((i) => i >= 0);
   for (const index of [...removedIndexes].reverse()) {
      doc.remove([cardKey, "lessons", index]);
   }
   const kept = lessons.filter((l) => !names.has(l.name));
   if (removedIndexes.length && kept.every((l) => option(l.order).some)) {
      kept.forEach((lesson, i) => {
         if (lesson.order !== i + 1) {
            doc.set([cardKey, "lessons", i, "order"], i + 1);
         }
      });
   }
   return removedIndexes.length;
}
