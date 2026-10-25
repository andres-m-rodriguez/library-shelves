import * as vscode from "vscode";
import type { ColorName, ColorSpec } from "../contracts";

const NAMED: Record<ColorName, string> = {
   red: "charts.red",
   orange: "charts.orange",
   yellow: "charts.yellow",
   green: "charts.green",
   blue: "charts.blue",
   purple: "charts.purple",
   gray: "descriptionForeground",
};

const ALIASES: Record<string, ColorName> = {
   grey: "gray",
};

const THEME_COLOR_ID_RE = /^[a-zA-Z]+(\.[a-zA-Z]+)*$/;

export class ColorParser {
   names(): ColorName[] {
      return Object.keys(NAMED) as ColorName[];
   }

   parse(raw: string | undefined): ColorSpec | undefined {
      const text = raw?.trim();
      if (!text) {
         return undefined;
      }
      const name = this.nameOf(text);
      if (name) {
         return { kind: "named", name, themeId: NAMED[name] };
      }
      if (THEME_COLOR_ID_RE.test(text)) {
         return { kind: "themeId", id: text };
      }
      return undefined;
   }

   isThemeColorId(text: string): boolean {
      return THEME_COLOR_ID_RE.test(text.trim());
   }

   themeId(raw: string): string {
      const spec = this.parse(raw);
      return spec ? this.idOf(spec) : raw;
   }

   toThemeColor(raw: string): vscode.ThemeColor {
      return new vscode.ThemeColor(this.themeId(raw));
   }

   same(a: string | undefined, b: string | undefined): boolean {
      const specA = this.parse(a);
      const specB = this.parse(b);
      if (!specA || !specB) {
         return false;
      }
      return this.idOf(specA) === this.idOf(specB);
   }

   private idOf(spec: ColorSpec): string {
      return spec.kind === "named" ? spec.themeId : spec.id;
   }

   private nameOf(text: string): ColorName | undefined {
      const lower = text.toLowerCase();
      if (lower in NAMED) {
         return lower as ColorName;
      }
      return ALIASES[lower];
   }
}
