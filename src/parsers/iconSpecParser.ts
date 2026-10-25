import type { IconSpec } from "../contracts";

const CODICON_RE = /^\$\(([a-z0-9-]+)\)$/i;

export class IconSpecParser {
   parse(raw: string | undefined): IconSpec | undefined {
      const text = raw?.trim();
      if (!text) {
         return undefined;
      }
      const codicon = CODICON_RE.exec(text);
      if (codicon) {
         return { kind: "codicon", name: codicon[1] };
      }
      return { kind: "theme", id: text };
   }

   format(spec: IconSpec): string {
      return spec.kind === "codicon" ? `$(${spec.name})` : spec.id;
   }
}
