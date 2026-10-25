import type { Node as JsonNode } from "jsonc-parser";

export interface DeclaredCategory {
   name: string;
   icon: string | undefined;
   color: string | undefined;
   description: string | undefined;
}

export interface CardCategory {
   cardKey: string;
   value: string;
   valueNode: JsonNode;
}

export interface LibraryOutline {
   root: JsonNode | undefined;

   categoriesNode: JsonNode | undefined;
   declared: DeclaredCategory[];
   cards: CardCategory[];
}

export interface JsonProperty {
   key: string;
   keyNode: JsonNode;
   value: JsonNode | undefined;
}
