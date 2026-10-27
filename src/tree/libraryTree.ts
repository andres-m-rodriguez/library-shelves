import * as path from "path";
import * as vscode from "vscode";
import {
   LIBRARY_FILE,
   TREE_MIME,
   URI_LIST_MIME,
   type Card,
   type Category,
   type CategoryMeta,
   type Day,
   type DragRef,
   type FileTypeMeta,
   type HoverRef,
   type IconCatalog,
   type Lesson,
   type Node,
   type PreviewConfig,
   type PreviewValue,
   type RowConfig,
   type RowPart,
   type RowSetting,
   type ViewMode,
} from "../contracts";
import { dayKey, dayLabel, longDate } from "../dates";
import { exists, isDirectory, statOrUndefined, toRelative } from "../library/files";
import { EMPTY_CATALOG } from "../library/icons";
import { readMapping } from "../library/jsonDocument";
import { fileTypeMeta, resolvePreview } from "../library/preview";
import { formatDay, resolveRow } from "../library/rows";
import { writeCardOrder, writeCategoryOrder, writeLessonDate, writeLessonOrder } from "../library/writes";
import { parsers } from "../parsers";
import { HoverCards } from "./hoverCards";
import { nodeId } from "./nodeId";

export const LIBRARY_SCHEME = "library";

type CategoryRef = Extract<DragRef, { kind: "category" }>;
type CardRef = Extract<DragRef, { kind: "card" }>;
type LessonRef = Extract<DragRef, { kind: "lesson" }>;
type RowNode = Extract<Node, { kind: "card" | "lesson" }>;

interface LayerMeta {
   preview?: PreviewValue;
   row?: RowSetting;
}

interface RowMeta {
   title?: string;
}

interface Ordered {
   uri: vscode.Uri;
   meta: { order?: number };
}

interface KnownCategory {
   meta: CategoryMeta;
   jsonUri: vscode.Uri;
   written: string;
}

