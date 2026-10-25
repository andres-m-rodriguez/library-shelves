import * as vscode from "vscode";
import { parse as parseJsonc } from "jsonc-parser";
import type { IconCatalog } from "../contracts";

export const SCHEMA_SCHEME = "library-schema";
const SCHEMA_URI = vscode.Uri.parse(`${SCHEMA_SCHEME}://schemas/library.schema.json`);

interface SchemaShape {
   definitions: Record<string, unknown> & {
      card: { properties: Record<string, unknown> };
      category: { properties: Record<string, unknown> };
   };
}

export class SchemaProvider implements vscode.TextDocumentContentProvider {
   private readonly changed = new vscode.EventEmitter<vscode.Uri>();
   readonly onDidChange = this.changed.event;

   constructor(private readonly extensionUri: vscode.Uri, private readonly icons: () => IconCatalog) {}

   refresh(): void {
      this.changed.fire(SCHEMA_URI);
   }

   async provideTextDocumentContent(): Promise<string> {
      const file = vscode.Uri.joinPath(this.extensionUri, "schemas", "library.schema.json");
      const bytes = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(bytes).toString("utf8");
      const schema = parseJsonc(text) as SchemaShape;
      const catalog = this.icons();
      const themeNote = catalog.themeId ? `Icons from the active icon theme (${catalog.themeId}).` : "No icon theme is active.";
      schema.definitions.icon = {
         description: `Icon shown for this markdown in the Library view. ${themeNote} Or a codicon like $(book).`,
         oneOf: [
            { type: "string", enum: catalog.ids },
            { type: "string", pattern: "^\\$\\([a-z0-9-]+\\)$", description: "A built-in codicon, written as $(name)." },
         ],
      };
      schema.definitions.card.properties.icon = { $ref: "#/definitions/icon" };
      schema.definitions.category.properties.icon = { $ref: "#/definitions/icon" };
      return JSON.stringify(schema, undefined, 2);
   }
}
