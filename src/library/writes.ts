import type * as vscode from "vscode";
import { CATEGORIES_KEY, FILE_TYPES_KEY, SCHEMA_KEY, type Card, type Category, type Lesson, type LessonMeta } from "../contracts";
import { isCardMeta, isCategoryMeta, openForEdit } from "./jsonDocument";

export async function writeLessonOrder(jsonUri: vscode.Uri, cardKey: string, orderedNames: string[]): Promise<void> {
   const opened = await openForEdit(jsonUri);
   if (!opened) {
      return;
   }
   const { doc, data } = opened;
   const wanted = new Set(orderedNames);
   const pool = new Map<string, LessonMeta>();

   for (const [key, value] of Object.entries(data)) {
      if (key === SCHEMA_KEY || key === CATEGORIES_KEY || key === FILE_TYPES_KEY || !isCardMeta(value) || !value.lessons) {
         continue;
      }
      for (const lesson of value.lessons) {
         if (wanted.has(lesson.name)) {
            pool.set(lesson.name, lesson);
         }
      }
      if (key !== cardKey) {
         const kept = value.lessons.filter((l) => !wanted.has(l.name));
         if (kept.length !== value.lessons.length) {
            doc.set([key, "lessons"], kept);
         }
      }
   }

   const lessons = orderedNames.map((name, i) => ({ ...(pool.get(name) ?? { name }), name, order: i + 1 }));
   if (isCardMeta(data[cardKey])) {
      doc.set([cardKey, "lessons"], lessons);
   } else {
      doc.set([cardKey], { lessons });
   }
   await doc.save();
}

export async function writeCardOrder(jsonUri: vscode.Uri, category: string | undefined, orderedKeys: string[]): Promise<void> {
   const opened = await openForEdit(jsonUri);
   if (!opened) {
      return;
   }
   const { doc, data } = opened;
   orderedKeys.forEach((key, i) => {
      if (isCardMeta(data[key])) {
         doc.set([key, "order"], i + 1);
         doc.set([key, "category"], category);
      } else {
         doc.set([key], category ? { category, order: i + 1 } : { order: i + 1 });
      }
   });
   await doc.save();
}

export async function writeCategoryOrder(jsonUri: vscode.Uri, orderedNames: string[]): Promise<void> {
   const opened = await openForEdit(jsonUri);
   if (!opened) {
      return;
   }
   const block = opened.data[CATEGORIES_KEY];
   const declared = isCategoryMeta(block) ? Object.keys(block as Record<string, unknown>) : [];
   orderedNames.forEach((name, i) => {
      const existing = declared.find((k) => k.trim().toLowerCase() === name.toLowerCase());
      opened.doc.set([CATEGORIES_KEY, existing ?? name, "order"], i + 1);
   });
   await opened.doc.save();
}

export async function writeLessonDate(lesson: Lesson, date: string): Promise<void> {
   const opened = await openForEdit(lesson.card.jsonUri);
   if (!opened) {
      return;
   }
   const card = opened.data[lesson.card.key];
   const index = isCardMeta(card) ? (card.lessons ?? []).findIndex((l) => l.name === lesson.meta.name) : -1;
   if (index < 0) {
      return;
   }
   opened.doc.set([lesson.card.key, "lessons", index, "date"], date);
   await opened.doc.save();
}

export async function writeCardIcon(card: Card, icon: string | undefined): Promise<void> {
   const opened = await openForEdit(card.jsonUri);
   if (!opened) {
      return;
   }
   opened.doc.set([card.key, "icon"], icon);
   await opened.doc.save();
}

export async function writeCategoryIcon(category: Category, icon: string | undefined): Promise<void> {
   const opened = await openForEdit(category.jsonUri);
   if (!opened) {
      return;
   }
   const block = opened.data[CATEGORIES_KEY];
   const existingName = isCategoryMeta(block)
      ? Object.keys(block as Record<string, unknown>).find((k) => k.trim().toLowerCase() === category.name.toLowerCase())
      : undefined;
   opened.doc.set([CATEGORIES_KEY, existingName ?? category.name, "icon"], icon);
   await opened.doc.save();
}
