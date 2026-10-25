import type * as vscode from "vscode";
import { CATEGORIES_KEY, type Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { option, some, type Option } from "../../option";
import { parsers } from "../../parsers";
import { categoryOf, sameName } from "../shared/nodes";
import { promptCategoryName } from "./categoryPrompts";

export async function renameCategory(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const category = ctx.selection.categoryOf(node);
   if (!category.some) {
      ctx.dialogs.info("Right-click a category in the Library view to rename it.");
      return;
   }
   const oldName = category.value.name;
   const newName = await promptCategoryName(ctx, `Rename "${oldName}"`, some(oldName));
   if (!newName.some || newName.value === oldName) {
      return;
   }

   const jsonUris = new Map<string, vscode.Uri>([[category.value.jsonUri.fsPath, category.value.jsonUri]]);
   for (const card of category.value.cards) {
      jsonUris.set(card.jsonUri.fsPath, card.jsonUri);
   }
   for (const jsonUri of jsonUris.values()) {
      await ctx.library.edit(jsonUri, (doc, data) => {
         const oldKey = option(parsers.libraryFile.categoryKey(data, oldName));
         if (oldKey.some) {
            doc.remove([CATEGORIES_KEY, oldKey.value]);
            doc.set([CATEGORIES_KEY, newName.value], (data[CATEGORIES_KEY] as Record<string, unknown>)[oldKey.value]);
         }
         for (const [key, meta] of parsers.libraryFile.cards(data)) {
            if (sameName(categoryOf(meta), some(oldName))) {
               doc.set([key, "category"], newName.value);
            }
         }
      });
   }
}
