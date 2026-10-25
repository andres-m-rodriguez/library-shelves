import * as path from "path";
import * as vscode from "vscode";
import type { CardMeta, Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { exists, toRelative } from "../../library/files";
import { map, option, some, type Option } from "../../option";
import { parsers } from "../../parsers";
import { nextCardOrder } from "../shared/nodes";

export async function newCardFile(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const category = ctx.selection.categoryClicked(node);
   const jsonUri = category.some ? some(category.value.jsonUri) : await ctx.library.find();
   if (!jsonUri.some) {
      return;
   }
   const folder = path.dirname(jsonUri.value.fsPath);
   const typed = await ctx.dialogs.input({
      prompt: category.some ? `Name of the new markdown card in ${category.value.name}` : "Name of the new markdown card",
      placeHolder: "loops.md",
      validateInput: async (value) => {
         const invalid = option(parsers.fileName.validate(value));
         if (invalid.some) {
            return invalid.value;
         }
         const fileName = parsers.fileName.asMarkdown(value);
         const candidate = vscode.Uri.file(path.join(folder, fileName));
         const alreadyThere = await exists(candidate);
         return alreadyThere ? `${fileName} already exists. Use Add Card to list it instead.` : "";
      },
   });
   if (!typed.some) {
      return;
   }
   const fileName = parsers.fileName.asMarkdown(typed.value);
   const filePath = path.join(folder, fileName);
   const fileUri = vscode.Uri.file(filePath);
   const title = path.basename(fileName, path.extname(fileName));
   const heading = Buffer.from(`# ${title}\n`, "utf8");
   try {
      await vscode.workspace.fs.writeFile(fileUri, heading);
   } catch (error) {
      void ctx.dialogs.warn(`Could not create ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
      return;
   }
   const categoryName = map(category, (c) => c.name);
   const nothingMoving = new Set<string>();
   const key = toRelative(folder, fileUri.fsPath);
   await ctx.library.edit(jsonUri.value, (doc, data) => {
      const meta: CardMeta = categoryName.some ? { category: categoryName.value, order: nextCardOrder(data, categoryName, nothingMoving) } : {};
      doc.set([key], meta);
   });
   await vscode.window.showTextDocument(fileUri);
}
