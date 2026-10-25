import { parseTree, type JSONPath, type Node as JsonNode } from "jsonc-parser";
import { CATEGORIES_KEY, SCHEMA_KEY, type CardCategory, type JsonProperty, type LibraryOutline } from "../contracts";

export class LibraryOutlineParser {
   parse(text: string): LibraryOutline {
      const root = parseTree(text, [], { allowTrailingComma: true });
      const outline: LibraryOutline = { root, categoriesNode: undefined, declared: [], cards: [] };
      for (const property of this.propertiesOf(root)) {
         if (property.key === SCHEMA_KEY) {
            continue;
         }
         if (property.key === CATEGORIES_KEY) {
            outline.categoriesNode = property.value;
            for (const category of this.propertiesOf(property.value)) {
               outline.declared.push({
                  name: category.key,
                  icon: this.stringProperty(category.value, "icon"),
                  color: this.stringProperty(category.value, "color"),
                  description: this.stringProperty(category.value, "description"),
               });
            }
            continue;
         }
         const categoryProperty = this.propertiesOf(property.value).find((p) => p.key === "category");
         const valueNode = categoryProperty?.value;
         if (valueNode && valueNode.type === "string" && typeof valueNode.value === "string") {
            outline.cards.push({ cardKey: property.key, value: valueNode.value, valueNode });
         }
      }
      return outline;
   }

   undeclaredCards(outline: LibraryOutline): CardCategory[] {
      const declared = new Set(outline.declared.map((c) => normalize(c.name)));
      return outline.cards.filter((card) => card.value.trim() !== "" && !declared.has(normalize(card.value)));
   }

   isCardCategoryPath(jsonPath: JSONPath): boolean {
      if (jsonPath.length !== 2) {
         return false;
      }
      const [cardKey, property] = jsonPath;
      const isCard = typeof cardKey === "string" && cardKey !== CATEGORIES_KEY && cardKey !== SCHEMA_KEY;
      return isCard && property === "category";
   }

   propertiesOf(node: JsonNode | undefined): JsonProperty[] {
      if (!node || node.type !== "object") {
         return [];
      }
      const properties: JsonProperty[] = [];
      for (const child of node.children ?? []) {
         const keyNode = child.children?.[0];
         if (child.type !== "property" || !keyNode || typeof keyNode.value !== "string") {
            continue;
         }
         properties.push({ key: keyNode.value, keyNode, value: child.children?.[1] });
      }
      return properties;
   }

   stringProperty(node: JsonNode | undefined, key: string): string | undefined {
      const property = this.propertiesOf(node).find((p) => p.key === key);
      const value = property?.value;
      return value && value.type === "string" && typeof value.value === "string" ? value.value : undefined;
   }
}

function normalize(name: string): string {
   return name.trim().toLowerCase();
}
