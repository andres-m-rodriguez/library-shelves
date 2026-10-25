import * as path from "path";
import type { FilterField, FilterTerm, Node } from "../../contracts";
import { dayLabel, longDate } from "../../dates";
import { none, option, orElse, some, type Option } from "../../option";
import { parsers } from "../../parsers";

function texts(...values: unknown[]): string[] {
   return values.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function fieldValues(node: Node, field: FilterField): string[] {
   switch (node.kind) {
      case "lesson": {
         const { meta, card, day } = node.lesson;
         const tags = orElse(option(meta.tags), []);
         switch (field) {
            case "any":
               return texts(path.basename(meta.name), meta.name, meta.title, meta.description, ...tags, meta.date, day);
            case "color":
               return texts(meta.color);
            case "tag":
               return tags;
            case "cat":
               return texts(card.meta.category);
            case "day":
               return texts(meta.date, day);
         }
      }

      case "card": {
         const { card } = node;
         switch (field) {
            case "any":
               return texts(card.name, card.key, card.meta.title, card.meta.description, card.meta.category);
            case "color":
               return texts(card.meta.color);
            case "cat":
               return texts(card.meta.category);
            default:
               return [];
         }
      }
      case "category": {
         const { category } = node;
         switch (field) {
            case "any":
               return texts(category.name, category.meta.description);
            case "color":
               return texts(category.meta.color);
            case "cat":
               return [category.name];
            default:
               return [];
         }
      }
      case "day": {
         const { key } = node.day;
         switch (field) {
            case "any":
               return [key, dayLabel(key), longDate(key)];
            case "day":
               return [key];
            default:
               return [];
         }
      }
   }
}

function termMatches(term: FilterTerm, values: string[]): boolean {
   return values.some((value) => {
      const haystack = value.toLowerCase();

      return haystack.includes(term.text) || (term.field === "color" && parsers.color.same(haystack, term.text));
   });
}

export function buildPredicate(text: string): Option<(node: Node) => boolean> {
   const { terms } = parsers.filterQuery.parse(text);
   if (!terms.length) {
      return none;
   }
   return some((node) => terms.every((term) => termMatches(term, fieldValues(node, term.field))));
}
