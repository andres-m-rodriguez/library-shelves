import type * as vscode from "vscode";
import { CATEGORIES_KEY, type Category, type Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import type { JsonDocument } from "../../library/jsonDocument";
import { map, option, some, type Option } from "../../option";
import { parsers } from "../../parsers";
import { plural } from "../../services";
import { categoryOf, sameName } from "../shared/nodes";

export async function removeCategory(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const clicked = ctx.selection.categoryClicked(node);
   const category = clicked.some ? clicked : map(option(ctx.selection.targetsOfKind(node, "category")[0]), (n) => n.category);
   if (!category.some) {
      ctx.dialogs.info("Right-click a category in the Library view to remove it.");
      return;
   }
   const name = category.value.name;
   const count = category.value.cards.length;
   const confirmed = await ctx.dialogs.confirm({
      question: `Remove the category "${name}"?`,
      action: "Remove",
      affected: [],
      keeps: count ? `Its ${plural(count, "card")} stay in the library and on disk, but become uncategorized.` : "It has no cards.",
      changes: `The entry for it in ${CATEGORIES_KEY} is removed as well.`,
   });
   if (!confirmed) {
      return;
   }

   const batch = ctx.library.batch();
   let uncategorized = 0;
   for (const jsonUri of jsonFilesOf(category.value)) {
      const opened = await batch.open(jsonUri);
      if (opened.some) {
         uncategorized += removeCategoryEntries(opened.value.doc, name);
      }
   }
   await batch.saveAll();
   ctx.dialogs.status(uncategorized ? `removed category ${name}, ${plural(uncategorized, "card")} uncategorized` : `removed category ${name}`);
}

function removeCategoryEntries(doc: JsonDocument, name: string): number {
   const data = doc.data();
   const declaredKey = option(parsers.libraryFile.categoryKey(data, name));
   if (declaredKey.some) {
      if (Object.keys(parsers.libraryFile.categoriesOf(data)).length === 1) {
         doc.remove([CATEGORIES_KEY]);
      } else {
         doc.remove([CATEGORIES_KEY, declaredKey.value]);
      }
   }
   let uncategorized = 0;
   for (const [key, meta] of parsers.libraryFile.cards(data)) {
      if (sameName(categoryOf(meta), some(name))) {
         doc.remove([key, "category"]);
         uncategorized += 1;
      }
   }
   return uncategorized;
}

function jsonFilesOf(category: Category): vscode.Uri[] {
   const byPath = new Map<string, vscode.Uri>([[category.jsonUri.fsPath, category.jsonUri]]);
   for (const card of category.cards) {
      byPath.set(card.jsonUri.fsPath, card.jsonUri);
   }
   return [...byPath.values()];
}
