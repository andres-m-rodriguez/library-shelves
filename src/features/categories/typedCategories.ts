import * as path from "path";
import * as vscode from "vscode";
import { applyEdits, getLocation, modify, type Edit, type ModificationOptions, type Node as JsonNode } from "jsonc-parser";
import { CATEGORIES_KEY, type DeclaredCategory, LIBRARY_FILE, type LibraryOutline, SCHEMA_KEY } from "../../contracts";
import type { FeatureContext } from "../../extension";
import { FORMAT } from "../../library/jsonDocument";
import { compact, map, none, option, some, type Option } from "../../option";
import { parsers } from "../../parsers";

const SOURCE = "library";
const UNDECLARED_CODE = "undeclared-category";
const CHECK_COMMAND = "library.checkCategories";
const DEBOUNCE_MS = 300;

const SELECTOR: vscode.DocumentSelector = [
   { language: "jsonc", pattern: `**/${LIBRARY_FILE}` },
   { language: "json", pattern: `**/${LIBRARY_FILE}` },
];

export function registerTypedCategories(ctx: FeatureContext): void {
   const collection = vscode.languages.createDiagnosticCollection(SOURCE);
   const diagnostics = new CategoryDiagnostics(collection);
   const completions = new CategoryCompletions();
   const quickFix = new DeclareCategoryFix();
   for (const document of vscode.workspace.textDocuments) {
      diagnostics.refresh(document);
   }
   ctx.context.subscriptions.push(
      collection,
      diagnostics,
      vscode.languages.registerCompletionItemProvider(SELECTOR, completions, "\""),
      vscode.languages.registerCodeActionsProvider(SELECTOR, quickFix, DeclareCategoryFix.metadata),
      vscode.workspace.onDidOpenTextDocument((document) => diagnostics.refresh(document)),
      vscode.workspace.onDidChangeTextDocument((event) => diagnostics.schedule(event.document)),
      vscode.workspace.onDidSaveTextDocument((document) => diagnostics.refresh(document)),
      vscode.workspace.onDidCloseTextDocument((document) => diagnostics.clear(document)),
      vscode.commands.registerCommand(CHECK_COMMAND, () => checkAll(ctx, diagnostics)),
   );
}

function isLibraryJson(document: vscode.TextDocument): boolean {
   const isJson = document.languageId === "json" || document.languageId === "jsonc";
   return isJson && path.basename(document.uri.path).toLowerCase() === LIBRARY_FILE;
}

function rangeOf(document: vscode.TextDocument, node: JsonNode): vscode.Range {
   return new vscode.Range(document.positionAt(node.offset), document.positionAt(node.offset + node.length));
}

function stringRangeAt(document: vscode.TextDocument, node: Option<JsonNode>, offset: number): Option<vscode.Range> {
   if (!node.some || node.value.type !== "string") {
      return none;
   }
   const inside = offset >= node.value.offset && offset <= node.value.offset + node.value.length;
   return inside ? some(rangeOf(document, node.value)) : none;
}

class CategoryCompletions implements vscode.CompletionItemProvider {
   provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
      if (!isLibraryJson(document)) {
         return [];
      }
      const text = document.getText();
      const offset = document.offsetAt(position);
      const location = getLocation(text, offset);
      if (location.isAtPropertyKey) {
         return [];
      }
      const replace = stringRangeAt(document, option(location.previousNode), offset);
      if (parsers.outline.isCardCategoryPath(location.path)) {
         return parsers.outline.parse(text).declared.map((category, index) => categoryItem(category, index, replace));
      }
      if (location.path[location.path.length - 1] === "color") {
         return parsers.color.names().map((name) => colorItem(name, replace));
      }

      return [];
   }
}

function quotedItem(label: string, kind: vscode.CompletionItemKind, replace: Option<vscode.Range>): vscode.CompletionItem {
   const item = new vscode.CompletionItem(label, kind);

   item.insertText = JSON.stringify(label);
   item.filterText = JSON.stringify(label);
   if (replace.some) {
      item.range = replace.value;
   }
   return item;
}

function categoryItem(category: DeclaredCategory, index: number, replace: Option<vscode.Range>): vscode.CompletionItem {
   const item = quotedItem(category.name, vscode.CompletionItemKind.EnumMember, replace);
   item.detail = `declared in ${CATEGORIES_KEY}`;
   const facts = compact([
      option(category.description),
      map(option(category.icon), (icon) => `Icon: ${icon}`),
      map(option(category.color), (color) => `Color: ${color}`),
   ]);
   if (facts.length) {
      item.documentation = new vscode.MarkdownString(facts.join("  \n"));
   }

   item.sortText = `0_${String(index).padStart(3, "0")}`;
   item.preselect = index === 0;
   return item;
}

function colorItem(name: string, replace: Option<vscode.Range>): vscode.CompletionItem {
   const item = quotedItem(name, vscode.CompletionItemKind.Color, replace);
   item.detail = parsers.color.themeId(name);
   return item;
}

class CategoryDiagnostics implements vscode.Disposable {
   private readonly timers = new Map<string, NodeJS.Timeout>();

   constructor(private readonly collection: vscode.DiagnosticCollection) {}

   schedule(document: vscode.TextDocument): void {
      if (!isLibraryJson(document)) {
         return;
      }
      const key = document.uri.toString();
      this.cancel(key);
      this.timers.set(
         key,
         setTimeout(() => {
            this.timers.delete(key);
            this.refresh(document);
         }, DEBOUNCE_MS),
      );
   }

