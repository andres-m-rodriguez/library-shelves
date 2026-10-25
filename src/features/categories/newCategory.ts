import { CATEGORIES_KEY } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { none, some } from "../../option";
import { promptCategoryName, writeCategoryField } from "./categoryPrompts";

export async function newCategory(ctx: FeatureContext): Promise<void> {
   const jsonUri = await ctx.library.find();
   if (!jsonUri.some) {
      return;
   }
   const name = await promptCategoryName(ctx, "Name of the new category", none);
   if (!name.some) {
      return;
   }
   const declared = await ctx.library.edit(jsonUri.value, (doc) => doc.set([CATEGORIES_KEY, name.value], {}));
   if (!declared) {
      return;
   }

   await ctx.dialogs.pickIcon(ctx.tree, name.value, none, async (icon) => {
      await writeCategoryField(ctx, jsonUri.value, name.value, "icon", icon);
   });
   const choice = await ctx.colors.pick(name.value, none);
   if (choice.some) {
      await writeCategoryField(ctx, jsonUri.value, name.value, "color", choice.value.kind === "color" ? some(choice.value.id) : none);
   }
}
