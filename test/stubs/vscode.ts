export class Uri {
   readonly scheme: string;
   readonly path: string;
   readonly fsPath: string;

   private constructor(scheme: string, path: string, fsPath: string) {
      this.scheme = scheme;
      this.path = path;
      this.fsPath = fsPath;
   }

   static file(fsPath: string): Uri {
      const path = fsPath.replace(/\\/g, "/");
      return new Uri("file", path, fsPath);
   }

   static parse(value: string): Uri {
      const separator = value.indexOf("://");
      if (separator < 0) {
         return Uri.file(value);
      }
      const scheme = value.slice(0, separator);
      const path = value.slice(separator + 3);
      return new Uri(scheme, path, path);
   }

   static joinPath(base: Uri, ...segments: string[]): Uri {
      const joined = [base.path, ...segments].join("/").replace(/\/+/g, "/");
      return new Uri(base.scheme, joined, joined);
   }

   with(change: { scheme?: string; path?: string }): Uri {
      const scheme = change.scheme === undefined ? this.scheme : change.scheme;
      const path = change.path === undefined ? this.path : change.path;
      return new Uri(scheme, path, path);
   }

   toString(): string {
      return `${this.scheme}://${this.path}`;
   }
}

export class MarkdownString {
   value: string;
   isTrusted: boolean | { readonly enabledCommands: readonly string[] } | undefined;
   supportHtml: boolean | undefined;
   supportThemeIcons: boolean | undefined;

   constructor(value?: string, supportThemeIcons?: boolean) {
      this.value = value === undefined ? "" : value;
      this.supportThemeIcons = supportThemeIcons;
   }

   appendMarkdown(text: string): MarkdownString {
      this.value += text;
      return this;
   }

   appendText(text: string): MarkdownString {
      const escaped = text.replace(/[\\`*_{}[\]()#+\-!~]/g, "\\$&");
      const lineBreak = this.supportHtml ? "<br>" : "\n\n";
      this.value += escaped.replace(/\n/g, lineBreak);
      return this;
   }

   appendCodeblock(code: string, language?: string): MarkdownString {
      const fence = language === undefined ? "" : language;
      this.value += "\n```" + fence + "\n" + code + "\n```\n";
      return this;
   }
}

export class ThemeColor {
   readonly id: string;

   constructor(id: string) {
      this.id = id;
   }
}

export class ThemeIcon {
   readonly id: string;
   readonly color: ThemeColor | undefined;

   constructor(id: string, color?: ThemeColor) {
      this.id = id;
      this.color = color;
   }
}

export enum TreeItemCollapsibleState {
   None = 0,
   Collapsed = 1,
   Expanded = 2,
}

export class TreeItem {
   label: string | { label: string } | undefined;
   collapsibleState: TreeItemCollapsibleState;
   id: string | undefined;
   description: string | boolean | undefined;
   tooltip: string | MarkdownString | undefined;
   iconPath: unknown;
   contextValue: string | undefined;
   command: unknown;
   resourceUri: Uri | undefined;

   constructor(label?: string | { label: string }, collapsibleState?: TreeItemCollapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState === undefined ? TreeItemCollapsibleState.None : collapsibleState;
   }
}

export enum QuickPickItemKind {
   Separator = -1,
   Default = 0,
}

export enum FileType {
   Unknown = 0,
   File = 1,
   Directory = 2,
   SymbolicLink = 64,
}

export class Disposable {
   private readonly onDispose: () => void;

   constructor(onDispose: () => void) {
      this.onDispose = onDispose;
   }

   dispose(): void {
      this.onDispose();
   }
}

export class EventEmitter<T> {
   private readonly listeners = new Set<(value: T) => void>();

   readonly event = (listener: (value: T) => void): Disposable => {
      this.listeners.add(listener);
      return new Disposable(() => {
         this.listeners.delete(listener);
      });
   };

   fire(value: T): void {
      for (const listener of this.listeners) {
         listener(value);
      }
   }

   dispose(): void {
      this.listeners.clear();
   }
}

export interface FileStat {
   type: FileType;
   ctime: number;
   mtime: number;
   size: number;
}

interface StoredFile {
   text: string;
   mtime: number;
}

const files = new Map<string, StoredFile>();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function seedFile(fsPath: string, text: string, mtime?: number): void {
   const stamp = mtime === undefined ? Date.now() : mtime;
   files.set(fsPath, { text, mtime: stamp });
}

export function resetFiles(): void {
   files.clear();
}

export function fileText(fsPath: string): string | undefined {
   const stored = files.get(fsPath);
   return stored === undefined ? undefined : stored.text;
}

function missing(uri: Uri): Error {
   const error = new Error(`file not found: ${uri.fsPath}`);
   return Object.assign(error, { code: "FileNotFound" });
}

const fs = {
   async stat(uri: Uri): Promise<FileStat> {
      const stored = files.get(uri.fsPath);
      if (stored === undefined) {
         throw missing(uri);
      }
      const size = encoder.encode(stored.text).byteLength;
      return { type: FileType.File, ctime: stored.mtime, mtime: stored.mtime, size };
   },

   async readFile(uri: Uri): Promise<Uint8Array> {
      const stored = files.get(uri.fsPath);
      if (stored === undefined) {
         throw missing(uri);
      }
      return encoder.encode(stored.text);
   },

   async writeFile(uri: Uri, bytes: Uint8Array): Promise<void> {
      const text = decoder.decode(bytes);
      files.set(uri.fsPath, { text, mtime: Date.now() });
   },

   async delete(uri: Uri): Promise<void> {
      files.delete(uri.fsPath);
   },
};

export const workspace = {
   fs,
   workspaceFolders: undefined as { uri: Uri; name: string; index: number }[] | undefined,
};

async function noMessage(): Promise<undefined> {
   return undefined;
}

export const window = {
   showInformationMessage: noMessage,
   showWarningMessage: noMessage,
   showErrorMessage: noMessage,
};

export const commands = {
   async executeCommand(): Promise<undefined> {
      return undefined;
   },
   registerCommand(): Disposable {
      return new Disposable(() => undefined);
   },
};
