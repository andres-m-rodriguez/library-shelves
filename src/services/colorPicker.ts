import * as vscode from "vscode";
import { nonEmpty, none, some, type Option } from "../option";
import { parsers } from "../parsers";
import type { Dialogs } from "./dialogs";


export type ColorChoice = { kind: "color"; id: string } | { kind: "clear" };


type Item = vscode.QuickPickItem & ({ role: "color"; id: string } | { role: "clear" } | { role: "custom" } | { role: "separator" });

export class ColorPicker {
   constructor(private readonly dialogs: Dialogs) {}

   async pick(label: string, current: Option<string>): Promise<Option<ColorChoice>> {
      const names = parsers.color.names();
      const currentId = current.some ? current.value : "";

      const customCurrent = current.some && !names.some((name) => parsers.color.same(name, current.value)) ? current : none;

      const items = names.map((name): Item => ({
         role: "color",
         id: name,
         label: name,
         description: parsers.color.same(name, currentId) ? "current" : "",
         iconPath: new vscode.ThemeIcon("circle-filled", parsers.color.toThemeColor(name)),
      }));
      items.push(
         { role: "separator", label: "", kind: vscode.QuickPickItemKind.Separator },
         {
            role: "custom",
            label: "$(symbol-color) Custom theme color id...",
            description: customCurrent.some ? `current: ${customCurrent.value}` : "for example charts.red or errorForeground",
         },
         { role: "clear", label: "$(circle-slash) None", description: "use the default color" },
      );
      const pick = await this.dialogs.pick(items, {
         placeHolder: current.some ? `Color for ${label} (currently ${current.value})` : `Color for ${label}`,
         matchOnDescription: true,
      });
      if (!pick.some) {
         return none;
      }
      switch (pick.value.role) {
         case "color":
            return some({ kind: "color", id: pick.value.id });
         case "clear":
            return some({ kind: "clear" });
         case "separator":
            return none;
         case "custom": {
            const typed = await this.dialogs.input({
               prompt: `Theme color id for ${label}. Empty removes the color`,
               value: customCurrent.some ? customCurrent.value : "",
               placeHolder: "charts.red",
               validateInput: (value) => (!value.trim() || parsers.color.isThemeColorId(value.trim()) ? "" : "A theme color id looks like charts.red or errorForeground"),
            });
            if (!typed.some) {
               return none;
            }
            const id = nonEmpty(typed.value);
            return some(id.some ? { kind: "color", id: id.value } : { kind: "clear" });
         }
      }
   }
}
