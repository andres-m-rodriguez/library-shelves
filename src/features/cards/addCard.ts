import * as path from "path";
import * as vscode from "vscode";
import { type CardMeta, LIBRARY_FILE, type Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { toRelative } from "../../library/files";
import { map, some, type Option } from "../../option";
import { parsers } from "../../parsers";
import { EXCLUDE_GLOB } from "../../services";
import { nextCardOrder } from "../shared/nodes";


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
   const cardKeys = [...parsers.libraryFile.cards(opened.value.data)].map(([key]) => key);
   const taken = new Set(cardKeys.map((key) => path.resolve(folder, key).toLowerCase()));
   const markdownFiles = new vscode.RelativePattern(vscode.Uri.file(folder), "**/*.{md,markdown}");
   const found = await vscode.workspace.findFiles(markdownFiles, EXCLUDE_GLOB);
   const candidates = found
      .filter((uri) => !taken.has(uri.fsPath.toLowerCase()))
      .sort((a, b) => a.fsPath.localeCompare(b.fsPath, [], { numeric: true }));
   if (!candidates.length) {
      ctx.dialogs.info(`Every markdown file next to ${LIBRARY_FILE} is already a card.`);
      return;
   }
   const picks = await ctx.dialogs.pickMany(
      candidates.map((uri) => ({ label: toRelative(folder, uri.fsPath), uri })),
      { placeHolder: category.some ? `Markdown files to add to ${category.value.name}` : "Markdown files to add as cards", matchOnDescription: true },
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
