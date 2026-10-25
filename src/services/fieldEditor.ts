import type * as vscode from "vscode";
import { type JsonPath, LIBRARY_FILE } from "../contracts";
import { map, nonEmpty, none, option, some, type Option } from "../option";
import { parsers } from "../parsers";
import type { ColorPicker } from "./colorPicker";
import type { Dialogs } from "./dialogs";
import { setOption, type Data, type Library } from "./library";

export type Field = "title" | "description" | "tags" | "date" | "order" | "color";

export interface FieldSpec {
   field: Field;
   label: string;
   icon: string;
   hint: string;
}

export interface EditTarget {
   label: string;
   jsonUri: vscode.Uri;
   fields: FieldSpec[];

   locate: (data: Data) => Option<JsonPath>;
}

export const ALL_FIELDS: FieldSpec[] = [
   { field: "title", label: "Title", icon: "symbol-string", hint: "Shown next to the file name" },
   { field: "description", label: "Description", icon: "note", hint: "One or two sentences, shown after the title" },
   { field: "tags", label: "Tags", icon: "tag", hint: "Comma separated labels" },
   { field: "date", label: "Date", icon: "calendar", hint: "YYYY-MM-DD, the day it was written" },
   { field: "order", label: "Order", icon: "list-ordered", hint: "Position under the card. Lower comes first" },
   { field: "color", label: "Color", icon: "symbol-color", hint: "Row color in the Library view" },
];

type FieldItem = vscode.QuickPickItem & { field: Field };

type FieldEdit = Option<Option<unknown>>;

export class FieldEditor {
   constructor(
      private readonly dialogs: Dialogs,
      private readonly colors: ColorPicker,
      private readonly library: Library,
   ) {}

   async edit(target: EditTarget): Promise<void> {
      while (true) {
         const opened = await this.library.open(target.jsonUri);
         if (!opened.some) {
            return;
         }
         const entryPath = target.locate(opened.value.data);
         if (!entryPath.some) {
            void this.dialogs.warn(`${target.label} is no longer in ${LIBRARY_FILE}.`);
            return;
         }
         const entry = valueAt(opened.value.data, entryPath.value);
         const items: FieldItem[] = target.fields.map((spec) => ({
            label: `$(${spec.icon}) ${spec.label}`,
            description: currentText(entry, spec.field) || "not set",
            detail: spec.hint,
            field: spec.field,
         }));
         const pick = await this.dialogs.pick(items, {
            placeHolder: `Edit ${target.label}. Pick a field, Escape when done`,
            matchOnDescription: true,
         });
         if (!pick.some) {
            return;
         }
         const edit = await this.promptField(pick.value.field, target.label, entry);
         if (edit.some) {
            setOption(opened.value.doc, [...entryPath.value, pick.value.field], edit.value);
            await opened.value.doc.save();
         }
      }
   }

   private async promptField(field: Field, label: string, entry: Data): Promise<FieldEdit> {
      const current = currentText(entry, field);
      switch (field) {
         case "title":
         case "description": {
            const typed = await this.dialogs.input({
               prompt: `${field === "title" ? "Title" : "Description"} for ${label}. Empty removes it`,
               value: current,
            });
            return map(typed, nonEmpty);
         }
         case "tags": {
            const typed = await this.dialogs.input({
               prompt: `Tags for ${label}, separated by commas. Empty removes them`,
               value: current,
               placeHolder: "basics, loops",
            });
            return map(typed, (text) => {
               const tags = parsers.tags.parse(text);
               return tags.length ? some(tags) : none;
            });
         }
         case "date": {
            const now = new Date();
            const today = parsers.day.fromDate(now);
            const typed = await this.dialogs.input({
               prompt: `Date for ${label} as YYYY-MM-DD. Empty removes it`,
               value: current,
               placeHolder: today,
               validateInput: (value) => parsers.day.validate(value),
            });
            return map(typed, nonEmpty);
         }
         case "order": {
            const typed = await this.dialogs.input({
               prompt: `Order for ${label}. A whole number, lower comes first. Empty removes it`,
               value: current,
               validateInput: (value) => parsers.order.validate(value),
            });
            return map(typed, (text) => option(parsers.order.parse(text)));
         }
         case "color": {
            const choice = await this.colors.pick(label, nonEmpty(current));
            return map(choice, (c) => (c.kind === "color" ? some(c.id) : none));
         }
      }
   }
}

function valueAt(data: Data, jsonPath: JsonPath): Data {
   let current: Option<unknown> = some(data);
   for (const segment of jsonPath) {
      if (!current.some || typeof current.value !== "object") {
         return {};
      }
      current = option((current.value as Record<string | number, unknown>)[segment]);
   }
   return current.some && typeof current.value === "object" ? (current.value as Data) : {};
}

function currentText(entry: Data, field: Field): string {
   const value = option(entry[field]);
   if (!value.some) {
      return "";
   }
   return Array.isArray(value.value) ? parsers.tags.format(value.value.map(String)) : String(value.value);
}
