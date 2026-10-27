export type RowLabel = "fileName" | "title";

export type RowPart = "fileName" | "title" | "date" | "description" | "tags";

export interface RowSetting {
   label?: RowLabel;
   parts?: RowPart[];
   date?: string;
}

export interface RowConfig {
   label: RowLabel;
   parts: RowPart[];
   date: string;
}
