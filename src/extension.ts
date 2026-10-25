import * as vscode from "vscode";
import { LIBRARY_FILE, type Node, type ViewMode } from "./contracts";
import { register as registerCards } from "./features/cards";
import { register as registerCategories } from "./features/categories";
import { register as registerFilter } from "./features/filter";
import { register as registerHover } from "./features/hover";
import { register as registerLessons } from "./features/lessons";
import { register as registerRows } from "./features/rows";
import { register as registerView } from "./features/view";
import { applyRenames } from "./library/files";
import { loadIconCatalog } from "./library/icons";
import { SCHEMA_SCHEME, SchemaProvider } from "./library/schema";
import { createServices, type Services } from "./services";
import { LibraryTree } from "./tree/libraryTree";
import { viewModeLabel } from "./tree/viewModes";

const MODE_KEY = "library.viewMode";

export interface FeatureContext extends Services {
   context: vscode.ExtensionContext;
   tree: LibraryTree;
   view: vscode.TreeView<Node>;

   reload: () => Promise<void>;

   setMode: (mode: ViewMode) => void;

   setSubtitle: (key: string, text: string) => void;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
   const tree = new LibraryTree();
   const schema = new SchemaProvider(context.extensionUri, () => tree.icons);
   tree.mode = context.workspaceState.get<ViewMode>(MODE_KEY) ?? "category";

   let timer: NodeJS.Timeout | undefined;
   const scheduleLoad = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void tree.load(), 200);
   };
   const watcher = vscode.workspace.createFileSystemWatcher(`**/${LIBRARY_FILE}`);
   watcher.onDidCreate(scheduleLoad);
   watcher.onDidChange(scheduleLoad);
   watcher.onDidDelete(scheduleLoad);

   const view = vscode.window.createTreeView("libraryShelves", {
      treeDataProvider: tree,
      dragAndDropController: tree,
      canSelectMany: true,
   });

   const subtitleParts = new Map<string, string>();
   const updateDescription = () => {
      const mode = tree.mode === "category" ? "" : `by ${viewModeLabel(tree.mode).toLowerCase()}`;
      view.description = [mode, ...subtitleParts.values()].filter(Boolean).join(" · ");
   };
   const applyMode = () => {
      void context.workspaceState.update(MODE_KEY, tree.mode);
      updateDescription();
      void tree.load();
   };
   const reload = async () => {
      tree.icons = await loadIconCatalog();
      schema.refresh();
      await tree.load();
   };

   context.subscriptions.push(
      watcher,
      view,
      vscode.window.registerFileDecorationProvider(tree),
      vscode.workspace.registerTextDocumentContentProvider(SCHEMA_SCHEME, schema),
      vscode.workspace.onDidChangeConfiguration((e) => {
         if (e.affectsConfiguration("workbench.iconTheme")) {
            void reload();
         }
      }),

      vscode.workspace.onDidRenameFiles((event) => void applyRenames(event.files)),
   );

   const ctx: FeatureContext = {
      ...createServices(view),
      context,
      tree,
      view,
      reload,
      setMode: (mode) => {
         tree.mode = mode;
         applyMode();
      },
      setSubtitle: (key, text) => {
         if (text) {
            subtitleParts.set(key, text);
         } else {
            subtitleParts.delete(key);
         }
         updateDescription();
      },
   };

   registerView(ctx);
   registerFilter(ctx);
   registerLessons(ctx);
   registerCards(ctx);
   registerCategories(ctx);
   registerRows(ctx);
   registerHover(ctx);

   applyMode();
   await reload();
}

export function deactivate(): void {}
