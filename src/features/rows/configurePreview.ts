import * as vscode from "vscode";
import { LIBRARY_FILE, type HoverAction, type Node, type PreviewConfig, type PreviewValue } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { ALL_ACTIONS, actionLabel, lessonActionsFor, resolvePreview } from "../../library/preview";
import { none, some, type Option } from "../../option";
import { setOption } from "../../services";
import { jsonUriOf } from "../shared/nodes";
import { layerIndex, pickScope, scopeLabel, settingPathOf, type Scope } from "./scopes";

type PartItem = vscode.QuickPickItem & ({ role: "summary" } | { role: "code" } | { role: "action"; action: HoverAction } | { role: "separator" });

export interface Parts {
   summary: boolean;
   code: boolean;
   actions: HoverAction[];
}

export async function configurePreview(ctx: FeatureContext, node: Option<Node>): Promise<void> {
   const target = ctx.selection.first(node);
   if (!target.some || target.value.kind === "day") {
      ctx.dialogs.info("Right-click a category, card or lesson in the Library view to configure its preview.");
      return;
   }
   const row = target.value;
   const scope = await pickScope(ctx, row, "preview");
   if (!scope.some) {
      return;
   }
   const label = scopeLabel(scope.value);
   const actions = actionsForScope(scope.value);
   const layers = ctx.tree.previewLayers(row);
   const ownIndex = layerIndex(row, scope.value);
   const effective = resolvePreview(layers.slice(0, ownIndex + 1));
   const inherited = resolvePreview(layers.slice(0, ownIndex));
   const items = partItems(actions);
   const picked = items.filter((item) => isEffective(item, effective));
   const choice = await ctx.dialogs.pickParts(items, picked, {
      title: `Preview for ${label}`,
      placeholder: "Check what the hover shows. Unchecked parts are hidden.",
      resetTooltip: "Inherit (remove this setting)",
   });
   if (!choice.some) {
      return;
   }
   const value = choice.value.kind === "reset" ? none : previewValueOf(partsOf(choice.value.items, actions), inherited, actions);
   let located = false;
   await ctx.library.edit(jsonUriOf(row), (doc, data) => {
      const previewPath = settingPathOf(data, scope.value, "preview");
      if (!previewPath.some) {
         void ctx.dialogs.warn(`${label} is no longer in ${LIBRARY_FILE}.`);
         return;
      }
      setOption(doc, previewPath.value, value);
      located = true;
   });
   if (located) {
      ctx.dialogs.status(value.some ? `Preview for ${label} updated` : `Preview for ${label} now inherited`);
   }
}

function actionsForScope(scope: Scope): HoverAction[] {
   return scope.role === "lesson" ? lessonActionsFor(scope.lesson.uri.fsPath) : ALL_ACTIONS;
}

function partItems(actions: HoverAction[]): PartItem[] {
   const actionItems = actions.map((action): PartItem => ({ role: "action", action, label: actionLabel(action) }));
   return [
      { role: "summary", label: "$(list-flat) Summary", description: "name, category, tags and date" },
      { role: "code", label: "$(code) Code excerpt", description: "first lines of the file" },
      { role: "separator", label: "", kind: vscode.QuickPickItemKind.Separator },
      ...actionItems,
   ];
}

function isEffective(item: PartItem, effective: PreviewConfig): boolean {
   switch (item.role) {
      case "summary":
         return effective.summary;
      case "code":
         return effective.code;
      case "action":
         return effective.actions.includes(item.action);
      case "separator":
         return false;
   }
}

function partsOf(picked: PartItem[], actions: HoverAction[]): Parts {
   const summary = picked.some((item) => item.role === "summary");
   const code = picked.some((item) => item.role === "code");
   const chosen = actions.filter((action) => picked.some((item) => item.role === "action" && item.action === action));
   return { summary, code, actions: chosen };
}

export function previewValueOf(parts: Parts, inherited: PreviewConfig, actions: HoverAction[]): Option<PreviewValue> {
   const inheritedActions = actions.filter((action) => inherited.actions.includes(action));
   const summaryDiffers = parts.summary !== inherited.summary;
   const codeDiffers = parts.code !== inherited.code;
   const actionsDiffer = !sameActions(parts.actions, inheritedActions);
   if (!summaryDiffers && !codeDiffers && !actionsDiffer) {
      return none;
   }
   if (parts.summary && parts.code && parts.actions.length === actions.length) {
      return some(true);
   }
   if (!parts.summary && !parts.code && !parts.actions.length) {
      return some(false);
   }
   const setting: PreviewValue = {};
   if (summaryDiffers) {
      setting.summary = parts.summary;
   }
   if (codeDiffers) {
      setting.code = parts.code;
   }
   if (actionsDiffer) {
      setting.actions = parts.actions;
   }
   return some(setting);
}

function sameActions(a: HoverAction[], b: HoverAction[]): boolean {
   return a.length === b.length && a.every((action) => b.includes(action));
}
