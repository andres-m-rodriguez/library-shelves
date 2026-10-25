import * as path from "path";
import * as vscode from "vscode";
import type { Card, Category, Day, HoverAction, HoverRef, Lesson, Node } from "../contracts";
import { dayLabel, longDate } from "../dates";

export const HOVER_ACTION_COMMAND = "library.hoverAction";

const EXCERPT_LINES = 8;
const EXCERPT_CHARS = 320;
const CODE_LANGUAGES: Record<string, string> = {
   ".cs": "csharp",
   ".ts": "typescript",
   ".js": "javascript",
   ".py": "python",
   ".md": "markdown",
   ".json": "jsonc",
   ".html": "html",
   ".css": "css",
   ".zig": "zig",
};

interface Excerpt {
   mtime: number;
   text: string;
}

export class HoverCards {
   private readonly excerpts = new Map<string, Excerpt>();

   async build(node: Node): Promise<vscode.MarkdownString> {
      switch (node.kind) {
         case "lesson":
            return this.lesson(node.lesson);
         case "card":
            return this.card(node.card);
         case "category":
            return this.category(node.category);
         case "day":
            return this.day(node.day);
      }
   }

   private async lesson(lesson: Lesson): Promise<vscode.MarkdownString> {
      const { meta, card } = lesson;
      const ref: HoverRef = { kind: "lesson", json: card.jsonUri.fsPath, cardKey: card.key, name: meta.name };
      const md = markdown();

      const heading = meta.title ? `**${escape(meta.title)}**` : `**${escape(path.basename(meta.name))}**`;
      md.appendMarkdown(`$(file-code) ${heading}`);
      if (meta.title) {
         md.appendMarkdown(`  \n${escape(meta.name)}`);
      }
      if (meta.description) {
         md.appendMarkdown(`\n\n${escape(meta.description)}`);
      }

      const facts: string[] = [`$(book) ${escape(card.name)}`];
      if (card.meta.category) {
         facts.push(`$(folder) ${escape(card.meta.category)}`);
      }
      md.appendMarkdown(`\n\n${facts.join(" &nbsp; ")}`);

      const details: string[] = [];
      if (meta.tags?.length) {
         const chips = meta.tags.map((tag) => `$(tag) ${escape(tag)}`);
         details.push(chips.join(" &nbsp; "));
      }
      const when: string[] = [];
      if (meta.date) {
         when.push(`$(calendar) ${longDate(meta.date)}`);
      } else {
         when.push(`$(calendar) ${dayLabel(lesson.day)} (file date)`);
      }
      if (meta.color) {
         when.push(`$(symbol-color) ${escape(meta.color)}`);
      }
      if (meta.order !== undefined) {
         when.push(`$(list-ordered) ${meta.order}`);
      }
      details.push(when.join(" &nbsp; "));
      md.appendMarkdown(`  \n${details.join("  \n")}`);

      const code = await this.excerpt(lesson.uri);
      if (code) {
         const language = CODE_LANGUAGES[path.extname(lesson.uri.fsPath).toLowerCase()] ?? "";
         md.appendMarkdown("\n\n");
         md.appendCodeblock(code, language);
      }

      const links = [
         link("$(play) Run", "run", ref),
         link("$(go-to-file) Open", "open", ref),
         link("$(edit) Edit Details", "editDetails", ref),
         link("$(book) Open Card", "openCard", ref),
         link("$(symbol-color) Color", "setColor", ref),
      ];
      md.appendMarkdown(`\n\n---\n\n${links.join(" · ")}`);
      return md;
   }

   private async card(card: Card): Promise<vscode.MarkdownString> {
      const { meta } = card;
      const ref: HoverRef = { kind: "card", json: card.jsonUri.fsPath, key: card.key };
      const md = markdown();

      md.appendMarkdown(`$(book) **${escape(card.name)}**`);
      if (meta.title) {
         md.appendMarkdown(` &nbsp; ${escape(meta.title)}`);
      }
      if (meta.description) {
         md.appendMarkdown(`\n\n${escape(meta.description)}`);
      }

      const facts: string[] = [];
      if (meta.category) {
         facts.push(`$(folder) ${escape(meta.category)}`);
      }
      facts.push(`$(list-unordered) ${plural(card.lessons.length, "lesson")}`);
      if (meta.icon) {
         facts.push(`$(symbol-misc) ${escape(meta.icon)}`);
      }
      if (meta.color) {
         facts.push(`$(symbol-color) ${escape(meta.color)}`);
      }
      if (meta.order !== undefined) {
         facts.push(`$(list-ordered) ${meta.order}`);
      }
      md.appendMarkdown(`\n\n${facts.join(" &nbsp; ")}`);

      const excerpt = await this.excerpt(card.uri);
      if (excerpt) {
         const quoted = excerpt
            .split("\n")
            .filter((line) => !line.startsWith("# "))
            .map((line) => `> ${escape(line)}`)
            .join("\n");
         if (quoted) {
            md.appendMarkdown(`\n\n${quoted}`);
         }
      }

      const links = [
         link("$(go-to-file) Open", "open", ref),
         link("$(add) Add Lesson", "addLesson", ref),
         link("$(edit) Edit Details", "editDetails", ref),
         link("$(folder) Move", "moveToCategory", ref),
         link("$(symbol-misc) Icon", "setIcon", ref),
         link("$(symbol-color) Color", "setColor", ref),
      ];
      md.appendMarkdown(`\n\n---\n\n${links.join(" · ")}`);
      return md;
   }

