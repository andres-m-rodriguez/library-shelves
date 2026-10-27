import * as path from "path";

const MARKDOWN_RE = /\.(md|markdown)$/i;
const INVALID_FILE_CHARS_RE = /[\\/:*?"<>|]/;

export class FileNameParser {
   isMarkdown(name: string): boolean {
      return MARKDOWN_RE.test(name);
   }

   validate(text: string | undefined): string | undefined {
      const trimmed = text?.trim() ?? "";
      if (!trimmed) {
         return "Name cannot be empty";
      }
      if (INVALID_FILE_CHARS_RE.test(trimmed)) {
         return "A file name, without folders or the characters \\ / : * ? \" < > |";
      }
      return undefined;
   }

   withDefaultExtension(text: string, extension: string): string {
      const trimmed = text.trim();
      return path.extname(trimmed) ? trimmed : `${trimmed}${extension}`;
   }

   toRelative(folder: string, absolute: string): string {
      return path.relative(folder, absolute).split(path.sep).join("/");
   }
}
