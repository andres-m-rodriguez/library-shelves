export type FilterField = "any" | "color" | "tag" | "cat" | "day";

export interface FilterTerm {
   field: FilterField;
   text: string;
}

export interface FilterQuery {
   terms: FilterTerm[];
}