   private category(category: Category): vscode.MarkdownString {
      const { meta } = category;
      const ref: HoverRef = { kind: "category", json: category.jsonUri.fsPath, name: category.name };
      const md = markdown();

      md.appendMarkdown(`$(folder) **${escape(category.name)}**`);
      if (meta.description) {
         md.appendMarkdown(`\n\n${escape(meta.description)}`);
      }
      const lessonCount = category.cards.reduce((sum, card) => sum + card.lessons.length, 0);
      const facts: string[] = [`$(book) ${plural(category.cards.length, "card")}`, `$(list-unordered) ${plural(lessonCount, "lesson")}`];
      if (meta.icon) {
         facts.push(`$(symbol-misc) ${escape(meta.icon)}`);
      }
      if (meta.color) {
         facts.push(`$(symbol-color) ${escape(meta.color)}`);
      }
      if (meta.order !== undefined) {
         facts.push(`$(list-ordered) ${meta.order}`);
      }
      md.appendMarkdown(`\n\n${facts.join(" &nbsp; ")}`);

      if (category.cards.length) {
         const names = category.cards.map((card) => escape(card.name)).join(", ");
         md.appendMarkdown(`\n\n${names}`);
      }

      const links = [
         link("$(add) Add Card", "addCard", ref),
         link("$(new-file) New Card File", "newCardFile", ref),
         link("$(edit) Rename", "rename", ref),
         link("$(symbol-misc) Icon", "setIcon", ref),
         link("$(symbol-color) Color", "setColor", ref),
      ];
      md.appendMarkdown(`\n\n---\n\n${links.join(" · ")}`);
      return md;
   }

   private day(day: Day): vscode.MarkdownString {
      const md = markdown();
      md.appendMarkdown(`$(calendar) **${dayLabel(day.key)}**`);
      if (dayLabel(day.key) !== longDate(day.key)) {
         md.appendMarkdown(` &nbsp; ${longDate(day.key)}`);
      }
      md.appendMarkdown(`\n\n${plural(day.lessons.length, "lesson")}`);
      const names = day.lessons.map((lesson) => `${escape(lesson.card.name)} / ${escape(path.basename(lesson.meta.name))}`);
      if (names.length) {
         md.appendMarkdown(`  \n${names.slice(0, 6).join("  \n")}`);
         if (names.length > 6) {
            md.appendMarkdown(`  \nand ${names.length - 6} more`);
         }
      }
      md.appendMarkdown("\n\n---\n\nDrop a lesson here to set its date.");
      return md;
   }

   private async excerpt(uri: vscode.Uri): Promise<string | undefined> {
      let stat: vscode.FileStat;
      try {
         stat = await vscode.workspace.fs.stat(uri);
      } catch {
         return undefined;
      }
      const cached = this.excerpts.get(uri.fsPath);
      if (cached && cached.mtime === stat.mtime) {
         return cached.text;
      }
      let text: string;
      try {
         const bytes = await vscode.workspace.fs.readFile(uri);
         text = Buffer.from(bytes).toString("utf8");
      } catch {
         return undefined;
      }
      const lines = text.split(/\r?\n/);
      const firstContent = lines.findIndex((line) => line.trim() !== "");
      const picked = firstContent < 0 ? [] : lines.slice(firstContent, firstContent + EXCERPT_LINES);
      let excerpt = picked.join("\n");
      if (excerpt.length > EXCERPT_CHARS) {
         excerpt = `${excerpt.slice(0, EXCERPT_CHARS)}...`;
      }
      this.excerpts.set(uri.fsPath, { mtime: stat.mtime, text: excerpt });
      return excerpt;
   }
}

function markdown(): vscode.MarkdownString {
   const md = new vscode.MarkdownString(undefined, true);

   md.isTrusted = { enabledCommands: [HOVER_ACTION_COMMAND] };
   return md;
}

function link(label: string, action: HoverAction, ref: HoverRef): string {
   const args = encodeURIComponent(JSON.stringify([action, ref]));
   return `[${label}](command:${HOVER_ACTION_COMMAND}?${args})`;
}

function escape(text: string): string {
   return text.replace(/([\\`*_{}[\]()#+!|<>])/g, "\\$1");
}

function plural(count: number, word: string): string {
   return `${count} ${word}${count === 1 ? "" : "s"}`;
}
