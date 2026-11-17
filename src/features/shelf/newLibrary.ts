import * as vscode from "vscode";
import { LIBRARY_FILE, SHELF_VIEW_TYPE } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { exists } from "../../library/files";
import { map, none, option, orElse, some, type Option } from "../../option";

export const EMPTY_LIBRARY = "{}\n";

export async function newLibrary(ctx: FeatureContext): Promise<void> {
   const folder = await pickFolder(ctx);
   if (!folder.some) {
      return;
   }
   const uri = vscode.Uri.joinPath(folder.value, LIBRARY_FILE);
   const alreadyThere = await exists(uri);
   if (!alreadyThere) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(EMPTY_LIBRARY, "utf8"));
   }
   await vscode.commands.executeCommand("vscode.openWith", uri, SHELF_VIEW_TYPE);
}

async function pickFolder(ctx: FeatureContext): Promise<Option<vscode.Uri>> {
   const folders = orElse(option(vscode.workspace.workspaceFolders), []);
   if (!folders.length) {
      ctx.dialogs.info(`Open a folder first, then create a ${LIBRARY_FILE} in it.`);
      return none;
   }
   if (folders.length === 1) {
      return some(folders[0].uri);
   }
   const pick = await ctx.dialogs.pick(
      folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, uri: folder.uri })),
      { placeHolder: `Folder for the new ${LIBRARY_FILE}` },
   );
   return map(pick, (item) => item.uri);
}
