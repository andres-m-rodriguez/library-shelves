import * as vscode from "vscode";
import { LIBRARY_FILE, type Node, type RowConfig, type RowLabel, type RowPart, type RowSetting } from "../../contracts";
import { dayKey } from "../../dates";
import type { FeatureContext } from "../../extension";
import {
   CARD_PARTS,
   DATE_FORMATS,
   DATE_TOKENS,
   ROW_LABEL_NAMES,
   ROW_LABELS,
   ROW_PART_NAMES,
   ROW_PARTS,
   SMART_DATE,
   dateExample,
   resolveRow,
   sanitizeRow,
} from "../../library/rows";
import { compact, flatMap, none, option, some, type Option } from "../../option";
import { setOption } from "../../services";
import { jsonUriOf } from "../shared/nodes";
import { layerIndex, pickScope, scopeLabel, settingPathOf, type Scope } from "./scopes";

export type RowKey = keyof RowSetting;

export type RowValue<K extends RowKey> = NonNullable<RowSetting[K]>;

type HubItem = vscode.QuickPickItem & ({ role: "label" } | { role: "parts" } | { role: "date" } | { role: "inherit" } | { role: "separator" });

type LabelItem = vscode.QuickPickItem & ({ role: "label"; value: RowLabel } | { role: "inherit" } | { role: "separator" });

type PartItem = vscode.QuickPickItem & { part: RowPart };

type DateItem = vscode.QuickPickItem & ({ role: "pattern"; pattern: string } | { role: "custom" } | { role: "inherit" } | { role: "separator" });

interface RowState {
   label: string;
   scope: Scope;
   inheritedLayers: RowSetting[];
   inherited: RowConfig;
   own: Option<RowSetting>;
   todayKey: string;
}

const PART_ICONS: Record<RowPart, string> = {
   fileName: "file",
   title: "symbol-string",
   date: "calendar",
   description: "note",
   tags: "tag",
};

const SEPARATOR: vscode.QuickPickItem & { role: "separator" } = { role: "separator", label: "", kind: vscode.QuickPickItemKind.Separator };

const INHERITED_SUFFIX = " (inherited)";

const DATE_TOKEN_LIST = DATE_TOKENS.map(([token]) => token).join(", ");

const DATE_TOKEN_MEANINGS = DATE_TOKENS.map(([token, meaning]) => `${token} ${meaning}`).join(", ");

export async function configureRow(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const target = ctx.selection.first(node);
   if (!target.some || target.value.kind === "day") {
      ctx.dialogs.info("Right-click a category, card or lesson in the Library view to configure its row.");
      return;
   }
   const row = target.value;
   const scope = await pickScope(ctx, row, "row");
   if (!scope.some) {
      return;
   }
   const layers = ctx.tree.rowLayers(row);
   const ownIndex = layerIndex(row, scope.value);
   const inheritedOptions = layers.slice(0, ownIndex).map((layer) => option(layer));
   const inheritedLayers = compact(inheritedOptions);
   const ownLayer = option(layers[ownIndex]);
   const state: RowState = {
      label: scopeLabel(scope.value),
      scope: scope.value,
      inheritedLayers,
      inherited: resolveRow(inheritedLayers),
      own: flatMap(ownLayer, (layer) => option(sanitizeRow(layer))),
      todayKey: dayKey(Date.now()),
   };
   while (true) {
      const effective = effectiveOf(state);
      const items = hubItems(state, effective);
      const pick = await ctx.dialogs.pick(items, {
         title: `Row for ${state.label}`,
         placeHolder: "Pick what to change, Escape when done",
         matchOnDescription: true,
      });
      if (!pick.some) {
         return;
      }
      const next = await editItem(ctx, pick.value, state, effective);
      if (!next.some) {
         continue;
      }
      const written = await writeRow(ctx, row, state, next.value);
      if (!written) {
         return;
      }
      state.own = next.value;
   }
}

