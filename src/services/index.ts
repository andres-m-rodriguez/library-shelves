import type * as vscode from "vscode";
import type { Node } from "../contracts";
import { ColorPicker } from "./colorPicker";
import { Dialogs } from "./dialogs";
import { FieldEditor } from "./fieldEditor";
import { Library } from "./library";
import { Selection } from "./selection";

export { plural } from "./dialogs";
export { ALL_FIELDS, type FieldSpec } from "./fieldEditor";
export { EXCLUDE_GLOB, setOption, type Data } from "./library";

export interface Services {
   dialogs: Dialogs;
   colors: ColorPicker;
   library: Library;
   fields: FieldEditor;
   selection: Selection;
}

export function createServices(view: vscode.TreeView<Node>): Services {
   const dialogs = new Dialogs();
   const colors = new ColorPicker(dialogs);
   const library = new Library(dialogs);
   return {
      dialogs,
      colors,
      library,
      fields: new FieldEditor(dialogs, colors, library),
      selection: new Selection(view),
   };
}