export class LibraryTree
   implements vscode.TreeDataProvider<Node>, vscode.TreeDragAndDropController<Node>, vscode.FileDecorationProvider
{
   private readonly changed = new vscode.EventEmitter<Node | undefined>();
   readonly onDidChangeTreeData = this.changed.event;

   private readonly decorationsChanged = new vscode.EventEmitter<undefined>();
   readonly onDidChangeFileDecorations = this.decorationsChanged.event;

   readonly dragMimeTypes = [TREE_MIME, URI_LIST_MIME];
   readonly dropMimeTypes = [TREE_MIME, URI_LIST_MIME];

   cards: Card[] = [];
   categories: Category[] = [];
   uncategorized: Card[] = [];
   days: Day[] = [];

   filter: ((node: Node) => boolean) | undefined;

   mode: ViewMode = "category";
   icons: IconCatalog = EMPTY_CATALOG;

   private readonly decorated = new Map<string, string | undefined>();
   private readonly hoverCards = new HoverCards();
   fileTypes = new Map<string, Record<string, FileTypeMeta>>();

   refresh(): void {
      this.changed.fire(undefined);
      this.decorationsChanged.fire(undefined);
   }

   private visible(nodes: Node[]): Node[] {
      const f = this.filter;
      if (!f) {
         return nodes;
      }
      const keep = (node: Node): boolean => f(node) || this.getChildren(node).length > 0;
      return nodes.filter(keep);
   }

   async load(): Promise<void> {
      const cards: Card[] = [];
      const categoryMeta = new Map<string, KnownCategory>();
      const jsonFiles = await vscode.workspace.findFiles(`**/${LIBRARY_FILE}`, "**/node_modules/**");
      this.fileTypes.clear();

      for (const jsonUri of jsonFiles) {
         const folder = path.dirname(jsonUri.fsPath);
         const mapping = await readMapping(jsonUri);
         this.fileTypes.set(jsonUri.fsPath, mapping.fileTypes);
         for (const [name, meta] of Object.entries(mapping.categories)) {
            categoryMeta.set(name.trim().toLowerCase(), { meta, jsonUri, written: name.trim() });
         }
         for (const [key, meta] of Object.entries(mapping.cards)) {
            const cardUri = vscode.Uri.file(path.resolve(folder, key));
            const cardExists = await exists(cardUri);
            const card: Card = {
               uri: cardUri,
               name: path.basename(cardUri.fsPath),
               exists: cardExists,
               meta,
               lessons: [],
               jsonUri,
               key,
            };
            for (const lessonMeta of meta.lessons ?? []) {
               const lessonUri = vscode.Uri.file(path.resolve(folder, lessonMeta.name));
               const stat = await statOrUndefined(lessonUri);
               const day = lessonMeta.date ?? dayKey(stat?.mtime ?? 0);
               card.lessons.push({ uri: lessonUri, exists: !!stat, meta: lessonMeta, card, day });
            }
            card.lessons.sort(byOrderThenName);
            cards.push(card);
         }
      }

      cards.sort(byOrderThenName);

      const categories = new Map<string, Category>();
      const uncategorized: Card[] = [];
      for (const card of cards) {
         const name = card.meta.category?.trim();
         if (!name) {
            uncategorized.push(card);
            continue;
         }
         let category = categories.get(name.toLowerCase());
         if (!category) {
            const known = categoryMeta.get(name.toLowerCase());
            category = { name, cards: [], meta: known?.meta ?? {}, jsonUri: known?.jsonUri ?? card.jsonUri };
            categories.set(name.toLowerCase(), category);
         }
         category.cards.push(card);
      }

      for (const [name, known] of categoryMeta) {
         if (!categories.has(name)) {
            categories.set(name, { name: known.written, cards: [], meta: known.meta, jsonUri: known.jsonUri });
         }
      }

      const days = new Map<string, Day>();
      for (const card of cards) {
         for (const lesson of card.lessons) {
            const day = days.get(lesson.day) ?? { key: lesson.day, lessons: [] };
            day.lessons.push(lesson);
            days.set(lesson.day, day);
         }
      }
      for (const day of days.values()) {
         day.lessons.sort((a, b) => byOrderThenName(a.card, b.card) || byOrderThenName(a, b));
      }

      this.cards = cards;
      this.categories = [...categories.values()].sort((a, b) => {
         const orderA = a.meta.order ?? Number.MAX_SAFE_INTEGER;
         const orderB = b.meta.order ?? Number.MAX_SAFE_INTEGER;
         return orderA - orderB || a.name.localeCompare(b.name);
      });
      this.uncategorized = uncategorized;
      this.days = [...days.values()].sort((a, b) => b.key.localeCompare(a.key));
      this.decorated.clear();
      this.changed.fire(undefined);
      this.decorationsChanged.fire(undefined);
   }

   getChildren(node?: Node): Node[] {
      return this.visible(this.children(node));
   }

   private children(node?: Node): Node[] {
      if (!node) {
         switch (this.mode) {
            case "category":
               return [
                  ...this.categories.map((category): Node => ({ kind: "category", category })),
                  ...this.uncategorized.map((card): Node => ({ kind: "card", card })),
               ];
            case "day":
               return this.days.map((day): Node => ({ kind: "day", day }));
            case "alphabetical":
               return [...this.cards]
                  .sort((a, b) => a.name.localeCompare(b.name, [], { numeric: true }))
                  .map((card): Node => ({ kind: "card", card }));
         }
      }
      switch (node.kind) {
         case "category":
            return node.category.cards.map((card) => ({ kind: "card", card }));
         case "day":
            return node.day.lessons.map((lesson) => ({ kind: "lesson", lesson }));
         case "card":
            return node.card.lessons.map((lesson) => ({ kind: "lesson", lesson }));
         case "lesson":
            return [];
      }
   }

   getTreeItem(node: Node): vscode.TreeItem {
      switch (node.kind) {
         case "category": {
            const { category } = node;
            const item = new vscode.TreeItem(category.name, vscode.TreeItemCollapsibleState.Expanded);
            item.id = nodeId(node);
            item.iconPath = vscode.ThemeIcon.Folder;
            item.contextValue = "category";
            item.description = category.meta.description ?? "";
            const icon = category.meta.color && !category.meta.icon ? "$(folder)" : category.meta.icon;
            this.applyIcon(item, icon, category.meta.color, `category/${item.id}`);
            return item;
         }
         case "day": {
            const { day } = node;
            const item = new vscode.TreeItem(dayLabel(day.key), vscode.TreeItemCollapsibleState.Expanded);
            item.id = nodeId(node);
            item.iconPath = new vscode.ThemeIcon("calendar");
            item.contextValue = "day";
            item.description = dayLabel(day.key) === longDate(day.key) ? "" : longDate(day.key);
            return item;
         }
         case "card": {
            const { card } = node;
            const resource = card.uri.with({ scheme: LIBRARY_SCHEME });
            const item = new vscode.TreeItem(resource, vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = vscode.ThemeIcon.File;
            const row = this.rowFor(node);
            item.label = titleLabel(row, card.meta) ?? card.name;
            item.id = nodeId(node);
            item.command = { command: "vscode.open", title: "Open", arguments: [card.uri] };
            item.contextValue = "card";
            item.description = card.exists ? this.rowDescription(node, row) : "missing";
            if (!card.exists) {
               item.tooltip = "library.json lists this card, but the file does not exist";
            }
            this.applyIcon(item, card.meta.icon, card.meta.color, `card/${this.cards.indexOf(card)}`);
            return item;
         }
         case "lesson": {
            const { lesson } = node;
            const resource = lesson.uri.with({ scheme: LIBRARY_SCHEME });
            const item = new vscode.TreeItem(resource, vscode.TreeItemCollapsibleState.None);
            item.id = nodeId(node);
            const row = this.rowFor(node);
            item.label = titleLabel(row, lesson.meta);
            item.command = { command: "vscode.open", title: "Open", arguments: [lesson.uri] };
            item.contextValue = "lesson";
            item.description = lesson.exists ? this.rowDescription(node, row) : "missing";
            if (!lesson.exists) {
               item.tooltip = "library.json lists this file, but it does not exist. Renamed outside VS Code?";
            }
            return item;
         }
      }
   }

   async resolveTreeItem(item: vscode.TreeItem, node: Node, token: vscode.CancellationToken): Promise<vscode.TreeItem> {
      if (item.tooltip !== undefined) {
         return item;
      }
      const config = this.previewFor(node);
      const hover = await this.hoverCards.build(node, config);
      if (!token.isCancellationRequested) {
         item.tooltip = hover ?? "";
      }
      return item;
   }

   previewFor(node: Node): PreviewConfig {
      return resolvePreview(this.previewLayers(node));
   }

   previewLayers(node: Node): (PreviewValue | undefined)[] {
      return this.layersOf(node, (meta) => meta.preview);
   }

   rowFor(node: Node): RowConfig {
      return resolveRow(this.rowLayers(node));
   }

   rowLayers(node: Node): (RowSetting | undefined)[] {
      return this.layersOf(node, (meta) => meta.row);
   }

   private layersOf<T>(node: Node, pick: (meta: LayerMeta) => T | undefined): (T | undefined)[] {
      return this.layerMetas(node).map((meta) => (meta === undefined ? undefined : pick(meta)));
   }

   private layerMetas(node: Node): (LayerMeta | undefined)[] {
      switch (node.kind) {
         case "lesson": {
            const { lesson } = node;
            const fileType = fileTypeMeta(this.fileTypesOf(lesson.card.jsonUri), lesson.uri.fsPath);
            return [fileType, this.categoryOfCard(lesson.card)?.meta, lesson.card.meta, lesson.meta];
         }
         case "card": {
            const { card } = node;
            const fileType = fileTypeMeta(this.fileTypesOf(card.jsonUri), card.uri.fsPath);
            return [fileType, this.categoryOfCard(card)?.meta, card.meta];
         }
         case "category":
            return [node.category.meta];
         case "day":
            return [];
      }
   }

   private fileTypesOf(jsonUri: vscode.Uri): Record<string, FileTypeMeta> {
      return this.fileTypes.get(jsonUri.fsPath) ?? {};
   }

   private rowDescription(node: RowNode, row: RowConfig): string {
      const meta = node.kind === "card" ? node.card.meta : node.lesson.meta;
      const labelled = labelPart(row, meta);
      const shown = row.parts.filter((part) => part !== labelled);
      const values = shown.map((part) => this.partValue(node, part, row));
      const cardName = node.kind === "lesson" && this.mode === "day" ? node.lesson.card.name : undefined;
      return joinParts([cardName, ...values]);
   }

   private partValue(node: RowNode, part: RowPart, row: RowConfig): string | undefined {
      if (node.kind === "card") {
         return cardPartValue(node.card, part);
      }
      const showDate = this.mode !== "day";
      return lessonPartValue(node.lesson, part, row, showDate);
   }

   resolveRef(ref: HoverRef): Node | undefined {
      switch (ref.kind) {
         case "card": {
            const card = this.findCard(ref.json, ref.key);
            return card ? { kind: "card", card } : undefined;
         }
         case "lesson": {
            const lesson = this.findLesson(ref);
            return lesson ? { kind: "lesson", lesson } : undefined;
         }
         case "category": {
            const wanted = ref.name.trim().toLowerCase();
            const category = this.categories.find((c) => c.name.toLowerCase() === wanted && c.jsonUri.fsPath === ref.json);
            return category ? { kind: "category", category } : undefined;
         }
      }
   }

   private applyIcon(item: vscode.TreeItem, rawIcon: string | undefined, color: string | undefined, slot: string): void {
      const spec = parsers.iconSpec.parse(rawIcon);
      if (!spec) {
         return;
      }
      if (spec.kind === "codicon") {
         item.iconPath = color ? new vscode.ThemeIcon(spec.name, parsers.color.toThemeColor(color)) : new vscode.ThemeIcon(spec.name);
         return;
      }
      const display = this.icons.display.get(spec.id);
      if (!display) {
         item.tooltip = `Icon "${spec.id}" is not in the active icon theme`;
         return;
      }
      const fake = vscode.Uri.from({ scheme: LIBRARY_SCHEME, path: `/icon/${slot}/${display.name}` });
      item.resourceUri = fake;
      item.iconPath = display.kind === "folder" ? vscode.ThemeIcon.Folder : vscode.ThemeIcon.File;
      this.decorated.set(fake.toString(), color);
   }

   provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
      if (uri.scheme !== LIBRARY_SCHEME) {
         return undefined;
      }
      if (this.decorated.has(uri.toString())) {
         const color = this.decorated.get(uri.toString());
         return color ? { color: parsers.color.toThemeColor(color), propagate: false } : undefined;
      }
      const target = uri.fsPath.toLowerCase();
      for (const card of this.cards) {
         if (card.uri.fsPath.toLowerCase() === target && card.meta.color) {
            return { color: parsers.color.toThemeColor(card.meta.color), propagate: false };
         }
         const lesson = card.lessons.find((l) => l.uri.fsPath.toLowerCase() === target);
         if (lesson?.meta.color) {
            return { color: parsers.color.toThemeColor(lesson.meta.color), propagate: false };
         }
      }
      return undefined;
   }

   handleDrag(source: readonly Node[], dataTransfer: vscode.DataTransfer): void {
      const refs: DragRef[] = [];
      const uris: string[] = [];
      for (const node of source) {
         if (node.kind === "category") {
            refs.push({ kind: "category", json: node.category.jsonUri.fsPath, name: node.category.name });
         } else if (node.kind === "card") {
            refs.push({ kind: "card", json: node.card.jsonUri.fsPath, key: node.card.key });
            uris.push(node.card.uri.toString());
         } else if (node.kind === "lesson") {
            const { lesson } = node;
            refs.push({ kind: "lesson", json: lesson.card.jsonUri.fsPath, cardKey: lesson.card.key, name: lesson.meta.name });
            uris.push(lesson.uri.toString());
         }
      }
      if (!refs.length) {
         return;
      }
      const treeItem = new vscode.DataTransferItem(refs);
      dataTransfer.set(TREE_MIME, treeItem);
      if (uris.length) {
         const uriListItem = new vscode.DataTransferItem(uris.join("\r\n"));
         dataTransfer.set(URI_LIST_MIME, uriListItem);
      }
   }

   async handleDrop(target: Node | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
      if (!target) {
         return;
      }
      const internalRefs = parsers.dragRef.fromTransfer(dataTransfer);
      const refs = internalRefs ?? [];
      const external = internalRefs ? [] : await externalFiles(dataTransfer);

      const categoryRefs = refs.filter((r): r is CategoryRef => r.kind === "category");
      if (categoryRefs.length) {
         await this.reorderCategories(target, categoryRefs);
         return;
      }
      if (target.kind === "category") {
         await this.dropOnCategory(target.category, refs, external);
         return;
      }
      if (target.kind === "day") {
         for (const ref of refs) {
            const lesson = ref.kind === "lesson" ? this.findLesson(ref) : undefined;
            if (lesson) {
               await writeLessonDate(lesson, target.day.key);
            }
         }
         return;
      }
      const card = target.kind === "card" ? target.card : target.lesson.card;
      const cardRefs = refs.filter((r): r is CardRef => r.kind === "card");
      if (cardRefs.length) {
         await this.reorderCards(card, cardRefs);
         return;
      }
      await this.dropLessons(target, card, refs, external);
   }

   private async reorderCategories(target: Node, refs: CategoryRef[]): Promise<void> {
      const targetCategory = this.categoryAt(target);
      if (!targetCategory) {
         return;
      }
      const moving = refs
         .map((r) => this.findCategory(r.json, r.name))
         .filter((c): c is Category => !!c && c.jsonUri.fsPath === targetCategory.jsonUri.fsPath);
      if (!moving.length) {
         return;
      }
      const siblings = this.categories.filter((c) => c.jsonUri.fsPath === targetCategory.jsonUri.fsPath);
      const ordered = insertAround(siblings, moving, targetCategory, (c) => c.name.toLowerCase());
      await writeCategoryOrder(targetCategory.jsonUri, ordered.map((c) => c.name));
   }

   private categoryAt(node: Node): Category | undefined {
      switch (node.kind) {
         case "category":
            return node.category;
         case "card":
            return this.categoryOfCard(node.card);
         case "lesson":
            return this.categoryOfCard(node.lesson.card);
         case "day":
            return undefined;
      }
   }

   private categoryOfCard(card: Card): Category | undefined {
      const name = card.meta.category?.trim().toLowerCase();
      return name ? this.categories.find((c) => c.name.toLowerCase() === name) : undefined;
   }

   private findCategory(json: string, name: string): Category | undefined {
      const wanted = name.trim().toLowerCase();
      return this.categories.find((c) => c.jsonUri.fsPath === json && c.name.toLowerCase() === wanted);
   }

   private async dropOnCategory(category: Category, refs: DragRef[], external: vscode.Uri[]): Promise<void> {
      const moving: Card[] = [];
      for (const ref of refs) {
         if (ref.kind === "card") {
            const card = this.findCard(ref.json, ref.key);
            if (card) {
               moving.push(card);
            }
         }
      }

      const jsonUri = moving[0]?.jsonUri ?? category.jsonUri;
      const folder = path.dirname(jsonUri.fsPath);
      const newKeys = external
         .filter((uri) => path.basename(uri.fsPath).toLowerCase() !== LIBRARY_FILE)
         .map((uri) => this.findCardByUri(uri)?.key ?? toRelative(folder, uri.fsPath));
      const movingKeys = new Set([...moving.map((c) => c.key), ...newKeys]);
      const staying = category.cards.filter((c) => c.jsonUri.fsPath === jsonUri.fsPath && !movingKeys.has(c.key));
      const ordered = [...staying.map((c) => c.key), ...moving.map((c) => c.key), ...newKeys];
      await writeCardOrder(jsonUri, category.name, ordered);
   }

   private async reorderCards(target: Card, refs: CardRef[]): Promise<void> {
      const moving = refs
         .map((r) => this.findCard(r.json, r.key))
         .filter((c): c is Card => !!c && c.jsonUri.fsPath === target.jsonUri.fsPath);
      if (!moving.length) {
         return;
      }
      const categoryName = target.meta.category?.trim();
      const siblings = (categoryName
         ? this.categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase())?.cards ?? []
         : this.uncategorized
      ).filter((c) => c.jsonUri.fsPath === target.jsonUri.fsPath);
      const ordered = insertAround(siblings, moving, target, (c) => c.key);
      await writeCardOrder(target.jsonUri, categoryName, ordered.map((c) => c.key));
   }

   private async dropLessons(target: Node, card: Card, refs: DragRef[], external: vscode.Uri[]): Promise<void> {
      const folder = path.dirname(card.jsonUri.fsPath);
      const moving: { name: string; uri: vscode.Uri }[] = [];

      for (const ref of refs) {
         if (ref.kind !== "lesson") {
            continue;
         }
         const lesson = this.findLesson(ref);
         if (!lesson) {
            continue;
         }
         if (lesson.card.jsonUri.fsPath !== card.jsonUri.fsPath) {
            vscode.window.showWarningMessage(`${ref.name} lives in a different ${LIBRARY_FILE}. Move it by hand.`);
            continue;
         }
         moving.push({ name: lesson.meta.name, uri: lesson.uri });
      }
      for (const uri of external) {
         const base = path.basename(uri.fsPath).toLowerCase();
         if (base === LIBRARY_FILE || uri.fsPath.toLowerCase() === card.uri.fsPath.toLowerCase()) {
            continue;
         }
         const known = this.findLessonByUri(uri);
         moving.push({ name: known?.meta.name ?? toRelative(folder, uri.fsPath), uri });
      }
      if (!moving.length) {
         return;
      }

      const movingPaths = new Set(moving.map((m) => m.uri.fsPath.toLowerCase()));
      const remaining = card.lessons.filter((l) => !movingPaths.has(l.uri.fsPath.toLowerCase()));
      let index = remaining.length;
      if (target.kind === "lesson" && !movingPaths.has(target.lesson.uri.fsPath.toLowerCase())) {
         index = remaining.indexOf(target.lesson);
         const targetIndex = card.lessons.indexOf(target.lesson);
         const fromAbove = card.lessons.some((l, i) => movingPaths.has(l.uri.fsPath.toLowerCase()) && i < targetIndex);
         if (fromAbove) {
            index += 1;
         }
      }
      const ordered = [
         ...remaining.slice(0, index).map((l) => l.meta.name),
         ...moving.map((m) => m.name),
         ...remaining.slice(index).map((l) => l.meta.name),
      ];
      await writeLessonOrder(card.jsonUri, card.key, ordered);
   }

   private findCard(json: string, key: string): Card | undefined {
      return this.cards.find((c) => c.jsonUri.fsPath === json && c.key === key);
   }

   private findCardByUri(uri: vscode.Uri): Card | undefined {
      const target = uri.fsPath.toLowerCase();
      return this.cards.find((c) => c.uri.fsPath.toLowerCase() === target);
   }

   private findLesson(ref: LessonRef): Lesson | undefined {
      return this.findCard(ref.json, ref.cardKey)?.lessons.find((l) => l.meta.name === ref.name);
   }

   private findLessonByUri(uri: vscode.Uri): Lesson | undefined {
      const target = uri.fsPath.toLowerCase();
      for (const card of this.cards) {
         const hit = card.lessons.find((l) => l.uri.fsPath.toLowerCase() === target);
         if (hit) {
            return hit;
         }
      }
      return undefined;
   }
}

