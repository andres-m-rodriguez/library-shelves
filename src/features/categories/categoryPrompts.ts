import type * as vscode from "vscode";
import { CATEGORIES_KEY, type CategoryMeta } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { flatMap, nonEmpty, option, orElse, some, type Option } from "../../option";
import { parsers } from "../../parsers";
import { setOption } from "../../services";
import { sameName } from "../shared/nodes";

export async function promptCategoryName(ctx: FeatureContext, prompt: string, current: Option<string>): Promise<Option<string>> {
   const typed = await ctx.dialogs.input({
      prompt,
      value: orElse(current, ""),
      placeHolder: "Things I learned this week",
      validateInput: (value) => {
         const name = nonEmpty(value);
         if (!name.some) {
            return "Enter a name";
         }
         const clash = option(ctx.tree.categories.find((c) => sameName(some(c.name), name)));
         if (clash.some && !sameName(some(clash.value.name), current)) {
            return `"${clash.value.name}" already exists`;
         }
         return "";
      },
   });
   return flatMap(typed, nonEmpty);
}

export function writeCategoryField(ctx: FeatureContext, jsonUri: vscode.Uri, name: string, field: keyof CategoryMeta, value: Option<unknown>): Promise<boolean> {
   return ctx.library.edit(jsonUri, (doc, data) => {
      setOption(doc, [CATEGORIES_KEY, orElse(option(parsers.libraryFile.categoryKey(data, name)), name), field], value);
   });
}
