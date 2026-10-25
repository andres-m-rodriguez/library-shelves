import * as vscode from "vscode";
import { URI_LIST_MIME } from "../contracts";

export class UriListParser {
   async fromTransfer(dataTransfer: vscode.DataTransfer): Promise<vscode.Uri[]> {
      const item = dataTransfer.get(URI_LIST_MIME);
      if (!item) {
         return [];
      }
      const text = await item.asString();
      return this.parse(text);
   }

   parse(text: string): vscode.Uri[] {
      const uris: vscode.Uri[] = [];
      for (const line of text.split(/\r?\n/)) {
         const trimmed = line.trim();
         if (!trimmed || trimmed.startsWith("#")) {
            continue;
         }
         try {
            const uri = vscode.Uri.parse(trimmed, true);
            if (uri.scheme === "file") {
               uris.push(uri);
            }
         } catch {
         }
      }
      return uris;
   }
}
