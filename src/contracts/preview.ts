import type { HoverAction } from "./hover";
import type { RowSetting } from "./row";

export type PreviewPart = "summary" | "code";

export interface PreviewSetting {
   summary?: boolean;
   code?: boolean;
   actions?: HoverAction[];
}

export type PreviewValue = boolean | PreviewSetting;

export interface PreviewConfig {
   summary: boolean;
   code: boolean;
   actions: HoverAction[];
}

export const FILE_TYPES_KEY = "$fileTypes";

export interface FileTypeMeta {
   preview?: PreviewValue;
   row?: RowSetting;
}