export function rowValueOf(own: RowSetting, inherited: RowConfig): Option<RowSetting> {
   const setting: RowSetting = {};
   const label = option(own.label);
   if (label.some && label.value !== inherited.label) {
      setting.label = label.value;
   }
   const parts = option(own.parts);
   if (parts.some && !sameParts(parts.value, inherited.parts)) {
      setting.parts = parts.value;
   }
   const date = option(own.date);
   if (date.some && date.value !== inherited.date) {
      setting.date = date.value;
   }
   return hasAnyKey(setting) ? some(setting) : none;
}

export function withKey<K extends RowKey>(own: Option<RowSetting>, key: K, value: Option<RowValue<K>>): RowSetting {
   const next: RowSetting = own.some ? { ...own.value } : {};
   if (value.some) {
      next[key] = value.value;
   } else {
      delete next[key];
   }
   return next;
}

export function sameParts(a: RowPart[], b: RowPart[]): boolean {
   return a.length === b.length && a.every((part, index) => part === b[index]);
}

function effectiveOf(state: RowState): RowConfig {
   const ownLayers = compact([state.own]);
   return resolveRow([...state.inheritedLayers, ...ownLayers]);
}

function hubItems(state: RowState, effective: RowConfig): HubItem[] {
   const items: HubItem[] = [
      { role: "label", label: "$(symbol-string) Label", description: `${ROW_LABEL_NAMES[effective.label]}${suffixOf(state.own, "label")}` },
      { role: "parts", label: "$(list-flat) Next to it", description: `${partsText(effective.parts)}${suffixOf(state.own, "parts")}` },
      {
         role: "date",
         label: "$(calendar) Date format",
         description: `${effective.date}  ${dateExample(effective.date, state.todayKey)}${suffixOf(state.own, "date")}`,
      },
   ];
   if (state.own.some && hasAnyKey(state.own.value)) {
      items.push(SEPARATOR, { role: "inherit", label: "$(discard) Inherit everything", description: "remove this row setting" });
   }
   return items;
}

async function editItem(ctx: FeatureContext, item: HubItem, state: RowState, effective: RowConfig): Promise<Option<Option<RowSetting>>> {
   switch (item.role) {
      case "label":
         return editLabel(ctx, state, effective);
      case "parts":
         return editParts(ctx, state, effective);
      case "date":
         return editDate(ctx, state, effective);
      case "inherit":
         return some(none);
      case "separator":
         return none;
   }
}

async function editLabel(ctx: FeatureContext, state: RowState, effective: RowConfig): Promise<Option<Option<RowSetting>>> {
   const items: LabelItem[] = ROW_LABELS.map((value) => ({
      role: "label",
      value,
      label: ROW_LABEL_NAMES[value],
      description: value === effective.label ? "current" : "",
   }));
   if (hasKey(state.own, "label")) {
      items.push(SEPARATOR, { role: "inherit", label: "$(discard) Inherit", description: `${ROW_LABEL_NAMES[state.inherited.label]} from the rows above` });
   }
   const pick = await ctx.dialogs.pick(items, { title: `Label for ${state.label}`, placeHolder: "What the row starts with" });
   if (!pick.some || pick.value.role === "separator") {
      return none;
   }
   const value: Option<RowLabel> = pick.value.role === "label" ? some(pick.value.value) : none;
   return some(nextOwn(state, "label", value));
}

async function editParts(ctx: FeatureContext, state: RowState, effective: RowConfig): Promise<Option<Option<RowSetting>>> {
   const items: PartItem[] = ROW_PARTS.map((part) => ({
      part,
      label: `$(${PART_ICONS[part]}) ${ROW_PART_NAMES[part]}`,
      description: CARD_PARTS.includes(part) ? "" : "lessons only",
   }));
   const picked = items.filter((item) => effective.parts.includes(item.part));
   const choice = await ctx.dialogs.pickParts(items, picked, {
      title: `Next to the label for ${state.label}`,
      placeholder: "Check what the row shows after its label",
      resetTooltip: "Inherit (remove this key)",
   });
   if (!choice.some) {
      return none;
   }
   if (choice.value.kind === "reset") {
      return some(nextOwn(state, "parts", none));
   }
   const chosen = choice.value.items;
   const parts = ROW_PARTS.filter((part) => chosen.some((item) => item.part === part));
   return some(nextOwn(state, "parts", some(parts)));
}

