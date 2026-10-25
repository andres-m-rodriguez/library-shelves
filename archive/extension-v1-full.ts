import * as path from "path";
import * as vscode from "vscode";

// ---------------------------------------------------------------------------
// Filing scheme
//   Card:    30.while.md                 -> shelf 30, key "while"
//   Lesson:  30.while.02-retry.cs        -> shelf 30, key "while", item 02, title "retry"
//            30.while.03.cs              -> same, title taken from the "// Lesson:" line
//            anything.cs with @shelf     -> filed on the tagged shelf, no call number
//   Tags:    // @shelf while if          -> shelves (space separated)
//            // @level beginner
//            // @date 2026-10-23         -> overrides the file's creation day
//            // Lesson: what it teaches
// ---------------------------------------------------------------------------

const CARD_RE = /^(\d+)\.([^.]+)\.md$/i;
const LESSON_RE = /^(\d+)\.([^.]+)\.(\d+)(?:-(.+))?\.cs$/i;
const TAG_LINES_TO_SCAN = 30;
const DAY_MS = 86_400_000;

interface Lesson {
   uri: vscode.Uri;
   fileName: string;
   shelfNumber: string;
   shelfKey: string;
   item: string;
   title: string;
   level: string;
   extraShelves: string[];
   created: number;
   modified: number;
}

interface Shelf {
   key: string;
   number: string;
   name: string;
   cardUri?: vscode.Uri;
   lessons: Lesson[];
}

// Theme colors that exist in every theme and read well as decorations.
const PALETTE = [
   "charts.blue",
   "charts.green",
   "charts.orange",
   "charts.purple",
   "charts.red",
   "charts.yellow",
];

const LEVEL_RANK: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };

// ---------------------------------------------------------------------------
// View options: how the tree is grouped and sorted. Persisted per workspace.
// ---------------------------------------------------------------------------

type GroupMode = "shelf" | "level" | "dayCreated" | "dayModified" | "none";
type SortMode = "callNumber" | "name" | "level" | "modified" | "created";

interface ViewOptions {
   group: GroupMode;
   sort: SortMode;
   reverse: boolean;
}

const DEFAULT_OPTIONS: ViewOptions = { group: "shelf", sort: "callNumber", reverse: false };

const GROUP_CHOICES: { mode: GroupMode; label: string; detail: string; icon: string }[] = [
   { mode: "shelf", label: "Shelf", detail: "One group per shelf, the way the folder is filed", icon: "library" },
   { mode: "level", label: "Level", detail: "Beginner, intermediate, advanced", icon: "mortar-board" },
   { mode: "dayCreated", label: "Day created", detail: "The day each lesson was written. @date overrides it", icon: "calendar" },
   { mode: "dayModified", label: "Day modified", detail: "The day each lesson was last saved", icon: "history" },
   { mode: "none", label: "No grouping", detail: "One flat list", icon: "list-flat" },
];

const SORT_CHOICES: { mode: SortMode; label: string; detail: string }[] = [
   { mode: "callNumber", label: "Call number", detail: "Shelf, then item number" },
   { mode: "name", label: "Name", detail: "Lesson title, A to Z" },
   { mode: "level", label: "Level", detail: "Beginner first" },
   { mode: "modified", label: "Last modified", detail: "Most recently saved first" },
   { mode: "created", label: "Date created", detail: "Newest first" },
];

function groupLabel(mode: GroupMode): string {
   return GROUP_CHOICES.find((c) => c.mode === mode)?.label ?? mode;
}

function sortLabel(mode: SortMode): string {
   return SORT_CHOICES.find((c) => c.mode === mode)?.label ?? mode;
}

// ---------------------------------------------------------------------------
// Catalog: scans the workspace and holds the parsed shelves and lessons.
// ---------------------------------------------------------------------------

class Catalog {
   shelves = new Map<string, Shelf>();
   lessons: Lesson[] = [];
   folder: vscode.Uri | undefined;

   private readonly changed = new vscode.EventEmitter<void>();
   readonly onDidChange = this.changed.event;

