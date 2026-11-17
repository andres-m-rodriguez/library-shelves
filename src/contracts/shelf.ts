export const SHELF_VIEW_TYPE = "library.shelf";
export const BACKGROUND_KEY = "$background";

// How a card's tile looks: "classic" shows everything at once, "reveal" shows only the title
// until the tile is hovered, "cover" looks like a book cover with a large initial.
export const CARD_STYLES = ["classic", "reveal", "cover"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];
export const DEFAULT_CARD_STYLE: CardStyle = "classic";
export const CARD_STYLE_SETTING = "cardStyle";

export const GRAPH_KEY = "$graph";

// The graph page draws cards as nodes and their dependencies as arrows. "down" puts what
// a card builds on above it, "right" puts it to the left.
export const GRAPH_DIRECTIONS = ["down", "right"] as const;
export type GraphDirection = (typeof GRAPH_DIRECTIONS)[number];
export const GRAPH_EDGES = ["curved", "straight", "elbow"] as const;
export type GraphEdges = (typeof GRAPH_EDGES)[number];

export const DEFAULT_GRAPH_DIRECTION: GraphDirection = "down";
export const DEFAULT_GRAPH_EDGES: GraphEdges = "curved";

export interface GraphMeta {
   direction?: GraphDirection;
   edges?: GraphEdges;
}

export interface ShelfGraph {
   direction: GraphDirection;
   edges: GraphEdges;
}

export interface Point {
   x: number;
   y: number;
}

export const BACKGROUND_FITS = ["cover", "contain", "tile"] as const;
export type BackgroundFit = (typeof BACKGROUND_FITS)[number];

export const DEFAULT_BACKGROUND_DIM = 0.7;
export const DEFAULT_BACKGROUND_FIT: BackgroundFit = "cover";

// The picture behind the shelves: a file next to the library, how strongly the editor
// color is laid over it (0 shows it untouched, 1 hides it) and how it fills the window.
export interface BackgroundMeta {
   image?: string;
   dim?: number;
   fit?: BackgroundFit;
}

export interface ShelfBackground {
   image: string;
   dim: number;
   fit: BackgroundFit;
}

export interface ShelfLesson {
   name: string;
   label: string;
   fileName: string;
   detail: string;
   tags: string[];
   color: string;
   exists: boolean;
   runnable: boolean;
}

export interface ShelfCard {
   key: string;
   label: string;
   fileName: string;
   description: string;
   color: string;
   exists: boolean;
   runnable: boolean;
   lessons: ShelfLesson[];
   dependsOn: string[];
   position?: Point;
}

export interface ShelfCategory {
   name: string;
   description: string;
   color: string;
   cards: ShelfCard[];
}

export interface ShelfModel {
   categories: ShelfCategory[];
   uncategorized: ShelfCard[];
}

export type ShelfRef =
   | { kind: "category"; name: string }
   | { kind: "card"; key: string }
   | { kind: "lesson"; cardKey: string; name: string };

export const SHELF_ACTIONS = [
   "open",
   "run",
   "newCard",
   "addLesson",
   "newLessonFile",
   "editDetails",
   "moveToCategory",
   "setIcon",
   "setColor",
   "setDependencies",
   "renameCategory",
   "removeCard",
   "removeLesson",
   "removeCategory",
] as const;

export type ShelfAction = (typeof SHELF_ACTIONS)[number];

export type ShelfMessage =
   | { type: "ready" }
   | { type: "newCard" }
   | { type: "newCategory" }
   | { type: "openText" }
   | { type: "background" }
   | { type: "cardStyle"; style: CardStyle }
   | { type: "positions"; positions: Record<string, Point> }
   | { type: "resetLayout" }
   | { type: "link"; prerequisite: string; card: string }
   | { type: "unlink"; prerequisite: string; card: string }
   | { type: "graphDirection"; value: GraphDirection }
   | { type: "graphEdges"; value: GraphEdges }
   | { type: "action"; action: ShelfAction; ref: ShelfRef };
