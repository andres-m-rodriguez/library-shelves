import type * as vscode from "vscode";
import type { Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import type { Option } from "../../option";
import { addCard } from "./addCard";
import { newCardFile } from "./newCardFile";

type Item = vscode.QuickPickItem & ({ role: "create" } | { role: "existing" });

const ITEMS: Item[] = [
   { role: "create", label: "$(new-file) Create file", description: "make a new file next to library.json and list it as a card" },
   { role: "existing", label: "$(folder-opened) Add existing", description: "pick files that are already there" },
];

export async function newCard(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const choice = await ctx.dialogs.pick(ITEMS, { placeHolder: "How to add the card" });
   if (!choice.some) {
      return;
   }
   if (choice.value.role === "create") {
      await newCardFile(ctx, node);
      return;
   }
   await addCard(ctx, node);
}
