import type { DragRef } from "./dragDrop";

export type HoverRef = DragRef | { kind: "category"; json: string; name: string };

export type HoverAction =
   | "open"
   | "openCard"
   | "run"
   | "editDetails"
   | "addLesson"
   | "addCard"
   | "newCardFile"
   | "rename"
   | "moveToCategory"
   | "setIcon"
   | "setColor"
   | "configurePreview";
