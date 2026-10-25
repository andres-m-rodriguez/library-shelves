import type { ViewMode } from "../contracts";

export const VIEW_MODES: { mode: ViewMode; label: string; detail: string; icon: string }[] = [
   { mode: "category", label: "Category", detail: "Categories as folders, cards inside, lessons under each card", icon: "folder-library" },
   { mode: "day", label: "Day", detail: "Every lesson filed under the day it was written. Newest day first", icon: "calendar" },
   { mode: "alphabetical", label: "Alphabetical", detail: "All cards in one flat list, A to Z", icon: "list-ordered" },
];

export function viewModeLabel(mode: ViewMode): string {
   return VIEW_MODES.find((m) => m.mode === mode)?.label ?? mode;
}
