import * as path from "path";
import { option, orElse } from "../../option";

const COMMENT_LEADERS: Record<string, [string, string]> = {
   ".py": ["# ", ""],
   ".sh": ["# ", ""],
   ".ps1": ["# ", ""],
   ".yaml": ["# ", ""],
   ".yml": ["# ", ""],
   ".toml": ["# ", ""],
   ".rb": ["# ", ""],
   ".md": ["<!-- ", " -->"],
   ".markdown": ["<!-- ", " -->"],
   ".html": ["<!-- ", " -->"],
   ".xml": ["<!-- ", " -->"],
   ".sql": ["-- ", ""],
   ".lua": ["-- ", ""],
   ".hs": ["-- ", ""],
};

const DEFAULT_LEADER: [string, string] = ["// ", ""];

export function headerFor(fileName: string, partOf: string): string {
   const extension = path.extname(fileName).toLowerCase();
   const [open, close] = orElse(option(COMMENT_LEADERS[extension]), DEFAULT_LEADER);
   return `${open}${fileName}: ${partOf}${close}\n\n`;
}
