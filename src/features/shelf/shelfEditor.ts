import { randomBytes } from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import {
   CARD_STYLE_SETTING,
   type CardStyle,
   DEFAULT_BACKGROUND_DIM,
   DEFAULT_BACKGROUND_FIT,
   DEFAULT_CARD_STYLE,
   DEFAULT_GRAPH_DIRECTION,
   DEFAULT_GRAPH_EDGES,
   type Node,
   type ShelfAction,
   type ShelfBackground,
   type ShelfGraph,
   type ShelfMessage,
   type ShelfRef,
} from "../../contracts";
import type { FeatureContext } from "../../extension";
import { buildShelf, resolveShelfRef } from "../../library/shelf";
import { none, option, orElse, some, type Option } from "../../option";
import { parsers } from "../../parsers";
import { link, resetLayout, savePositions, setGraphOption, unlink } from "./graphEdits";
import { EMPTY_LIBRARY } from "./newLibrary";

type NodeAction = Exclude<ShelfAction, "open" | "run">;

const COMMANDS: Record<NodeAction, string> = {
   newCard: "library.newCard",
   addLesson: "library.addLesson",
   newLessonFile: "library.newLessonFile",
   editDetails: "library.editDetails",
   moveToCategory: "library.moveToCategory",
   setIcon: "library.setIcon",
   setColor: "library.setColor",
   setDependencies: "library.setDependencies",
   renameCategory: "library.renameCategory",
   removeCard: "library.removeCard",
   removeLesson: "library.removeLesson",
   removeCategory: "library.removeCategory",
};

// Shows a library file as shelves of cards. The page only displays the model built from the
// Library tree; every change goes through the same commands the tree uses.
export class ShelfEditor implements vscode.CustomTextEditorProvider {
   constructor(private readonly ctx: FeatureContext) {}

   async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
      const media = vscode.Uri.joinPath(this.ctx.context.extensionUri, "media");
      // The library's own folder is readable too, for the background image.
      const folder = vscode.Uri.file(path.dirname(document.uri.fsPath));
      panel.webview.options = { enableScripts: true, localResourceRoots: [media, folder] };
      panel.webview.html = pageHtml(panel.webview, media);

      const send = () => void panel.webview.postMessage({ type: "model", model: this.model(document, panel.webview) });
      const treeChanged = this.ctx.tree.onDidChangeTreeData(send);
      const settingChanged = vscode.workspace.onDidChangeConfiguration((event) => {
         if (event.affectsConfiguration(`library.${CARD_STYLE_SETTING}`)) {
            send();
         }
      });
      const received = panel.webview.onDidReceiveMessage((raw: unknown) => {
         const message = option(parsers.shelfMessage.parse(raw));
         if (message.some) {
            void this.handle(document, message.value, send);
         }
      });
      panel.onDidDispose(() => {
         treeChanged.dispose();
         settingChanged.dispose();
         received.dispose();
      });

