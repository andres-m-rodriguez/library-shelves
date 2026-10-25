import * as path from "path";
import * as vscode from "vscode";
import { type Card, LIBRARY_FILE, type Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { exists, toRelative } from "../../library/files";
import { option, orElse, type Option } from "../../option";
import { parsers } from "../../parsers";
import { appendLessons } from "./lessonWrites";

const COMMENT_LEADERS: Record<string, [string, string]> = {
   ".py": ["# ", ""],
   ".sh": ["# ", ""],
   ".ps1": ["# ", ""],
   ".yaml": ["# ", ""],
   ".yml": ["# ", ""],
   ".toml": ["# ", ""],
   ".rb": ["# ", ""],
   ".md": ["<!-- ", " -->"],
   ".html": ["<!-- ", " -->"],
   ".xml": ["<!-- ", " -->"],
   ".sql": ["-- ", ""],
   ".lua": ["-- ", ""],
   ".hs": ["-- ", ""],
};

export async function newLessonFile(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const card = ctx.selection.cardOf(node);
   if (!card.some) {
      ctx.dialogs.info("Select a markdown card in the Library view first.");
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
   const fileName = parsers.fileName.withDefaultExtension(typed.value, ".cs");
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
      const header = Buffer.from(headerFor(fileName, card.value), "utf8");
      await vscode.workspace.fs.writeFile(uri, header);
   }

   const name = toRelative(folder, uri.fsPath);
   const written = await appendLessons(ctx.library, card.value, [{ name }]);
   if (written) {
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, { preview: false });
   }
}

function headerFor(fileName: string, card: Card): string {
   const [open, close] = orElse(option(COMMENT_LEADERS[path.extname(fileName).toLowerCase()]), ["// ", ""]);
   return `${open}${fileName}: part of ${card.name}${close}\n\n`;
}
