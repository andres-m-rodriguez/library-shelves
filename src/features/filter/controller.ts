import * as vscode from "vscode";
import type { FilterField, FilterTerm } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { option, orElse, raw, type Option } from "../../option";
import { parsers } from "../../parsers";
import { buildPredicate } from "./predicate";

export const STATE_KEY = "library.filterText";
const CONTEXT_KEY = "library.filterActive";
const SUBTITLE_KEY = "filter";

export class FilterController {
   private text = "";

   constructor(private readonly ctx: FeatureContext) {}

   get current(): string {
      return this.text;
   }

   get terms(): FilterTerm[] {
      return parsers.filterQuery.parse(this.text).terms;
   }

   apply(text: string, persist: boolean): void {
      this.text = text.trim();
      const predicate = buildPredicate(this.text);
      this.ctx.tree.filter = raw(predicate);
      this.ctx.tree.refresh();
      this.ctx.setSubtitle(SUBTITLE_KEY, this.terms.map((t) => t.text).join(" · "));
      void vscode.commands.executeCommand("setContext", CONTEXT_KEY, predicate.some);
      if (persist) {
         void this.ctx.context.workspaceState.update(STATE_KEY, this.text);
      }
   }

   setField(field: FilterField, values: string[]): void {
      this.apply(parsers.filterQuery.replaceTerms(this.text, field, values), true);
   }

   remove(term: FilterTerm): void {
      const kept = parsers.filterQuery.tokenize(this.text).filter((token) => {
         const parsed = parsers.filterQuery.parseTerm(token);
         return parsed.field !== term.field || parsed.text !== term.text;
      });
      this.apply(kept.map((token) => (/\s/.test(token) ? `"${token}"` : token)).join(" "), true);
   }

   clear(): void {
      this.apply("", true);
   }
}

export function bump(counts: Map<string, number>, value: Option<string>): void {
   if (value.some && value.value.trim()) {
      const key = value.value.trim().toLowerCase();
      counts.set(key, orElse(option(counts.get(key)), 0) + 1);
   }
}

export function sortedByCount(counts: Map<string, number>): [string, number][] {
   return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
