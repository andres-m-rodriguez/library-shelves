import * as path from "path";
import type { HoverAction, Node, PreviewConfig, PreviewSetting, PreviewValue } from "../contracts";
import { isRunnable } from "./running";

export interface ActionSpec {
   icon: string;
   label: string;
}

export const ACTION_SPECS: Record<HoverAction, ActionSpec> = {
   run: { icon: "play", label: "Run" },
   open: { icon: "go-to-file", label: "Open" },
   editDetails: { icon: "edit", label: "Edit Details" },
   openCard: { icon: "book", label: "Open Card" },
   addLesson: { icon: "add", label: "Add Lesson" },
   addCard: { icon: "add", label: "Add Card" },
   newCardFile: { icon: "new-file", label: "New Card File" },
   rename: { icon: "edit", label: "Rename" },
   moveToCategory: { icon: "folder", label: "Move" },
   setIcon: { icon: "symbol-misc", label: "Icon" },
   setColor: { icon: "symbol-color", label: "Color" },
   configurePreview: { icon: "eye", label: "Preview" },
};

export const LESSON_ACTIONS: HoverAction[] = ["run", "open", "editDetails", "openCard", "setColor", "configurePreview"];
export const CARD_ACTIONS: HoverAction[] = ["open", "addLesson", "editDetails", "moveToCategory", "setIcon", "setColor", "configurePreview"];
export const CATEGORY_ACTIONS: HoverAction[] = ["addCard", "newCardFile", "rename", "setIcon", "setColor", "configurePreview"];

export const ALL_ACTIONS: HoverAction[] = [...new Set([...LESSON_ACTIONS, ...CARD_ACTIONS, ...CATEGORY_ACTIONS])];

export const FULL_PREVIEW: PreviewConfig = { summary: true, code: true, actions: ALL_ACTIONS };
export const NO_PREVIEW: PreviewConfig = { summary: false, code: false, actions: [] };

export function actionLabel(action: HoverAction): string {
   const spec = ACTION_SPECS[action];
   return `$(${spec.icon}) ${spec.label}`;
}

export function actionsFor(kind: Node["kind"]): HoverAction[] {
   switch (kind) {
      case "lesson":
         return LESSON_ACTIONS;
      case "card":
         return CARD_ACTIONS;
      case "category":
         return CATEGORY_ACTIONS;
      case "day":
         return [];
   }
}

export function lessonActionsFor(fsPath: string): HoverAction[] {
   return isRunnable(fsPath) ? LESSON_ACTIONS : LESSON_ACTIONS.filter((action) => action !== "run");
}

export function expandPreview(value: PreviewValue): PreviewSetting {
   if (value === true) {
      return { ...FULL_PREVIEW };
   }
   if (value === false) {
      return { ...NO_PREVIEW };
   }
   return value;
}

export function sanitizePreview(value: unknown): PreviewValue | undefined {
   if (typeof value === "boolean") {
      return value;
   }
   if (typeof value !== "object" || !value || Array.isArray(value)) {
      return undefined;
   }
   const raw = value as Record<string, unknown>;
   const setting: PreviewSetting = {};
   if (typeof raw.summary === "boolean") {
      setting.summary = raw.summary;
   }
   if (typeof raw.code === "boolean") {
      setting.code = raw.code;
   }
   if (Array.isArray(raw.actions)) {
      setting.actions = raw.actions.filter((action): action is HoverAction => typeof action === "string" && isAction(action));
   }
   return setting;
}

export function resolvePreview(layers: (PreviewValue | undefined)[]): PreviewConfig {
   const resolved: PreviewConfig = { ...FULL_PREVIEW };
   for (const layer of layers) {
      const clean = sanitizePreview(layer);
      if (clean === undefined) {
         continue;
      }
      const setting = expandPreview(clean);
      if (setting.summary !== undefined) {
         resolved.summary = setting.summary;
      }
      if (setting.code !== undefined) {
         resolved.code = setting.code;
      }
      if (setting.actions !== undefined) {
         resolved.actions = setting.actions;
      }
   }
   return resolved;
}

export function visibleActions(config: PreviewConfig, kind: Node["kind"]): HoverAction[] {
   const allowed = actionsFor(kind);
   return allowed.filter((action) => config.actions.includes(action));
}

export function showsAnything(config: PreviewConfig, kind: Node["kind"]): boolean {
   return config.summary || config.code || visibleActions(config, kind).length > 0;
}

export function extensionOf(fileName: string): string {
   return path.extname(fileName).toLowerCase();
}

export function fileTypeMeta<T>(fileTypes: Record<string, T>, fileName: string): T | undefined {
   const extension = extensionOf(fileName);
   if (!extension) {
      return undefined;
   }
   const entry = Object.entries(fileTypes).find(([key]) => normalizeExtension(key) === extension);
   return entry === undefined ? undefined : entry[1];
}

export function fileTypePreview(fileTypes: Record<string, { preview?: PreviewValue }>, fileName: string): PreviewValue | undefined {
   const meta = fileTypeMeta(fileTypes, fileName);
   return meta === undefined ? undefined : meta.preview;
}

export function normalizeExtension(key: string): string {
   const trimmed = key.trim().toLowerCase();
   if (!trimmed) {
      return "";
   }
   return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function isAction(name: string): name is HoverAction {
   return Object.hasOwn(ACTION_SPECS, name);
}
