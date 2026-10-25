import * as path from "path";
import * as vscode from "vscode";
import type { IconCatalog } from "../contracts";
import { parsers } from "../parsers";

export const EMPTY_CATALOG: IconCatalog = { themeId: undefined, ids: [], display: new Map(), preview: new Map() };

interface IconThemeContribution {
   contributes?: { iconThemes?: { id: string; path: string }[] };
}

export async function loadIconCatalog(): Promise<IconCatalog> {
   const themeId = vscode.workspace.getConfiguration("workbench").get<string>("iconTheme") ?? undefined;
   if (!themeId) {
      return EMPTY_CATALOG;
   }
   for (const ext of vscode.extensions.all) {
      const contributes = (ext.packageJSON as IconThemeContribution).contributes;
      const theme = contributes?.iconThemes?.find((t) => t.id === themeId);
      if (!theme) {
         continue;
      }
      try {
         const themePath = path.join(ext.extensionPath, theme.path);
         const themeUri = vscode.Uri.file(themePath);
         const bytes = await vscode.workspace.fs.readFile(themeUri);
         const text = Buffer.from(bytes).toString("utf8");
         return parsers.iconTheme.parseText(themeId, text, path.dirname(themePath));
      } catch {
         return { ...EMPTY_CATALOG, themeId };
      }
   }
   return { ...EMPTY_CATALOG, themeId };
}

type IconItem = vscode.QuickPickItem & ({ role: "icon"; id: string } | { role: "clear" } | { role: "separator" });

export async function pickIcon(
   catalog: IconCatalog,
   label: string,
   current: string | undefined,
   write: (icon: string | undefined) => Promise<void>,
): Promise<void> {
   const items = catalog.ids.map(
      (id): IconItem => ({
         role: "icon",
         id,
         label: id,
         description: id === current ? "current" : "",
         iconPath: catalog.preview.get(id),
      }),
   );
   items.unshift(
      { role: "clear", label: "$(circle-slash) No icon", description: "use the default icon" },
      { role: "separator", label: "", kind: vscode.QuickPickItemKind.Separator },
   );
   const placeHolder = catalog.ids.length
      ? `Icon for ${label} (${catalog.ids.length} in ${catalog.themeId})`
      : "The active icon theme could not be read. Type a codicon like $(book) in library.json instead.";
   const pick = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true });
   if (!pick || pick.role === "separator") {
      return;
   }
   await write(pick.role === "icon" ? pick.id : undefined);
}
