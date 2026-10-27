import type { FileTypeMeta, PreviewValue } from "./preview";
import type { RowSetting } from "./row";

export const LIBRARY_FILE = "library.json";
export const CATEGORIES_KEY = "$categories";
export const SCHEMA_KEY = "$schema";

export interface LessonMeta {
   name: string;
   order?: number;
   title?: string;
   description?: string;
   color?: string;
   tags?: string[];
   date?: string;
   preview?: PreviewValue;
   row?: RowSetting;
}

export interface CardMeta {
   category?: string;
   order?: number;
   title?: string;
   description?: string;
   color?: string;
   icon?: string;
   lessons?: LessonMeta[];
   preview?: PreviewValue;
   row?: RowSetting;
}

export interface CategoryMeta {
   icon?: string;
   color?: string;
   order?: number;
   description?: string;
   preview?: PreviewValue;
   row?: RowSetting;
}

export interface LibraryFile {
   cards: Record<string, CardMeta>;
   categories: Record<string, CategoryMeta>;
   fileTypes: Record<string, FileTypeMeta>;
}

export type JsonPath = (string | number)[];
