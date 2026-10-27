import { CATEGORIES_KEY, type JsonPath, type Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { isCardMeta } from "../../library/jsonDocument";
import { none, option, orElse, some, type Option } from "../../option";
import { parsers } from "../../parsers";
import { setOption, type Data } from "../../services";
import { groupByJson, jsonUriOf, nodeColor, nodeLabel } from "../shared/nodes";

export async function setColor(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const targets = ctx.selection.targetsOf(node).filter((n) => n.kind !== "day");
   if (!targets.length) {
      ctx.dialogs.info("Right-click a category, card or lesson in the Library view to color it.");
      return;
   }
   const single = targets.length === 1 ? some(targets[0]) : none;
   const choice = await ctx.colors.pick(single.some ? nodeLabel(single.value) : `${targets.length} rows`, single.some ? nodeColor(single.value) : none);
   if (!choice.some) {
      return;
   }
   const color = choice.value.kind === "color" ? some(choice.value.id) : none;
   const located = targets.map((n) => ({ node: n, jsonUri: jsonUriOf(n) }));
   for (const [jsonUri, group] of groupByJson(located)) {
      await ctx.library.edit(jsonUri, (doc, data) => {
         for (const { node: target } of group) {
            const colorPath = colorPathOf(data, target);
            if (colorPath.some) {
               setOption(doc, colorPath.value, color);
            }
         }
      });
   }
}

function colorPathOf(data: Data, node: Node): Option<JsonPath> {
   switch (node.kind) {
      case "category":
         return some([CATEGORIES_KEY, orElse(option(parsers.libraryFile.categoryKey(data, node.category.name)), node.category.name), "color"]);
      case "card":
         return isCardMeta(data[node.card.key]) ? some([node.card.key, "color"]) : none;
      case "lesson": {
         const index = parsers.libraryFile.lessonIndex(data, node.lesson.card.key, node.lesson.meta.name);
         return index < 0 ? none : some([node.lesson.card.key, "lessons", index, "color"]);
      }
      case "day":
         return none;
   }
}
