import * as path from "path";

export const RUNNABLE_EXTENSIONS = [".cs"];
export const DEFAULT_LESSON_EXTENSION = ".cs";

export function isRunnable(fsPath: string): boolean {
   const extension = path.extname(fsPath).toLowerCase();
   return RUNNABLE_EXTENSIONS.includes(extension);
}
