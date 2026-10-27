import * as path from "path";
import * as vscode from "vscode";
import { type Card, type Lesson, type LessonMeta, LIBRARY_FILE, type Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { toRelative } from "../../library/files";
import { flatMap, nonEmpty, option, type Option } from "../../option";
import { EXCLUDE_GLOB } from "../../services";
import { appendLessons } from "./lessonWrites";

type FileItem = vscode.QuickPickItem & { name: string };

export async function addLesson(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const card = ctx.selection.cardOf(node);
   if (!card.some) {
      ctx.dialogs.info("Select a card (or one of its lessons) in the Library view first.");
      return;
   }
   const items = await candidateFiles(ctx, card.value);
   if (!items.length) {
      ctx.dialogs.info(`Every file next to ${LIBRARY_FILE} is already in ${card.value.name}.`);
      return;
   }
   const picked = await ctx.dialogs.pickManyInOrder(items, `Add files to ${card.value.name} (files from other cards are moved here)`);
   if (!picked.length) {
      return;
   }
   const added: LessonMeta[] = picked.map((item) => ({ name: item.name }));
   if (added.length === 1) {
      const typed = await ctx.dialogs.input({
         prompt: `Title for ${added[0].name} (optional, Escape to skip)`,
         placeHolder: "Shown next to the file name",
      });
      const title = flatMap(typed, nonEmpty);
      if (title.some) {
         added[0].title = title.value;
      }
   }
   await appendLessons(ctx.library, card.value, added);
}



async function candidateFiles(ctx: FeatureContext, card: Card): Promise<FileItem[]> {
   const folder = path.dirname(card.jsonUri.fsPath);
   const workspace = option(vscode.workspace.getWorkspaceFolder(card.jsonUri));
   const root = workspace.some ? workspace.value.uri : vscode.Uri.file(folder);
   const relativePattern = new vscode.RelativePattern(root, "**/*");
   const found = await vscode.workspace.findFiles(relativePattern, EXCLUDE_GLOB);

   const skip = new Set([card.uri.fsPath.toLowerCase(), ...card.lessons.map((l) => l.uri.fsPath.toLowerCase())]);
   const owner = new Map<string, Lesson>();
   for (const other of ctx.tree.cards) {
      if (other.jsonUri.fsPath === card.jsonUri.fsPath) {
         for (const lesson of other.lessons) {
            owner.set(lesson.uri.fsPath.toLowerCase(), lesson);
         }
      }
   }

   const items: FileItem[] = [];
   for (const uri of found) {
      const lower = uri.fsPath.toLowerCase();
      if (skip.has(lower) || path.basename(lower) === LIBRARY_FILE) {
         continue;
      }
      const known = option(owner.get(lower));
      items.push({

         label: known.some ? known.value.meta.name : toRelative(folder, uri.fsPath),
         name: known.some ? known.value.meta.name : toRelative(folder, uri.fsPath),
         description: known.some ? `in ${known.value.card.name}, will move` : "",
         iconPath: vscode.ThemeIcon.File,
      });
   }
   return items.sort((a, b) => a.name.localeCompare(b.name, [], { numeric: true }));
}
