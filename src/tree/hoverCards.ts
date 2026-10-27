import * as path from "path";
import * as vscode from "vscode";
import type { Card, Category, Day, HoverAction, HoverRef, Lesson, Node, PreviewConfig } from "../contracts";
import { dayLabel, longDate } from "../dates";
import { actionLabel, lessonActionsFor, showsAnything, visibleActions } from "../library/preview";
import { parsers } from "../parsers";

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

const LESSON_LINKS: HoverAction[] = ["run", "open", "editDetails", "openCard", "setColor", "configurePreview"];
const CARD_LINKS: HoverAction[] = ["open", "addLesson", "editDetails", "moveToCategory", "setIcon", "setColor", "configurePreview"];
const CATEGORY_LINKS: HoverAction[] = ["addCard", "newCardFile", "rename", "setIcon", "setColor", "configurePreview"];

export class HoverCards {
   private readonly excerpts = new Map<string, Excerpt>();

   async build(node: Node, config: PreviewConfig): Promise<vscode.MarkdownString | undefined> {
      if (node.kind === "day") {
         return this.day(node.day);
      }
      if (!showsAnything(config, node.kind)) {
         return undefined;
      }
      switch (node.kind) {
         case "lesson":
            return this.lesson(node.lesson, config);
         case "card":
            return this.card(node.card, config);
         case "category":
            return this.category(node.category, config);
      }
   }

   private async lesson(lesson: Lesson, config: PreviewConfig): Promise<vscode.MarkdownString | undefined> {
      const { meta, card } = lesson;
      const ref: HoverRef = { kind: "lesson", json: card.jsonUri.fsPath, cardKey: card.key, name: meta.name };
      const sections: string[] = [];

      if (config.summary) {
         sections.push(lessonSummary(lesson));
      }

      if (config.code) {
         const code = await this.excerpt(lesson.uri);
         if (code) {
            sections.push(codeBlock(code, languageOf(lesson.uri)));
         }
      }

      const allowed = lessonActionsFor(lesson.uri.fsPath).filter((action) => LESSON_LINKS.includes(action));
      const links = linksFor(allowed, visibleActions(config, "lesson"), ref);
      if (links) {
         sections.push(links);
      }

      return assemble(sections);
   }

   private async card(card: Card, config: PreviewConfig): Promise<vscode.MarkdownString | undefined> {
      const ref: HoverRef = { kind: "card", json: card.jsonUri.fsPath, key: card.key };
      const sections: string[] = [];

      if (config.summary) {
         sections.push(cardSummary(card));
      }

      if (config.code) {
         const excerpt = await this.excerpt(card.uri);
         if (excerpt) {
            const section = parsers.fileName.isMarkdown(card.name) ? quotedMarkdown(excerpt) : codeBlock(excerpt, languageOf(card.uri));
            if (section) {
               sections.push(section);
            }
         }
      }

      const links = linksFor(CARD_LINKS, visibleActions(config, "card"), ref);
      if (links) {
         sections.push(links);
      }

      return assemble(sections);
   }

   private category(category: Category, config: PreviewConfig): vscode.MarkdownString | undefined {
      const ref: HoverRef = { kind: "category", json: category.jsonUri.fsPath, name: category.name };
      const sections: string[] = [];

      if (config.summary) {
         sections.push(categorySummary(category));
      }

      if (config.code && category.cards.length) {
         const names = category.cards.map((card) => escape(card.name)).join(", ");
         sections.push(names);
      }

      const links = linksFor(CATEGORY_LINKS, visibleActions(config, "category"), ref);
      if (links) {
         sections.push(links);
      }

      return assemble(sections);
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

function lessonSummary(lesson: Lesson): string {
   const { meta, card } = lesson;
   const parts: string[] = [];

   const heading = meta.title ? `**${escape(meta.title)}**` : `**${escape(path.basename(meta.name))}**`;
   let head = `$(file-code) ${heading}`;
   if (meta.title) {
      head += `  \n${escape(meta.name)}`;
   }
   parts.push(head);
   if (meta.description) {
      parts.push(escape(meta.description));
   }

   const facts: string[] = [`$(book) ${escape(card.name)}`];
   if (card.meta.category) {
      facts.push(`$(folder) ${escape(card.meta.category)}`);
   }

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
   parts.push(`${facts.join(" &nbsp; ")}  \n${details.join("  \n")}`);

   return parts.join("\n\n");
}

function cardSummary(card: Card): string {
   const { meta } = card;
   const parts: string[] = [];

   let head = `$(book) **${escape(card.name)}**`;
   if (meta.title) {
      head += ` &nbsp; ${escape(meta.title)}`;
   }
   parts.push(head);
   if (meta.description) {
      parts.push(escape(meta.description));
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
   parts.push(facts.join(" &nbsp; "));

   return parts.join("\n\n");
}

function categorySummary(category: Category): string {
   const { meta } = category;
   const parts: string[] = [`$(folder) **${escape(category.name)}**`];

   if (meta.description) {
      parts.push(escape(meta.description));
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
   parts.push(facts.join(" &nbsp; "));

   return parts.join("\n\n");
}

function linksFor(order: HoverAction[], visible: HoverAction[], ref: HoverRef): string | undefined {
   const shown = order.filter((action) => visible.includes(action));
   if (!shown.length) {
      return undefined;
   }
   const links = shown.map((action) => link(actionLabel(action), action, ref));
   return `---\n\n${links.join(" · ")}`;
}

function languageOf(uri: vscode.Uri): string {
   return CODE_LANGUAGES[path.extname(uri.fsPath).toLowerCase()] ?? "";
}

function quotedMarkdown(excerpt: string): string {
   const body = excerpt.split("\n").filter((line) => !line.startsWith("# "));
   const firstText = body.findIndex((line) => line.trim() !== "");
   const kept = firstText < 0 ? [] : body.slice(firstText);
   return kept.map((line) => `> ${escape(line)}`).join("\n");
}

function codeBlock(code: string, language: string): string {
   const runs = [...code.matchAll(/`+/g)].map((run) => run[0].length);
   const longestRun = Math.max(2, ...runs);
   const fence = "`".repeat(longestRun + 1);
   return `${fence}${language}\n${code}\n${fence}`;
}

function assemble(sections: string[]): vscode.MarkdownString | undefined {
   if (!sections.length) {
      return undefined;
   }
   const md = markdown();
   md.appendMarkdown(sections.join("\n\n"));
   return md;
}

function markdown(): vscode.MarkdownString {
   const md = new vscode.MarkdownString(undefined, true);

   md.isTrusted = { enabledCommands: [HOVER_ACTION_COMMAND] };
   return md;
}

function link(label: string, action: HoverAction, ref: HoverRef): string {
   const encoded = encodeURIComponent(JSON.stringify([action, ref]));
   const args = encoded.replace(/[()]/g, (paren) => (paren === "(" ? "%28" : "%29"));
   return `[${label}](command:${HOVER_ACTION_COMMAND}?${args})`;
}

function escape(text: string): string {
   return text.replace(/([\\`*_{}[\]()#+!|<>])/g, "\\$1");
}

function plural(count: number, word: string): string {
   return `${count} ${word}${count === 1 ? "" : "s"}`;
}
