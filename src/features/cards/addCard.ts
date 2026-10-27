import * as path from "path";
import * as vscode from "vscode";
import { type CardMeta, LIBRARY_FILE, type Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { toRelative } from "../../library/files";
import { map, option, orElse, some, type Option } from "../../option";
import { parsers } from "../../parsers";
import { EXCLUDE_GLOB } from "../../services";
import { nextCardOrder } from "../shared/nodes";

type Candidate = vscode.QuickPickItem & { uri: vscode.Uri };

export async function addCard(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const category = ctx.selection.categoryClicked(node);
   const jsonUri = category.some ? some(category.value.jsonUri) : await ctx.library.find();
   if (!jsonUri.some) {
      return;
   }
   const folder = path.dirname(jsonUri.value.fsPath);
   const opened = await ctx.library.open(jsonUri.value);
   if (!opened.some) {
      return;
   }
   const cards = [...parsers.libraryFile.cards(opened.value.data)];
   const taken = new Set([jsonUri.value.fsPath.toLowerCase(), ...cards.map(([key]) => path.resolve(folder, key).toLowerCase())]);
   const lessonOwners = lessonOwnersOf(folder, cards);
   const everyFile = new vscode.RelativePattern(vscode.Uri.file(folder), "**/*");
   const found = await vscode.workspace.findFiles(everyFile, EXCLUDE_GLOB);
   const candidates = found
      .filter((uri) => !taken.has(uri.fsPath.toLowerCase()))
      .sort((a, b) => a.fsPath.localeCompare(b.fsPath, [], { numeric: true }));
   if (!candidates.length) {
      ctx.dialogs.info(`Every file next to ${LIBRARY_FILE} is already a card.`);
      return;
   }
   const items: Candidate[] = candidates.map((uri) => {
      const owner = option(lessonOwners.get(uri.fsPath.toLowerCase()));
      const description = orElse(map(owner, (name) => `lesson in ${name}`), "");
      return { label: toRelative(folder, uri.fsPath), description, uri };
   });
   const picks = await ctx.dialogs.pickMany(
      items,
      { placeHolder: category.some ? `Files to add to ${category.value.name}` : "Files to add as cards", matchOnDescription: true },
   );
   if (!picks.some || !picks.value.length) {
      return;
   }
   const categoryName = map(category, (c) => c.name);

   const nothingMoving = new Set<string>();
   await ctx.library.edit(jsonUri.value, (doc, data) => {
      let order = categoryName.some ? nextCardOrder(data, categoryName, nothingMoving) : 0;
      for (const pick of picks.value) {
         const meta: CardMeta = categoryName.some ? { category: categoryName.value, order: order++ } : {};
         doc.set([toRelative(folder, pick.uri.fsPath)], meta);
      }
   });
}

function lessonOwnersOf(folder: string, cards: [string, CardMeta][]): Map<string, string> {
   const owners = new Map<string, string>();
   for (const [key, meta] of cards) {
      const cardName = path.basename(key);
      const lessons = orElse(option(meta.lessons), []);
      for (const lesson of lessons) {
         const lessonPath = path.resolve(folder, lesson.name).toLowerCase();
         owners.set(lessonPath, cardName);
      }
   }
   return owners;
}
