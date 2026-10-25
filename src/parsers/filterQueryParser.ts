import type { FilterField, FilterQuery, FilterTerm } from "../contracts";

const FIELD_PREFIXES = new Map<string, FilterField>([
   ["color", "color"],
   ["colour", "color"],
   ["tag", "tag"],
   ["tags", "tag"],
   ["cat", "cat"],
   ["category", "cat"],
   ["day", "day"],
   ["date", "day"],
]);

export class FilterQueryParser {
   parse(text: string): FilterQuery {
      const terms = this.tokenize(text).map((token) => this.parseTerm(token));

      const constraining = terms.filter((t) => t.text.length > 0);
      return { terms: constraining };
   }

   tokenize(text: string): string[] {
      const tokens: string[] = [];
      let current = "";
      let quoted = false;
      for (const ch of text) {
         if (ch === '"') {
            quoted = !quoted;
            continue;
         }
         if (!quoted && /\s/.test(ch)) {
            if (current) {
               tokens.push(current);
            }
            current = "";
            continue;
         }
         current += ch;
      }
      if (current) {
         tokens.push(current);
      }
      return tokens;
   }

   parseTerm(token: string): FilterTerm {
      const colon = token.indexOf(":");
      if (colon > 0) {
         const prefix = token.slice(0, colon).toLowerCase();
         const field = FIELD_PREFIXES.get(prefix);
         if (field) {
            const rest = token.slice(colon + 1).toLowerCase();
            return { field, text: rest };
         }
      }
      return { field: "any", text: token.toLowerCase() };
   }

   termsFor(text: string, field: FilterField): string[] {
      return this.parse(text)
         .terms.filter((t) => t.field === field)
         .map((t) => t.text);
   }

   replaceTerms(text: string, field: FilterField, values: string[]): string {
      const kept = this.tokenize(text).filter((token) => this.parseTerm(token).field !== field);
      const added = values.map((value) => `${field}:${quoteIfNeeded(value)}`);
      return [...kept.map(quoteIfNeeded), ...added].join(" ");
   }
}

function quoteIfNeeded(value: string): string {
   return /\s/.test(value) ? `"${value}"` : value;
}