      if (document.uri.scheme === "file" && !document.getText().trim()) {
         await vscode.workspace.fs.writeFile(document.uri, Buffer.from(EMPTY_LIBRARY, "utf8"));
      }
   }

   private model(document: vscode.TextDocument, webview: vscode.Webview): object {
      const shelf = buildShelf(document.uri.fsPath, this.ctx.tree.categories, this.ctx.tree.uncategorized);
      return {
         ...shelf,
         background: this.background(document, webview),
         cardStyle: cardStyleSetting(),
         graph: this.graph(document),
         fileName: path.basename(document.uri.fsPath),
         inWorkspace: option(vscode.workspace.getWorkspaceFolder(document.uri)).some,
      };
   }

   // An empty image means no background. Only files inside the library's folder can be shown.
   private background(document: vscode.TextDocument, webview: vscode.Webview): ShelfBackground {
      const meta = orElse(option(this.ctx.tree.backgrounds.get(document.uri.fsPath.toLowerCase())), {});
      const folder = path.dirname(document.uri.fsPath);
      const image = option(meta.image);
      let shown = "";
      if (image.some) {
         const absolute = path.resolve(folder, image.value);
         const relative = path.relative(folder, absolute);
         if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
            shown = webview.asWebviewUri(vscode.Uri.file(absolute)).toString();
         }
      }
      return {
         image: shown,
         dim: orElse(option(meta.dim), DEFAULT_BACKGROUND_DIM),
         fit: orElse(option(meta.fit), DEFAULT_BACKGROUND_FIT),
      };
   }

   private graph(document: vscode.TextDocument): ShelfGraph {
      const meta = orElse(option(this.ctx.tree.graphs.get(document.uri.fsPath.toLowerCase())), {});
      return {
         direction: orElse(option(meta.direction), DEFAULT_GRAPH_DIRECTION),
         edges: orElse(option(meta.edges), DEFAULT_GRAPH_EDGES),
      };
   }

   private async handle(document: vscode.TextDocument, message: ShelfMessage, send: () => void): Promise<void> {
      switch (message.type) {
         case "ready":
            send();
            return;
         case "newCard":
            await vscode.commands.executeCommand("library.newCard");
            return;
         case "newCategory":
            await vscode.commands.executeCommand("library.newCategory");
            return;
         case "background":
            await vscode.commands.executeCommand("library.setBackground");
            return;
         case "cardStyle":
            await vscode.workspace.getConfiguration("library").update(CARD_STYLE_SETTING, message.style, vscode.ConfigurationTarget.Global);
            return;
         case "openText":
            await vscode.commands.executeCommand("vscode.openWith", document.uri, "default");
            return;
         case "positions":
            await savePositions(this.ctx, document.uri, message.positions);
            return;
         case "resetLayout":
            await resetLayout(this.ctx, document.uri);
            return;
         case "link":
            await link(this.ctx, document.uri, message.prerequisite, message.card);
            return;
         case "unlink":
            await unlink(this.ctx, document.uri, message.prerequisite, message.card);
            return;
         case "graphDirection":
            await setGraphOption(this.ctx, document.uri, "direction", message.value);
            return;
         case "graphEdges":
            await setGraphOption(this.ctx, document.uri, "edges", message.value);
            return;
         case "action":
            await this.act(document, message.action, message.ref);
      }
   }

   private async act(document: vscode.TextDocument, action: ShelfAction, ref: ShelfRef): Promise<void> {
      const { tree } = this.ctx;
      const node = option(resolveShelfRef(document.uri.fsPath, tree.categories, tree.uncategorized, ref));
      if (!node.some) {
         this.ctx.dialogs.info("That item is no longer in the library.");
         return;
      }
      if (action === "open" || action === "run") {
         const uri = fileOf(node.value);
         if (uri.some) {
            await vscode.commands.executeCommand(action === "open" ? "vscode.open" : "library.runLesson", uri.value);
         }
         return;
      }
      await vscode.commands.executeCommand(COMMANDS[action], node.value);
   }
}

function cardStyleSetting(): CardStyle {
   const raw: unknown = vscode.workspace.getConfiguration("library").get(CARD_STYLE_SETTING);
   return orElse(option(parsers.shelfMessage.cardStyle(raw)), DEFAULT_CARD_STYLE);
}

function fileOf(node: Node): Option<vscode.Uri> {
   switch (node.kind) {
      case "lesson":
         return some(node.lesson.uri);
      case "card":
         return some(node.card.uri);
      default:
         return none;
   }
}

function pageHtml(webview: vscode.Webview, media: vscode.Uri): string {
   const script = webview.asWebviewUri(vscode.Uri.joinPath(media, "shelf.js")).toString();
   const graphScript = webview.asWebviewUri(vscode.Uri.joinPath(media, "graph.js")).toString();
   const style = webview.asWebviewUri(vscode.Uri.joinPath(media, "shelf.css")).toString();
   const nonce = randomBytes(16).toString("hex");
   return `<!DOCTYPE html>
<html lang="en">
<head>
   <meta charset="UTF-8">
   <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   <link href="${style}" rel="stylesheet">
</head>
<body>
   <header id="toolbar">
      <div id="pages" role="tablist" aria-label="Page">
         <button id="page-shelves" role="tab">Shelves</button>
         <button id="page-graph" role="tab">Graph</button>
      </div>
      <input id="search" type="text" placeholder="Search cards and lessons" spellcheck="false" aria-label="Search cards and lessons">
      <button id="filter" title="Filter the shelves" aria-label="Filter the shelves" aria-haspopup="true" aria-expanded="false">
         <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1.5 2h13L9.5 8.2V13l-3 1.5V8.2z"/></svg>
         <span id="filter-count"></span>
      </button>
      <select id="card-style" title="How the cards look" aria-label="How the cards look">
         <option value="classic">Classic cards</option>
         <option value="reveal">Reveal on hover</option>
         <option value="cover">Book covers</option>
      </select>
      <span id="count"></span>
      <span class="spacer"></span>
      <button id="new-card" class="primary">New Card</button>
      <button id="new-category">New Category</button>
      <button id="background" title="Set a picture or an animated GIF behind the shelves">Background</button>
      <button id="open-text" title="Open this library as text">Edit as Text</button>
   </header>
   <div id="filter-bar" hidden></div>
   <main id="shelves"></main>
   <div id="filter-panel" role="dialog" aria-label="Filter the shelves" hidden></div>
   <div id="menu" role="menu" hidden></div>
   <script nonce="${nonce}" src="${graphScript}"></script>
   <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
