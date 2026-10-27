import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import * as vscode from "vscode";
import { resetFiles, seedFile } from "../stubs/vscode";

afterEach(() => {
   resetFiles();
});

test("seedFile and workspace.fs.readFile round-trip through the vscode alias", async () => {
   seedFile("C:/library/notes.md", "# Notes\nhello", 42);
   const uri = vscode.Uri.file("C:/library/notes.md");
   const bytes = await vscode.workspace.fs.readFile(uri);
   const text = new TextDecoder().decode(bytes);
   assert.equal(text, "# Notes\nhello");
   const stat = await vscode.workspace.fs.stat(uri);
   assert.equal(stat.mtime, 42);
});

test("stat rejects for a file that was never seeded", async () => {
   const uri = vscode.Uri.file("C:/library/missing.md");
   const statMissing = async () => {
      await vscode.workspace.fs.stat(uri);
   };
   await assert.rejects(statMissing);
});