   refresh(document: vscode.TextDocument): number {
      if (!isLibraryJson(document)) {
         return 0;
      }
      const outline = parsers.outline.parse(document.getText());
      const diagnostics = parsers.outline.undeclaredCards(outline).map((card) => {
         const message = `Category "${card.value}" is not declared in ${CATEGORIES_KEY}.`;
         const diagnostic = new vscode.Diagnostic(rangeOf(document, card.valueNode), message, vscode.DiagnosticSeverity.Warning);
         diagnostic.source = SOURCE;
         diagnostic.code = UNDECLARED_CODE;
         return diagnostic;
      });
      this.collection.set(document.uri, diagnostics);
      return diagnostics.length;
   }

   clear(document: vscode.TextDocument): void {
      this.cancel(document.uri.toString());
      this.collection.delete(document.uri);
   }

   dispose(): void {
      for (const timer of this.timers.values()) {
         clearTimeout(timer);
      }
      this.timers.clear();
   }

   private cancel(key: string): void {
      const pending = option(this.timers.get(key));
      if (pending.some) {
         clearTimeout(pending.value);
         this.timers.delete(key);
      }
   }
}

class DeclareCategoryFix implements vscode.CodeActionProvider {
   static readonly metadata: vscode.CodeActionProviderMetadata = {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
   };

   provideCodeActions(document: vscode.TextDocument, _range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext): vscode.CodeAction[] {
      if (!isLibraryJson(document)) {
         return [];
      }
      const ours = context.diagnostics.filter((d) => d.source === SOURCE && d.code === UNDECLARED_CODE);
      if (!ours.length) {
         return [];
      }
      const outline = parsers.outline.parse(document.getText());
      const actions: vscode.CodeAction[] = [];
      const seen = new Set<string>();
      for (const diagnostic of ours) {
         const name = categoryNameIn(document, diagnostic.range);
         if (name.some && !seen.has(name.value)) {
            seen.add(name.value);
            actions.push(declareOne(document, outline, name.value, diagnostic));
         }
      }
      const allNames = [...new Set(parsers.outline.undeclaredCards(outline).map((card) => card.value))];
      if (allNames.length > 1) {
         actions.push(declareAll(document, outline, allNames));
      }
      return actions;
   }
}

function categoryNameIn(document: vscode.TextDocument, range: vscode.Range): Option<string> {
   try {
      const value: unknown = JSON.parse(document.getText(range));
      return typeof value === "string" ? some(value) : none;
   } catch {
      return none;
   }
}

function modificationOptions(document: vscode.TextDocument, outline: LibraryOutline): ModificationOptions {
   const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
   const options: ModificationOptions = { formattingOptions: { ...FORMAT.formattingOptions, eol } };
   if (!option(outline.categoriesNode).some) {
      options.getInsertionIndex = (properties) => (properties[0] === SCHEMA_KEY ? 1 : 0);
   }
   return options;
}

function declareEdits(text: string, document: vscode.TextDocument, outline: LibraryOutline, name: string): Edit[] {
   return modify(text, [CATEGORIES_KEY, name], {}, modificationOptions(document, outline));
}

function toTextEdit(document: vscode.TextDocument, edit: Edit): vscode.TextEdit {
   const range = new vscode.Range(document.positionAt(edit.offset), document.positionAt(edit.offset + edit.length));
   return new vscode.TextEdit(range, edit.content);
}

function declareOne(document: vscode.TextDocument, outline: LibraryOutline, name: string, diagnostic: vscode.Diagnostic): vscode.CodeAction {
   const action = new vscode.CodeAction(`Declare category "${name}" in ${CATEGORIES_KEY}`, vscode.CodeActionKind.QuickFix);
   action.diagnostics = [diagnostic];
   action.isPreferred = true;
   action.edit = new vscode.WorkspaceEdit();
   action.edit.set(
      document.uri,
      declareEdits(document.getText(), document, outline, name).map((edit) => toTextEdit(document, edit)),
   );
   return action;
}

function declareAll(document: vscode.TextDocument, outline: LibraryOutline, names: string[]): vscode.CodeAction {
   const action = new vscode.CodeAction(`Declare all ${names.length} undeclared categories in ${CATEGORIES_KEY}`, vscode.CodeActionKind.QuickFix);
   const original = document.getText();
   let text = original;
   let current = outline;
   for (const name of names) {
      text = applyEdits(text, declareEdits(text, document, current, name));
      current = parsers.outline.parse(text);
   }
   action.edit = new vscode.WorkspaceEdit();
   const wholeDocument = new vscode.Range(document.positionAt(0), document.positionAt(original.length));
   action.edit.replace(document.uri, wholeDocument, text);
   return action;
}

async function checkAll(ctx: FeatureContext, diagnostics: CategoryDiagnostics): Promise<void> {
   const jsonFiles = await vscode.workspace.findFiles(`**/${LIBRARY_FILE}`, "**/node_modules/**");
   let undeclared = 0;
   let files = 0;
   for (const uri of jsonFiles) {
      try {
         const document = await vscode.workspace.openTextDocument(uri);
         undeclared += diagnostics.refresh(document);
         files += 1;
      } catch {
      }
   }
   if (!files) {
      ctx.dialogs.info(`No ${LIBRARY_FILE} found in the workspace.`);
      return;
   }
   if (!undeclared) {
      ctx.dialogs.info(`Every category is declared in ${CATEGORIES_KEY} (${files} ${LIBRARY_FILE} checked).`);
      return;
   }
   const noun = undeclared === 1 ? "category is" : "categories are";
   const choice = await ctx.dialogs.warn(`${undeclared} ${noun} not declared in ${CATEGORIES_KEY}.`, "Show Problems");
   if (choice.some) {
      await vscode.commands.executeCommand("workbench.actions.view.problems");
   }
}
