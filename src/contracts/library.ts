import type { FileTypeMeta, PreviewValue } from "./preview";
import type { RowSetting } from "./row";
import type { BackgroundMeta } from "./shelf";

export const LIBRARY_FILE = "library.shelf";
export const LEGACY_LIBRARY_FILE = "library.json";
export const SHELF_EXTENSION = ".shelf";
export const LIBRARY_GLOB = `**/{${LEGACY_LIBRARY_FILE},*${SHELF_EXTENSION}}`;

export function isLibraryFile(fsPath: string): boolean {
   const lower = fsPath.toLowerCase();
   const base = lower.slice(Math.max(lower.lastIndexOf("/"), lower.lastIndexOf("\\")) + 1);
   return base === LEGACY_LIBRARY_FILE || (base.endsWith(SHELF_EXTENSION) && base.length > SHELF_EXTENSION.length);
}
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
   background?: BackgroundMeta;
}

export type JsonPath = (string | number)[];
