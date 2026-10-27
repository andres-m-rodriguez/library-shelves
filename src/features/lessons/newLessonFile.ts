import * as path from "path";
import * as vscode from "vscode";
import { LIBRARY_FILE, type Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { exists, toRelative } from "../../library/files";
import { DEFAULT_LESSON_EXTENSION } from "../../library/running";
import { option, type Option } from "../../option";
import { parsers } from "../../parsers";
import { headerFor } from "../shared/fileHeaders";
import { appendLessons } from "./lessonWrites";

export async function newLessonFile(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const card = ctx.selection.cardOf(node);
   if (!card.some) {
      ctx.dialogs.info("Select a card in the Library view first.");
      return;
   }
   const typed = await ctx.dialogs.input({
      prompt: `New lesson file for ${card.value.name}. No extension means .cs`,
      placeHolder: "declare.cs",
      validateInput: (value) => {
         const invalid = option(parsers.fileName.validate(value));
         if (invalid.some) {
            return invalid.value;
         }
         return value.trim().toLowerCase() === LIBRARY_FILE ? `${LIBRARY_FILE} is the library itself` : "";
      },
   });
   if (!typed.some) {
      return;
   }
   const fileName = parsers.fileName.withDefaultExtension(typed.value, DEFAULT_LESSON_EXTENSION);
   const folder = path.dirname(card.value.jsonUri.fsPath);
   const filePath = path.join(folder, fileName);
   const uri = vscode.Uri.file(filePath);

   const alreadyThere = await exists(uri);
   if (alreadyThere) {
      const addExisting = "Add existing file";
      const choice = await ctx.dialogs.ask(`${fileName} already exists next to ${LIBRARY_FILE}. Add it to ${card.value.name} as it is?`, addExisting);
      if (!choice.some) {
         return;
      }
   } else {
      const headerText = headerFor(fileName, `part of ${card.value.name}`);
      const header = Buffer.from(headerText, "utf8");
      await vscode.workspace.fs.writeFile(uri, header);
   }

   const name = toRelative(folder, uri.fsPath);
   const written = await appendLessons(ctx.library, card.value, [{ name }]);
   if (written) {
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, { preview: false });
   }
}
