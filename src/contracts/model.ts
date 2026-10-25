import type * as vscode from "vscode";
import type { CardMeta, CategoryMeta, LessonMeta } from "./library";

export interface Lesson {
   uri: vscode.Uri;
   exists: boolean;
   meta: LessonMeta;
   card: Card;
   day: string;
}

export interface Card {
   uri: vscode.Uri;
   name: string;
   exists: boolean;
   meta: CardMeta;
   lessons: Lesson[];
   jsonUri: vscode.Uri;
   key: string;
}

export interface Category {
   name: string;
   cards: Card[];
   meta: CategoryMeta;
   jsonUri: vscode.Uri;
}

export interface Day {
   key: string;
   lessons: Lesson[];
}

export type Node =
   | { kind: "category"; category: Category }
   | { kind: "day"; day: Day }
   | { kind: "card"; card: Card }
   | { kind: "lesson"; lesson: Lesson };

export type CategoryNode = Extract<Node, { kind: "category" }>;
export type DayNode = Extract<Node, { kind: "day" }>;
export type CardNode = Extract<Node, { kind: "card" }>;
export type LessonNode = Extract<Node, { kind: "lesson" }>;

export type ViewMode = "category" | "day" | "alphabetical";