function insertAround<T>(siblings: T[], moving: T[], target: T, idOf: (item: T) => string): T[] {
   const movingIds = new Set(moving.map(idOf));
   const remaining = siblings.filter((s) => !movingIds.has(idOf(s)));
   let index = remaining.length;
   if (!movingIds.has(idOf(target))) {
      index = remaining.indexOf(target);
      const targetIndex = siblings.indexOf(target);
      const fromAbove = siblings.some((s, i) => movingIds.has(idOf(s)) && i < targetIndex);
      if (fromAbove) {
         index += 1;
      }
   }
   return [...remaining.slice(0, index), ...moving, ...remaining.slice(index)];
}

async function externalFiles(dataTransfer: vscode.DataTransfer): Promise<vscode.Uri[]> {
   const dropped = await parsers.uriList.fromTransfer(dataTransfer);
   const files: vscode.Uri[] = [];
   for (const uri of dropped) {
      const directory = await isDirectory(uri);
      if (!directory) {
         files.push(uri);
      }
   }
   return files;
}

function byOrderThenName(a: Ordered, b: Ordered): number {
   const orderA = a.meta.order ?? Number.MAX_SAFE_INTEGER;
   const orderB = b.meta.order ?? Number.MAX_SAFE_INTEGER;
   if (orderA !== orderB) {
      return orderA - orderB;
   }
   return path.basename(a.uri.fsPath).localeCompare(path.basename(b.uri.fsPath), [], { numeric: true });
}

function titleLabel(row: RowConfig, meta: RowMeta): string | undefined {
   return row.label === "title" && meta.title ? meta.title : undefined;
}

function labelPart(row: RowConfig, meta: RowMeta): RowPart {
   return titleLabel(row, meta) === undefined ? "fileName" : "title";
}

function cardPartValue(card: Card, part: RowPart): string | undefined {
   switch (part) {
      case "fileName":
         return card.name;
      case "title":
         return card.meta.title;
      case "description":
         return card.meta.description;
      case "date":
      case "tags":
         return undefined;
   }
}

function lessonPartValue(lesson: Lesson, part: RowPart, row: RowConfig, showDate: boolean): string | undefined {
   switch (part) {
      case "fileName":
         return path.basename(lesson.uri.fsPath);
      case "title":
         return lesson.meta.title;
      case "description":
         return lesson.meta.description;
      case "date":
         return showDate ? formatDay(lesson.day, row.date) : undefined;
      case "tags":
         return lesson.meta.tags?.join(", ");
   }
}

function joinParts(parts: (string | undefined)[]): string {
   return parts.filter((s): s is string => !!s).join(" · ");
}