   async scan(): Promise<void> {
      const shelves = new Map<string, Shelf>();
      const lessons: Lesson[] = [];

      const cards = await vscode.workspace.findFiles("**/*.md", "**/node_modules/**");
      for (const uri of cards) {
         const fileName = path.basename(uri.fsPath);
         const match = CARD_RE.exec(fileName);
         if (!match) {
            continue;
         }
         const number = match[1];
         const key = match[2].toLowerCase();
         const name = await readCardTitle(uri, key);
         shelves.set(key, { key, number, name, cardUri: uri, lessons: [] });
         this.folder ??= vscode.Uri.file(path.dirname(uri.fsPath));
      }

      const sources = await vscode.workspace.findFiles("**/*.cs", "**/{node_modules,bin,obj}/**");
      for (const uri of sources) {
         const fileName = path.basename(uri.fsPath);
         const match = LESSON_RE.exec(fileName);
         const tags = await readTags(uri);
         if (!match && !tags.shelves.length) {
            continue;
         }
         // Filename wins for shelf and item. Tags fill in whatever the name lacks.
         const shelfKey = match ? match[2].toLowerCase() : tags.shelves[0];
         const shelfNumber = match ? match[1] : shelves.get(shelfKey)?.number ?? "--";
         const item = match ? match[3] : "";
         const nameTitle = match?.[4]?.replace(/-/g, " ");
         const title = nameTitle ?? tags.title ?? fileName.replace(/\.cs$/i, "");
         const extraShelves = tags.shelves.filter((s) => s !== shelfKey);
         const stat = await vscode.workspace.fs.stat(uri);
         const created = tags.date ?? stat.ctime;
         const lesson: Lesson = {
            uri, fileName, shelfNumber, shelfKey, item, title,
            level: tags.level, extraShelves, created, modified: stat.mtime,
         };
         lessons.push(lesson);
         this.folder ??= vscode.Uri.file(path.dirname(uri.fsPath));

         for (const key of [shelfKey, ...extraShelves]) {
            let shelf = shelves.get(key);
            if (!shelf) {
               const number = key === shelfKey ? shelfNumber : "--";
               shelf = { key, number, name: capitalize(key), lessons: [] };
               shelves.set(key, shelf);
            }
            shelf.lessons.push(lesson);
         }
      }

      this.shelves = shelves;
      this.lessons = lessons;
      this.changed.fire();
   }

   sortedShelves(): Shelf[] {
      return [...this.shelves.values()].sort((a, b) => shelfOrder(a) - shelfOrder(b) || a.name.localeCompare(b.name));
   }

   shelfName(key: string): string {
      return this.shelves.get(key)?.name ?? capitalize(key);
   }

   lessonFor(uri: vscode.Uri): Lesson | undefined {
      return this.lessons.find((l) => l.uri.fsPath === uri.fsPath);
   }

   colorFor(shelfKey: string): vscode.ThemeColor {
      const index = this.sortedShelves().findIndex((s) => s.key === shelfKey);
      const id = PALETTE[Math.max(index, 0) % PALETTE.length];
      return new vscode.ThemeColor(id);
   }

   nextItem(shelf: Shelf): string {
      const numbers = shelf.lessons
         .filter((l) => l.shelfKey === shelf.key && l.item !== "")
         .map((l) => parseInt(l.item, 10));
      const next = numbers.length ? Math.max(...numbers) + 1 : 1;
      return String(next).padStart(2, "0");
   }
}

