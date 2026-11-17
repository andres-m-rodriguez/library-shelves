import type * as vscode from "vscode";
import { GRAPH_KEY, type Point } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { dependencyMap, wouldCycle } from "../../library/graph";
import { option } from "../../option";
import { parsers } from "../../parsers";

// The writes behind the graph page. A dependency is stored on the card that needs
// the other one, as dependsOn; a node's place is stored on its card as position.

export async function savePositions(ctx: FeatureContext, uri: vscode.Uri, positions: Record<string, Point>): Promise<void> {
   await ctx.library.edit(uri, (doc, data) => {
      for (const [key] of parsers.libraryFile.cards(data)) {
         const position = option(positions[key]);
         if (position.some) {
            doc.set([key, "position"], { x: position.value.x, y: position.value.y });
         }
      }
   });
}

export async function resetLayout(ctx: FeatureContext, uri: vscode.Uri): Promise<void> {
   await ctx.library.edit(uri, (doc, data) => {
      for (const [key, meta] of parsers.libraryFile.cards(data)) {
         if ("position" in meta) {
            doc.remove([key, "position"]);
         }
      }
   });
}

export async function link(ctx: FeatureContext, uri: vscode.Uri, prerequisite: string, card: string): Promise<void> {
   const problems: string[] = [];
   await ctx.library.edit(uri, (doc, data) => {
      const dependencies = dependencyMap(parsers.libraryFile.cards(data));
      const current = option(dependencies.get(card));
      if (!current.some || !dependencies.has(prerequisite)) {
         problems.push("That card is no longer in the library.");
         return;
      }
      if (current.value.includes(prerequisite)) {
         return;
      }
      if (wouldCycle(dependencies, prerequisite, card)) {
         problems.push(
            prerequisite === card
               ? "A card cannot depend on itself."
               : `${prerequisite} already builds on ${card}, so this would make a loop.`,
         );
         return;
      }
      doc.set([card, "dependsOn"], [...current.value, prerequisite]);
   });
   if (problems.length) {
      ctx.dialogs.info(problems[0]);
   }
}

export async function unlink(ctx: FeatureContext, uri: vscode.Uri, prerequisite: string, card: string): Promise<void> {
   await ctx.library.edit(uri, (doc, data) => {
      const current = option(dependencyMap(parsers.libraryFile.cards(data)).get(card));
      if (!current.some || !current.value.includes(prerequisite)) {
         return;
      }
      const kept = current.value.filter((key) => key !== prerequisite);
      if (kept.length) {
         doc.set([card, "dependsOn"], kept);
      } else {
         doc.remove([card, "dependsOn"]);
      }
   });
}

export async function setGraphOption(ctx: FeatureContext, uri: vscode.Uri, name: "direction" | "edges", value: string): Promise<void> {
   await ctx.library.edit(uri, (doc, data) => {
      doc.set([GRAPH_KEY, name], value);
      // Saved places were arranged for the old direction, so the cards are laid out afresh.
      if (name === "direction") {
         for (const [key, meta] of parsers.libraryFile.cards(data)) {
            if ("position" in meta) {
               doc.remove([key, "position"]);
            }
         }
      }
   });
}
