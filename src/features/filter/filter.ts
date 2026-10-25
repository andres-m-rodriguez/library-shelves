import * as vscode from "vscode";
import type { FilterField, FilterTerm, Node } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { none, raw, some, type Option } from "../../option";
import { plural } from "../../services";
import type { LibraryTree } from "../../tree/libraryTree";
import type { FilterController } from "./controller";
import { pickCategory } from "./filterByCategory";
import { pickColor } from "./filterByColor";
import { pickTag } from "./filterByTag";

const DEBOUNCE_MS = 150;

type Step = { role: "done" } | { role: "color" } | { role: "tag" } | { role: "category" };

type Row = vscode.QuickPickItem & ({ role: "hint" } | { role: "term"; term: FilterTerm });

type Button = vscode.QuickInputButton & (Step | { role: "clear" });

const FIELD_LABELS: Record<FilterField, string> = {
   any: "",
   color: "color",
   tag: "tag",
   cat: "category",
   day: "day",
};

const REMOVE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon("close"), tooltip: "Remove this term" };

const NARROW_BUTTONS: Button[] = [
   { role: "color", iconPath: new vscode.ThemeIcon("symbol-color"), tooltip: "Narrow by color" },
   { role: "tag", iconPath: new vscode.ThemeIcon("tag"), tooltip: "Narrow by tag" },
   { role: "category", iconPath: new vscode.ThemeIcon("folder"), tooltip: "Narrow by category" },
];

const CLEAR_BUTTON: Button = { role: "clear", iconPath: new vscode.ThemeIcon("clear-all"), tooltip: "Clear the filter" };

export async function openFilter(ctx: FeatureContext, controller: FilterController): Promise<void> {
   while (true) {
      const step = await showFilter(ctx, controller);
      switch (step.role) {
         case "done":
            return;
         case "color":
            await pickColor(ctx, controller);
            break;
         case "tag":
            await pickTag(ctx, controller);
            break;
         case "category":
            await pickCategory(ctx, controller);
            break;
      }
   }
}

function showFilter(ctx: FeatureContext, controller: FilterController): Promise<Step> {
   return new Promise((resolve) => {
      const quickPick = vscode.window.createQuickPick<Row>();
      quickPick.placeholder = "Type to filter. Enter keeps it, Escape too";
      quickPick.value = controller.current;
      quickPick.matchOnDescription = false;
      quickPick.matchOnDetail = false;

      const refresh = () => {
         quickPick.title = titleFor(ctx.tree);
         quickPick.items = rowsFor(controller);
         quickPick.buttons = quickPick.value.trim() || controller.terms.length ? [...NARROW_BUTTONS, CLEAR_BUTTON] : NARROW_BUTTONS;
      };
      refresh();

      let next: Step = { role: "done" };
      let timer: Option<NodeJS.Timeout> = none;
      const cancelPending = () => {
         if (timer.some) {
            clearTimeout(timer.value);
            timer = none;
         }
      };
      quickPick.onDidChangeValue(() => {
         cancelPending();
         timer = some(
            setTimeout(() => {
               timer = none;
               controller.apply(quickPick.value, false);
               refresh();
            }, DEBOUNCE_MS),
         );
      });
      quickPick.onDidTriggerItemButton((event) => {
         if (event.item.role === "term") {
            cancelPending();
            controller.remove(event.item.term);
            quickPick.value = controller.current;
            refresh();
         }
      });
      quickPick.onDidTriggerButton((button) => {
         const pressed = button as Button;
         if (pressed.role === "clear") {
            cancelPending();
            controller.clear();
            quickPick.value = "";
            refresh();
            return;
         }
         next = pressed;
         quickPick.hide();
      });
      quickPick.onDidAccept(() => quickPick.hide());
      quickPick.onDidHide(() => {
         cancelPending();
         controller.apply(quickPick.value, true);
         quickPick.dispose();
         resolve(next);
      });
      quickPick.show();
   });
}

function titleFor(tree: LibraryTree): string {
   const total = tree.cards.reduce((sum, card) => sum + card.lessons.length, 0);
   if (!total) {
      return "Filter";
   }
   const shown = countVisibleLessons(tree, none);
   return `Filter · ${shown} of ${plural(total, "lesson")}`;
}

function rowsFor(controller: FilterController): Row[] {
   const terms = controller.terms;
   if (!terms.length) {
      return [{ role: "hint", label: "Nothing filtered yet. Type above, or use the buttons to narrow by color, tag or category", alwaysShow: true }];
   }
   return terms.map((term) => ({
      role: "term",
      term,
      label: term.text,
      description: FIELD_LABELS[term.field],
      buttons: [REMOVE_BUTTON],
      alwaysShow: true,
   }));
}

function countVisibleLessons(tree: LibraryTree, node: Option<Node>): number {
   let count = 0;
   for (const child of tree.getChildren(raw(node))) {
      count += child.kind === "lesson" ? 1 : countVisibleLessons(tree, some(child));
   }
   return count;
}