async function editDate(ctx: FeatureContext, state: RowState, effective: RowConfig): Promise<Option<Option<RowSetting>>> {
   const items: DateItem[] = DATE_FORMATS.map((format) => ({
      role: "pattern",
      pattern: format.pattern,
      label: format.pattern === SMART_DATE ? "Smart" : format.pattern,
      description: markCurrent(format.pattern === effective.date, dateExample(format.pattern, state.todayKey)),
      detail: format.label,
   }));
   items.push(SEPARATOR, { role: "custom", label: "$(edit) Custom pattern...", description: DATE_TOKEN_LIST, detail: DATE_TOKEN_MEANINGS });
   if (hasKey(state.own, "date")) {
      items.push({ role: "inherit", label: "$(discard) Inherit", description: `${state.inherited.date} from the rows above` });
   }
   const pick = await ctx.dialogs.pick(items, {
      title: `Date format for ${state.label}`,
      placeHolder: "How lesson dates read in the row",
      matchOnDescription: true,
      matchOnDetail: true,
   });
   if (!pick.some) {
      return none;
   }
   switch (pick.value.role) {
      case "pattern":
         return some(nextOwn(state, "date", some(pick.value.pattern)));
      case "custom": {
         const pattern = await customPattern(ctx, state, effective);
         if (!pattern.some) {
            return none;
         }
         ctx.dialogs.status(`${pattern.value} shows today as ${dateExample(pattern.value, state.todayKey)}`);
         return some(nextOwn(state, "date", pattern));
      }
      case "inherit":
         return some(nextOwn(state, "date", none));
      case "separator":
         return none;
   }
}

async function customPattern(ctx: FeatureContext, state: RowState, effective: RowConfig): Promise<Option<string>> {
   const typed = await ctx.dialogs.input({
      title: `Date format for ${state.label}`,
      prompt: "Date pattern. Tokens: YYYY, YY, MMMM, MMM, MM, M, DD, D, dddd, ddd",
      value: effective.date === SMART_DATE ? "" : effective.date,
      placeHolder: "MM/DD",
      validateInput: (text) => (text.trim() ? "" : "Type a date pattern"),
   });
   return flatMap(typed, (text) => (text ? some(text) : none));
}

function nextOwn<K extends RowKey>(state: RowState, key: K, value: Option<RowValue<K>>): Option<RowSetting> {
   const setting = withKey(state.own, key, value);
   return rowValueOf(setting, state.inherited);
}

async function writeRow(ctx: FeatureContext, row: Node, state: RowState, value: Option<RowSetting>): Promise<boolean> {
   let located = false;
   await ctx.library.edit(jsonUriOf(row), (doc, data) => {
      const rowPath = settingPathOf(data, state.scope, "row");
      if (!rowPath.some) {
         void ctx.dialogs.warn(`${state.label} is no longer in ${LIBRARY_FILE}.`);
         return;
      }
      setOption(doc, rowPath.value, value);
      located = true;
   });
   if (located) {
      ctx.dialogs.status(value.some ? `Row for ${state.label} updated` : `Row for ${state.label} now inherited`);
   }
   return located;
}

function hasKey(own: Option<RowSetting>, key: RowKey): boolean {
   return own.some && option(own.value[key]).some;
}

function hasAnyKey(setting: RowSetting): boolean {
   return Object.keys(setting).length > 0;
}

function suffixOf(own: Option<RowSetting>, key: RowKey): string {
   return hasKey(own, key) ? "" : INHERITED_SUFFIX;
}

function partsText(parts: RowPart[]): string {
   return parts.length ? parts.map((part) => ROW_PART_NAMES[part]).join(", ") : "nothing";
}

function markCurrent(current: boolean, text: string): string {
   return current ? `current  ${text}` : text;
}