function shelfOrder(shelf: Shelf): number {
   const n = parseInt(shelf.number, 10);
   return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

function levelRank(level: string): number {
   return LEVEL_RANK[level] ?? 99;
}

function capitalize(text: string): string {
   return text.charAt(0).toUpperCase() + text.slice(1);
}

async function readHead(uri: vscode.Uri): Promise<string[]> {
   const bytes = await vscode.workspace.fs.readFile(uri);
   const text = Buffer.from(bytes).toString("utf8");
   return text.split(/\r?\n/).slice(0, TAG_LINES_TO_SCAN);
}

async function readCardTitle(uri: vscode.Uri, fallback: string): Promise<string> {
   const lines = await readHead(uri);
   const heading = lines.find((l) => l.startsWith("# "));
   if (!heading) {
      return capitalize(fallback);
   }
   // "# 30 While" -> "While"
   const title = heading.replace(/^#\s*/, "").replace(/^\d+\s+/, "").trim();
   return title || capitalize(fallback);
}

interface Tags {
   shelves: string[];
   level: string;
   title?: string;
   date?: number;
}

async function readTags(uri: vscode.Uri): Promise<Tags> {
   const lines = await readHead(uri);
   const shelves: string[] = [];
   let level = "unrated";
   let title: string | undefined;
   let date: number | undefined;
   for (const line of lines) {
      const shelfMatch = /@shelf\s+(.+)$/i.exec(line);
      if (shelfMatch) {
         shelves.push(...shelfMatch[1].trim().toLowerCase().split(/\s+/));
      }
      const levelMatch = /@level\s+(\S+)/i.exec(line);
      if (levelMatch) {
         level = levelMatch[1].toLowerCase();
      }
      const dateMatch = /@date\s+(\d{4}-\d{2}-\d{2})/i.exec(line);
      if (dateMatch) {
         const parsed = new Date(`${dateMatch[1]}T12:00:00`).getTime();
         if (!Number.isNaN(parsed)) {
            date = parsed;
         }
      }
      const titleMatch = /\/\/\s*Lesson:\s*(.+)$/i.exec(line);
      if (titleMatch && !title) {
         title = titleMatch[1].trim().replace(/\.$/, "");
      }
   }
   return { shelves, level, title, date };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function startOfDay(ts: number): number {
   const d = new Date(ts);
   d.setHours(0, 0, 0, 0);
   return d.getTime();
}

function longDate(ts: number): string {
   return new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function shortTime(ts: number): string {
   return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(ts: number): string {
   const daysAgo = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY_MS);
   if (daysAgo === 0) {
      return "Today";
   }
   if (daysAgo === 1) {
      return "Yesterday";
   }
   if (daysAgo > 1 && daysAgo < 7) {
      return new Date(ts).toLocaleDateString(undefined, { weekday: "long" });
   }
   return longDate(ts);
}

// ---------------------------------------------------------------------------
// Explorer decorations: call-number badge and shelf color on every file.
// ---------------------------------------------------------------------------

class ShelfDecorations implements vscode.FileDecorationProvider {
   private readonly changed = new vscode.EventEmitter<undefined>();
   readonly onDidChangeFileDecorations = this.changed.event;

   constructor(private readonly catalog: Catalog) {
      catalog.onDidChange(() => this.changed.fire(undefined));
   }

   provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
      const fileName = path.basename(uri.fsPath);

      const card = CARD_RE.exec(fileName);
      if (card) {
         const key = card[2].toLowerCase();
         const count = this.catalog.shelves.get(key)?.lessons.length ?? 0;
         const plural = count === 1 ? "" : "s";
         return {
            badge: card[1].slice(0, 2),
            color: this.catalog.colorFor(key),
            tooltip: `Shelf ${card[1]} ${this.catalog.shelfName(key)} with ${count} lesson${plural}`,
            propagate: false,
         };
      }

      const lesson = this.catalog.lessonFor(uri);
      if (lesson) {
         const extra = lesson.extraShelves.length ? `, also on ${lesson.extraShelves.join(", ")}` : "";
         const itemLabel = lesson.item ? ` ${lesson.item}` : "";
         return {
            badge: lesson.shelfNumber === "--" ? "@" : lesson.shelfNumber.slice(0, 2),
            color: this.catalog.colorFor(lesson.shelfKey),
            tooltip: `${this.catalog.shelfName(lesson.shelfKey)}${itemLabel}: ${lesson.title} (${lesson.level}${extra})`,
            propagate: false,
         };
      }
      return undefined;
   }
}

// ---------------------------------------------------------------------------
// Library tree: groups of lessons, grouped and sorted by the view options.
// ---------------------------------------------------------------------------

interface Group {
   id: string;
   label: string;
   description: string;
   icon: vscode.ThemeIcon;
   lessons: Lesson[];
   shelf?: Shelf;
}

type Node =
   | { kind: "group"; group: Group }
   | { kind: "lesson"; lesson: Lesson; groupId: string; viaShelf?: string };

class LibraryTree implements vscode.TreeDataProvider<Node> {
   private readonly changed = new vscode.EventEmitter<Node | undefined>();
   readonly onDidChangeTreeData = this.changed.event;

   options: ViewOptions = { ...DEFAULT_OPTIONS };

   constructor(private readonly catalog: Catalog) {
      catalog.onDidChange(() => this.refresh());
   }

   refresh(): void {
      this.changed.fire(undefined);
   }

   getChildren(node?: Node): Node[] {
      if (!node) {
         if (this.options.group === "none") {
            return this.sorted(this.catalog.lessons).map((lesson) => ({ kind: "lesson", lesson, groupId: "flat" }));
         }
         return this.buildGroups().map((group) => ({ kind: "group", group }));
      }
      if (node.kind === "group") {
         const viaShelf = node.group.shelf?.key;
         return this.sorted(node.group.lessons).map((lesson) => ({ kind: "lesson", lesson, groupId: node.group.id, viaShelf }));
      }
      return [];
   }

   getTreeItem(node: Node): vscode.TreeItem {
      return node.kind === "group" ? this.groupItem(node.group) : this.lessonItem(node);
   }

   // ----- grouping -----

   private buildGroups(): Group[] {
      switch (this.options.group) {
         case "shelf":
            return this.catalog.sortedShelves().map((shelf) => ({
               id: `shelf:${shelf.key}`,
               label: `${shelf.number} ${shelf.name}`,
               description: countLabel(shelf.lessons.length),
               icon: new vscode.ThemeIcon("library", this.catalog.colorFor(shelf.key)),
               lessons: shelf.lessons,
               shelf,
            }));
         case "level":
            return this.bucket(
               (l) => l.level,
               (level, lessons) => ({
                  id: `level:${level}`,
                  label: capitalize(level),
                  description: countLabel(lessons.length),
                  icon: new vscode.ThemeIcon("mortar-board"),
                  lessons,
               }),
               (a, b) => levelRank(a) - levelRank(b) || a.localeCompare(b),
            );
         case "dayCreated":
         case "dayModified": {
            const pick = this.options.group === "dayCreated" ? (l: Lesson) => l.created : (l: Lesson) => l.modified;
            return this.bucket(
               (l) => String(startOfDay(pick(l))),
               (dayKey, lessons) => {
                  const day = Number(dayKey);
                  const label = dayLabel(day);
                  const dateText = label === longDate(day) ? "" : ` ${longDate(day)}`;
                  return {
                     id: `day:${dayKey}`,
                     label,
                     description: `${countLabel(lessons.length)}${dateText ? " ·" + dateText : ""}`,
                     icon: new vscode.ThemeIcon("calendar"),
                     lessons,
                  };
               },
               (a, b) => Number(b) - Number(a),
            );
         }
         case "none":
            return [];
      }
   }

   private bucket(
      keyOf: (lesson: Lesson) => string,
      make: (key: string, lessons: Lesson[]) => Group,
      order: (a: string, b: string) => number,
   ): Group[] {
      const buckets = new Map<string, Lesson[]>();
      for (const lesson of this.catalog.lessons) {
         const key = keyOf(lesson);
         const list = buckets.get(key) ?? [];
         list.push(lesson);
         buckets.set(key, list);
      }
      const keys = [...buckets.keys()].sort(order);
      if (this.options.reverse) {
         keys.reverse();
      }
      return keys.map((key) => make(key, buckets.get(key) ?? []));
   }

   // ----- sorting -----

   private sorted(lessons: Lesson[]): Lesson[] {
      const compare = this.comparator();
      const result = [...lessons].sort(compare);
      return this.options.reverse ? result.reverse() : result;
   }

   private comparator(): (a: Lesson, b: Lesson) => number {
      const byCallNumber = (a: Lesson, b: Lesson) =>
         shelfOrderOf(a) - shelfOrderOf(b) ||
         a.shelfKey.localeCompare(b.shelfKey) ||
         itemOrder(a) - itemOrder(b) ||
         a.fileName.localeCompare(b.fileName, undefined, { numeric: true });
      switch (this.options.sort) {
         case "callNumber":
            return byCallNumber;
         case "name":
            return (a, b) => a.title.localeCompare(b.title) || byCallNumber(a, b);
         case "level":
            return (a, b) => levelRank(a.level) - levelRank(b.level) || a.level.localeCompare(b.level) || byCallNumber(a, b);
         case "modified":
            return (a, b) => b.modified - a.modified || byCallNumber(a, b);
         case "created":
            return (a, b) => b.created - a.created || byCallNumber(a, b);
      }
   }

   // ----- items -----

   private groupItem(group: Group): vscode.TreeItem {
      const item = new vscode.TreeItem(group.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = group.description;
      item.iconPath = group.icon;
      item.id = group.id;
      if (group.shelf) {
         item.contextValue = group.shelf.cardUri ? "shelfWithCard" : "shelf";
         item.tooltip = group.shelf.cardUri
            ? `Card: ${path.basename(group.shelf.cardUri.fsPath)}`
            : "No card yet. Create one named like 30.while.md";
      } else {
         item.contextValue = "group";
      }
      return item;
   }

   private lessonItem(node: Extract<Node, { kind: "lesson" }>): vscode.TreeItem {
      const { lesson } = node;
      const label = lesson.item ? `${lesson.item} ${lesson.title}` : lesson.title;
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      item.resourceUri = lesson.uri;
      item.description = this.lessonDescription(node);
      item.tooltip = new vscode.MarkdownString(
         [
            `**${lesson.fileName}**`,
            `Shelf ${lesson.shelfNumber} ${this.catalog.shelfName(lesson.shelfKey)}`,
            `Level ${lesson.level}`,
            `Created ${longDate(lesson.created)}`,
            `Modified ${longDate(lesson.modified)} ${shortTime(lesson.modified)}`,
         ].join("  \n"),
      );
      item.contextValue = "lesson";
      item.command = { command: "vscode.open", title: "Open", arguments: [lesson.uri] };
      item.id = `${node.groupId}:${lesson.fileName}`;
      return item;
   }

   // What the grey text after a lesson says depends on what the grouping already tells you.
   private lessonDescription(node: Extract<Node, { kind: "lesson" }>): string {
      const { lesson } = node;
      const shelf = `${lesson.shelfNumber} ${this.catalog.shelfName(lesson.shelfKey)}`;
      const borrowed = node.viaShelf !== undefined && node.viaShelf !== lesson.shelfKey;
      switch (this.options.group) {
         case "shelf":
            return borrowed ? `from ${shelf}` : this.sortHint(lesson) ?? lesson.level;
         case "level":
            return `${shelf}${this.sortHint(lesson, " · ") ?? ""}`;
         case "dayCreated":
            return `${shelf} · ${shortTime(lesson.created)}`;
         case "dayModified":
            return `${shelf} · ${shortTime(lesson.modified)}`;
         case "none":
            return `${shelf} · ${this.sortHint(lesson) ?? lesson.level}`;
      }
   }

   // When sorting by a date, show that date so the order is visible.
   private sortHint(lesson: Lesson, prefix = ""): string | undefined {
      if (this.options.sort === "modified") {
         return `${prefix}${dayLabel(lesson.modified)} ${shortTime(lesson.modified)}`;
      }
      if (this.options.sort === "created") {
         return `${prefix}${dayLabel(lesson.created)}`;
      }
      return undefined;
   }
}

function countLabel(count: number): string {
   return `${count} lesson${count === 1 ? "" : "s"}`;
}

function shelfOrderOf(lesson: Lesson): number {
   const n = parseInt(lesson.shelfNumber, 10);
   return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

function itemOrder(lesson: Lesson): number {
   const n = parseInt(lesson.item, 10);
   return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

// ---------------------------------------------------------------------------
// View option commands
// ---------------------------------------------------------------------------

const OPTIONS_KEY = "library.viewOptions";

function describeOptions(options: ViewOptions): string {
   const parts = [groupLabel(options.group), sortLabel(options.sort)];
   if (options.reverse) {
      parts.push("reversed");
   }
   return parts.join(" · ");
}

async function chooseGroup(tree: LibraryTree, apply: () => void): Promise<void> {
   const items = GROUP_CHOICES.map((c) => ({
      label: `$(${c.icon}) ${c.label}`,
      detail: c.detail,
      description: c.mode === tree.options.group ? "current" : "",
      mode: c.mode,
   }));
   const pick = await vscode.window.showQuickPick(items, { placeHolder: "Group lessons by", matchOnDetail: true });
   if (pick) {
      tree.options.group = pick.mode;
      apply();
   }
}

async function chooseSort(tree: LibraryTree, apply: () => void): Promise<void> {
   const items: (vscode.QuickPickItem & { mode?: SortMode; toggle?: boolean })[] = SORT_CHOICES.map((c) => ({
      label: c.label,
      detail: c.detail,
      description: c.mode === tree.options.sort ? "current" : "",
      mode: c.mode,
   }));
   items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
   items.push({
      label: `$(arrow-swap) Reverse order`,
      description: tree.options.reverse ? "on" : "off",
      toggle: true,
   });
   const pick = await vscode.window.showQuickPick(items, { placeHolder: "Sort lessons by", matchOnDetail: true });
   if (!pick) {
      return;
   }
   if (pick.toggle) {
      tree.options.reverse = !tree.options.reverse;
   } else if (pick.mode) {
      tree.options.sort = pick.mode;
   }
   apply();
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function browse(catalog: Catalog): Promise<void> {
   const shelves = catalog.sortedShelves();
   if (!shelves.length) {
      vscode.window.showInformationMessage("No shelves found. Create a card like 30.while.md first.");
      return;
   }
   const shelfItems = shelves.map((shelf) => ({
      label: `$(library) ${shelf.number} ${shelf.name}`,
      description: countLabel(shelf.lessons.length),
      shelf,
   }));
   const shelfPick = await vscode.window.showQuickPick(shelfItems, { placeHolder: "Pick a shelf", matchOnDescription: true });
   if (!shelfPick) {
      return;
   }
   const lessonItems = shelfPick.shelf.lessons.map((lesson) => ({
      label: lesson.item ? `${lesson.item} ${lesson.title}` : lesson.title,
      description: lesson.level,
      detail: lesson.fileName,
      lesson,
   }));
   const placeHolder = `Lessons on ${shelfPick.shelf.name}`;
   const lessonPick = await vscode.window.showQuickPick(lessonItems, { placeHolder, matchOnDetail: true });
   if (lessonPick) {
      await vscode.window.showTextDocument(lessonPick.lesson.uri);
   }
}

async function newShelf(catalog: Catalog): Promise<void> {
   const folder = targetFolder(catalog);
   if (!folder) {
      return;
   }
   const input = await vscode.window.showInputBox({
      prompt: "Shelf number and name, for example: 50 strings",
      validateInput: (v) => (/^\d+\s+[a-z][a-z0-9-]*$/i.test(v.trim()) ? undefined : "Use: <number> <one-word-name>"),
   });
   if (!input) {
      return;
   }
   const parts = input.trim().split(/\s+/);
   const number = parts[0];
   const key = parts[1].toLowerCase();
   const uri = vscode.Uri.joinPath(folder, `${number}.${key}.md`);
   const body = [
      `# ${number} ${capitalize(key)}`,
      "",
      "What this shelf teaches, in one or two sentences.",
      "",
      "| Item | File | Covers |",
      "|---|---|---|",
      "",
   ].join("\n");
   await vscode.workspace.fs.writeFile(uri, Buffer.from(body, "utf8"));
   await vscode.window.showTextDocument(uri);
}

async function newLesson(catalog: Catalog, preselected?: Shelf): Promise<void> {
   const folder = targetFolder(catalog);
   if (!folder) {
      return;
   }
   let shelf = preselected;
   if (!shelf) {
      const shelves = catalog.sortedShelves().filter((s) => s.number !== "--");
      if (!shelves.length) {
         vscode.window.showInformationMessage("Create a shelf first (Library: New Shelf).");
         return;
      }
      const shelfItems = shelves.map((s) => ({
         label: `${s.number} ${s.name}`,
         description: `next item ${catalog.nextItem(s)}`,
         shelf: s,
      }));
      const pick = await vscode.window.showQuickPick(shelfItems, { placeHolder: "Which shelf does the lesson go on?" });
      if (!pick) {
         return;
      }
      shelf = pick.shelf;
   }

   const title = await vscode.window.showInputBox({
      prompt: `Lesson title for shelf ${shelf.number} ${shelf.name}`,
      placeHolder: "retry until valid",
      validateInput: (v) => (v.trim() ? undefined : "Title cannot be empty"),
   });
   if (!title) {
      return;
   }
   const level = await vscode.window.showQuickPick(["beginner", "intermediate", "advanced"], { placeHolder: "Level" });
   if (!level) {
      return;
   }

   const cleanTitle = title.trim();
   const item = catalog.nextItem(shelf);
   const slug = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
   const uri = vscode.Uri.joinPath(folder, `${shelf.number}.${shelf.key}.${item}-${slug}.cs`);
   const printable = cleanTitle.replace(/"/g, "'");
   const today = new Date().toISOString().slice(0, 10);
   const body = [
      `// @shelf ${shelf.key}`,
      `// @level ${level}`,
      `// @date ${today}`,
      `// Lesson: ${cleanTitle}`,
      "",
      `Console.WriteLine("${printable}");`,
      "",
   ].join("\n");
   await vscode.workspace.fs.writeFile(uri, Buffer.from(body, "utf8"));
   const editor = await vscode.window.showTextDocument(uri);
   const lastLine = editor.document.lineCount - 1;
   editor.selection = new vscode.Selection(lastLine, 0, lastLine, 0);
}

function targetFolder(catalog: Catalog): vscode.Uri | undefined {
   const folder = catalog.folder ?? vscode.workspace.workspaceFolders?.[0]?.uri;
   if (!folder) {
      vscode.window.showErrorMessage("Open the library folder first.");
   }
   return folder;
}

let runTerminal: vscode.Terminal | undefined;

function runLesson(target?: Node | vscode.Uri): void {
   let uri: vscode.Uri | undefined;
   if (target instanceof vscode.Uri) {
      uri = target;
   } else if (target && target.kind === "lesson") {
      uri = target.lesson.uri;
   } else {
      uri = vscode.window.activeTextEditor?.document.uri;
   }
   if (!uri || !uri.fsPath.toLowerCase().endsWith(".cs")) {
      vscode.window.showInformationMessage("Open or select a .cs lesson to run.");
      return;
   }
   const fallback = 'dotnet run "${file}"';
   const template = vscode.workspace.getConfiguration("library").get<string>("runCommand") ?? fallback;
   const command = template.replace("${file}", uri.fsPath);

   if (!runTerminal || runTerminal.exitStatus) {
      runTerminal = vscode.window.createTerminal({ name: "Library", cwd: path.dirname(uri.fsPath) });
   }
   runTerminal.show(true);
   runTerminal.sendText(command, true);
}

async function rebuildIndex(catalog: Catalog): Promise<void> {
   const folder = targetFolder(catalog);
   if (!folder) {
      return;
   }
   const readme = vscode.Uri.joinPath(folder, "README.md");
   let text = "";
   try {
      text = Buffer.from(await vscode.workspace.fs.readFile(readme)).toString("utf8");
   } catch {
      text = "# Library\n\n## Shelves\n";
   }

   const rows = catalog
      .sortedShelves()
      .filter((s) => s.number !== "--")
      .map((s) => {
         const card = s.cardUri ? path.basename(s.cardUri.fsPath) : "";
         const link = card ? `[${card}](${card})` : "no card";
         return `| ${s.number} | ${s.name} | ${s.lessons.length} | ${link} |`;
      });
   const table = ["| Call number | Shelf | Lessons | Card |", "|---|---|---|---|", ...rows].join("\n");

   const start = "<!-- library:index -->";
   const end = "<!-- /library:index -->";
   const block = `${start}\n${table}\n${end}`;
   if (text.includes(start) && text.includes(end)) {
      const startAt = text.indexOf(start);
      const endAt = text.indexOf(end) + end.length;
      text = text.slice(0, startAt) + block + text.slice(endAt);
   } else {
      const heading = text.indexOf("## Shelves");
      if (heading >= 0) {
         const afterHeading = text.indexOf("\n", heading) + 1;
         const nextSection = text.indexOf("\n## ", afterHeading);
         const tail = nextSection >= 0 ? text.slice(nextSection) : "";
         text = `${text.slice(0, afterHeading)}\n${block}\n${tail}`;
      } else {
         text = `${text.trimEnd()}\n\n## Shelves\n\n${block}\n`;
      }
   }
   await vscode.workspace.fs.writeFile(readme, Buffer.from(text, "utf8"));
   vscode.window.setStatusBarMessage("Library: README index rebuilt", 3000);
}

// ---------------------------------------------------------------------------
// Status bar: shows where the active file sits in the library.
// ---------------------------------------------------------------------------

function updateStatus(status: vscode.StatusBarItem, catalog: Catalog): void {
   const uri = vscode.window.activeTextEditor?.document.uri;
   const lesson = uri ? catalog.lessonFor(uri) : undefined;
   if (!lesson) {
      status.hide();
      return;
   }
   const itemLabel = lesson.item ? `${lesson.item} ` : "";
   status.text = `$(library) ${lesson.shelfNumber} ${catalog.shelfName(lesson.shelfKey)} / ${itemLabel}${lesson.title}`;
   status.tooltip = `Level ${lesson.level}. Click to browse the library.`;
   status.show();
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export async function activate(context: vscode.ExtensionContext): Promise<void> {
   const catalog = new Catalog();
   const tree = new LibraryTree(catalog);
   const decorations = new ShelfDecorations(catalog);

   const saved = context.workspaceState.get<Partial<ViewOptions>>(OPTIONS_KEY);
   tree.options = { ...DEFAULT_OPTIONS, ...saved };

   const view = vscode.window.createTreeView("libraryShelves", { treeDataProvider: tree, showCollapseAll: true });
   view.description = describeOptions(tree.options);

   const applyOptions = () => {
      void context.workspaceState.update(OPTIONS_KEY, tree.options);
      view.description = describeOptions(tree.options);
      tree.refresh();
   };

   const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
   status.command = "library.browse";

   let rescanTimer: NodeJS.Timeout | undefined;
   const scheduleScan = () => {
      if (rescanTimer) {
         clearTimeout(rescanTimer);
      }
      rescanTimer = setTimeout(() => void catalog.scan(), 250);
   };
   const watcher = vscode.workspace.createFileSystemWatcher("**/*.{cs,md}");
   watcher.onDidCreate(scheduleScan);
   watcher.onDidDelete(scheduleScan);
   watcher.onDidChange(scheduleScan);

   context.subscriptions.push(
      watcher,
      status,
      view,
      vscode.window.registerFileDecorationProvider(decorations),
      vscode.window.onDidChangeActiveTextEditor(() => updateStatus(status, catalog)),
      catalog.onDidChange(() => updateStatus(status, catalog)),
      vscode.commands.registerCommand("library.refresh", () => catalog.scan()),
      vscode.commands.registerCommand("library.browse", () => browse(catalog)),
      vscode.commands.registerCommand("library.groupBy", () => chooseGroup(tree, applyOptions)),
      vscode.commands.registerCommand("library.sortBy", () => chooseSort(tree, applyOptions)),
      vscode.commands.registerCommand("library.toggleReverse", () => {
         tree.options.reverse = !tree.options.reverse;
         applyOptions();
      }),
      vscode.commands.registerCommand("library.resetView", () => {
         tree.options = { ...DEFAULT_OPTIONS };
         applyOptions();
      }),
      vscode.commands.registerCommand("library.newShelf", () => newShelf(catalog)),
      vscode.commands.registerCommand("library.newLesson", (node?: Node) => {
         const shelf = node?.kind === "group" ? node.group.shelf : undefined;
         return newLesson(catalog, shelf);
      }),
      vscode.commands.registerCommand("library.runLesson", (target?: Node | vscode.Uri) => runLesson(target)),
      vscode.commands.registerCommand("library.openCard", (node?: Node) => {
         if (node?.kind === "group" && node.group.shelf?.cardUri) {
            void vscode.window.showTextDocument(node.group.shelf.cardUri);
         }
      }),
      vscode.commands.registerCommand("library.rebuildIndex", () => rebuildIndex(catalog)),
   );

   await catalog.scan();
}

export function deactivate(): void {}
